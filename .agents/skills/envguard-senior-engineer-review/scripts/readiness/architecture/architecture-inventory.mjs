import fs from 'node:fs';
import path from 'node:path';
import { collectProjectFiles } from '../constants.mjs';

/**
 * Builds an architectural inventory and component map from project source code and metadata.
 * Builds on the existing InventoryGraph without duplicating repository discovery.
 *
 * @param {string} projectDir - Absolute or relative path to project root
 * @param {object} inventoryGraph - InventoryGraph returned by buildInventoryGraph()
 * @returns {object} Architectural inventory with components, data flows, and topology type
 */
export function buildArchitectureInventory(projectDir, inventoryGraph) {
  const components = [];
  const dataFlows = [];
  const detectedTechnologies = new Set();

  const files = collectProjectFiles(projectDir, { maxFiles: 1000 });
  const rootPkg = inventoryGraph?.repository?.rootPackageJson || {};
  const allDeps = {
    ...(rootPkg.dependencies || {}),
    ...(rootPkg.devDependencies || {}),
  };

  // Collect dependencies from all sub-applications
  for (const app of inventoryGraph?.applications || []) {
    if (app.manifest) {
      Object.assign(allDeps, app.manifest.dependencies || {}, app.manifest.devDependencies || {});
    }
  }

  // Helper to read file safely
  const readFileSafe = (relPath) => {
    try {
      return fs.readFileSync(path.join(projectDir, relPath), 'utf8');
    } catch {
      return '';
    }
  };

  // Helper to check file existence
  const hasFile = (relPath) => fs.existsSync(path.join(projectDir, relPath));

  // =========================================================================
  // 1. Identify Client & Frontend Applications
  // =========================================================================
  for (const app of inventoryGraph?.applications || []) {
    if (app.type === 'frontend') {
      components.push({
        id: `client-${app.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        name: app.name,
        type: 'frontend',
        role: 'Client Interface (Web / SSR)',
        path: app.path,
        technologies: app.frameworks,
        stateManagement: detectFrontendState(projectDir, app.path, allDeps),
      });
      detectedTechnologies.add('web-frontend');
    } else if (app.type === 'mobile') {
      components.push({
        id: `client-mobile-${app.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        name: app.name,
        type: 'mobile',
        role: 'Native / Hybrid Mobile Client',
        path: app.path,
        technologies: app.frameworks,
      });
      detectedTechnologies.add('mobile-client');
    }
  }

  // =========================================================================
  // 2. Identify Backend API & Microservices
  // =========================================================================
  const backendApps = (inventoryGraph?.applications || []).filter((a) => a.type === 'backend');
  for (const app of backendApps) {
    const isGateway = detectApiGatewayRole(projectDir, app.path, allDeps);
    components.push({
      id: `service-${app.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
      name: app.name,
      type: isGateway ? 'api_gateway' : 'api_service',
      role: isGateway ? 'API Gateway / Reverse Proxy' : 'Core Backend API Service',
      path: app.path,
      technologies: [...app.frameworks, ...app.languages],
      protocols: detectServiceProtocols(projectDir, app.path, allDeps),
    });
    detectedTechnologies.add(isGateway ? 'api-gateway' : 'backend-api');
  }

  // =========================================================================
  // 3. Identify Databases & Persistence
  // =========================================================================
  const dbTypes = new Set();
  const dbEvidence = [];

  if (allDeps['pg'] || allDeps['postgres'] || allDeps['@prisma/client']?.includes('postgresql') || files.some((f) => f.includes('psycopg2'))) {
    dbTypes.add('postgresql');
    dbEvidence.push('PostgreSQL driver / ORM detected');
  }
  if (allDeps['mysql2'] || allDeps['mysql']) {
    dbTypes.add('mysql');
    dbEvidence.push('MySQL driver detected');
  }
  if (allDeps['sqlite3'] || allDeps['better-sqlite3']) {
    dbTypes.add('sqlite');
    dbEvidence.push('SQLite engine detected');
  }
  if (allDeps['mongodb'] || allDeps['mongoose'] || files.some((f) => f.includes('pymongo'))) {
    dbTypes.add('mongodb');
    dbEvidence.push('MongoDB driver / Mongoose detected');
  }

  if (dbTypes.size > 0) {
    components.push({
      id: 'datastore-primary',
      name: 'Primary Application Database',
      type: 'database',
      role: 'Relational / Document Persistence Layer',
      technologies: Array.from(dbTypes),
      evidence: dbEvidence,
    });
    detectedTechnologies.add('database');
  }

  // =========================================================================
  // 4. Identify Caching & In-Memory Stores
  // =========================================================================
  const cacheTech = [];
  let isDistributedCache = false;

  if (allDeps['ioredis'] || allDeps['redis'] || files.some((f) => f.includes('redis') && (f.endsWith('.py') || f.endsWith('.java')))) {
    cacheTech.push('redis');
    isDistributedCache = true;
  }
  if (allDeps['memcached']) {
    cacheTech.push('memcached');
    isDistributedCache = true;
  }
  if (allDeps['lru-cache'] || allDeps['node-cache']) {
    cacheTech.push('in-memory-lru');
  }

  // Check code for in-memory Map cache
  const hasRawMemoryMap = files.some((f) => {
    if (!f.endsWith('.ts') && !f.endsWith('.js')) return false;
    const content = readFileSafe(f);
    return /const\s+\w*(?:Cache|Store)\s*=\s*new\s*Map\s*\(/i.test(content);
  });
  if (hasRawMemoryMap && !cacheTech.includes('in-memory-map')) {
    cacheTech.push('in-memory-map');
  }

  if (cacheTech.length > 0) {
    components.push({
      id: 'datastore-cache',
      name: isDistributedCache ? 'Distributed Cache Layer' : 'Process In-Memory Cache',
      type: 'cache',
      role: isDistributedCache ? 'Distributed High-Throughput Key-Value Store' : 'Local In-Process Cache',
      technologies: cacheTech,
      isDistributed: isDistributedCache,
    });
    detectedTechnologies.add('cache');
  }

  // =========================================================================
  // 5. Identify Message Queues & Event Streaming
  // =========================================================================
  const queueTech = [];
  if (allDeps['amqplib'] || files.some((f) => f.includes('pika') || f.includes('spring-rabbit'))) {
    queueTech.push('rabbitmq');
  }
  if (allDeps['kafkajs'] || files.some((f) => f.includes('confluent-kafka') || f.includes('spring-kafka'))) {
    queueTech.push('kafka');
  }
  if (allDeps['bull'] || allDeps['bullmq'] || allDeps['bee-queue']) {
    queueTech.push('redis-queue');
  }
  if (allDeps['@aws-sdk/client-sqs'] || allDeps['aws-sdk']) {
    queueTech.push('sqs');
  }

  if (queueTech.length > 0) {
    components.push({
      id: 'messaging-queue',
      name: 'Asynchronous Message Queue / Event Bus',
      type: 'message_queue',
      role: 'Decoupled Asynchronous Job & Event Processing',
      technologies: queueTech,
    });
    detectedTechnologies.add('message-queue');
  }

  // =========================================================================
  // 6. Identify Background Workers & Scheduled Jobs
  // =========================================================================
  const hasCronOrWorker =
    allDeps['node-cron'] ||
    allDeps['agenda'] ||
    allDeps['node-schedule'] ||
    files.some((f) => /worker|job|task|cron/i.test(f) && /\.(ts|js|py|java)$/.test(f));

  if (hasCronOrWorker && queueTech.length > 0) {
    components.push({
      id: 'worker-background',
      name: 'Asynchronous Task Workers',
      type: 'worker',
      role: 'Background Queue Consumer & Batch Processing',
      technologies: queueTech,
    });
    detectedTechnologies.add('background-worker');
  }

  // =========================================================================
  // 7. Identify Object Storage
  // =========================================================================
  const storageTech = [];
  if (allDeps['@aws-sdk/client-s3'] || files.some((f) => f.includes('boto3') && readFileSafe(f).includes('s3'))) {
    storageTech.push('aws-s3');
  }
  if (allDeps['@google-cloud/storage']) {
    storageTech.push('google-cloud-storage');
  }
  if (allDeps['@azure/storage-blob']) {
    storageTech.push('azure-blob-storage');
  }

  if (storageTech.length > 0) {
    components.push({
      id: 'storage-object',
      name: 'Object Storage Store',
      type: 'object_storage',
      role: 'Unstructured Binary & Blob Asset Store',
      technologies: storageTech,
    });
    detectedTechnologies.add('object-storage');
  }

  // =========================================================================
  // 8. Identify Authentication & Identity Provider
  // =========================================================================
  const authTech = [];
  if (allDeps['jsonwebtoken'] || allDeps['jose'] || files.some((f) => f.includes('pyjwt') || f.includes('jjwt'))) {
    authTech.push('jwt-stateless');
  }
  if (allDeps['passport'] || allDeps['next-auth'] || allDeps['@auth0/auth0-spa-js']) {
    authTech.push('oauth2-oidc');
  }
  if (allDeps['express-session'] || allDeps['cookie-session']) {
    authTech.push('stateful-session');
  }

  if (authTech.length > 0) {
    components.push({
      id: 'security-auth',
      name: 'Authentication & Session Service',
      type: 'auth_system',
      role: 'Identity Verification, Token Issuance & Session Management',
      technologies: authTech,
    });
    detectedTechnologies.add('auth');
  }

  // =========================================================================
  // 9. Identify Observability, Telemetry & Logging
  // =========================================================================
  const telemetryTech = [];
  if (allDeps['@opentelemetry/api'] || allDeps['@opentelemetry/sdk-node']) {
    telemetryTech.push('opentelemetry');
  }
  if (allDeps['prom-client']) {
    telemetryTech.push('prometheus');
  }
  if (allDeps['@sentry/node'] || allDeps['@sentry/react']) {
    telemetryTech.push('sentry');
  }
  if (allDeps['winston'] || allDeps['pino'] || allDeps['bunyan'] || allDeps['morgan']) {
    telemetryTech.push('structured-logging');
  }

  if (telemetryTech.length > 0) {
    components.push({
      id: 'observability-telemetry',
      name: 'Observability & Monitoring Stack',
      type: 'telemetry',
      role: 'Distributed Tracing, Metrics Export & Structured Log Emission',
      technologies: telemetryTech,
    });
    detectedTechnologies.add('observability');
  }

  // =========================================================================
  // 10. Identify Infrastructure, Containers & Orchestration
  // =========================================================================
  const infraTech = [];
  if (hasFile('Dockerfile') || hasFile('Containerfile') || files.some((f) => f.endsWith('Dockerfile'))) {
    infraTech.push('docker');
  }
  if (hasFile('docker-compose.yml') || hasFile('compose.yaml') || hasFile('docker-compose.yaml')) {
    infraTech.push('docker-compose');
  }
  const k8sFiles = files.filter((f) => f.startsWith('k8s/') || f.startsWith('kubernetes/') || f.endsWith('.k8s.yaml') || f.endsWith('.k8s.yml'));
  let k8sReplicaCount = null;
  if (k8sFiles.length > 0) {
    infraTech.push('kubernetes');
    for (const kf of k8sFiles) {
      try {
        const kfContent = fs.readFileSync(path.join(projectDir, kf), 'utf8');
        const m = kfContent.match(/replicas:\s*(\d+)/);
        if (m) {
          k8sReplicaCount = parseInt(m[1], 10);
        }
      } catch { /* ignore non-critical read/parse error */ }
    }
  }
  if (files.some((f) => f.endsWith('.tf') || f.endsWith('.tfvars'))) {
    infraTech.push('terraform');
  }
  if (hasFile('vercel.json')) {
    infraTech.push('vercel');
  }
  if (hasFile('Procfile')) {
    infraTech.push('procfile-paas');
  }
  if (hasFile('fly.toml') || hasFile('render.yaml')) {
    infraTech.push('managed-paas');
  }

  if (infraTech.length > 0) {
    components.push({
      id: 'infrastructure-runtime',
      name: 'Deployment & Container Infrastructure',
      type: 'infrastructure',
      role: 'Packaging, Containerization & Orchestration Definitions',
      technologies: infraTech,
      k8sReplicaCount,
      hasSingleReplicaK8s: k8sReplicaCount === 1,
    });
    detectedTechnologies.add('infrastructure');
  }

  // =========================================================================
  // 11. Inferred Data Flows & Topology Type
  // =========================================================================
  const clientComponents = components.filter((c) => c.type === 'frontend' || c.type === 'mobile');
  const apiComponents = components.filter((c) => c.type === 'api_service' || c.type === 'api_gateway');
  const dbComponents = components.filter((c) => c.type === 'database');
  const cacheComponents = components.filter((c) => c.type === 'cache');
  const queueComponents = components.filter((c) => c.type === 'message_queue');
  const workerComponents = components.filter((c) => c.type === 'worker');

  // Client -> API flows
  for (const client of clientComponents) {
    for (const api of apiComponents) {
      dataFlows.push({
        from: client.id,
        to: api.id,
        label: 'HTTP/REST or GraphQL Requests (TLS)',
        direction: 'unidirectional',
      });
    }
  }

  // API -> Database flows
  for (const api of apiComponents) {
    for (const db of dbComponents) {
      dataFlows.push({
        from: api.id,
        to: db.id,
        label: 'Database Transactions & Queries (Connection Pool)',
        direction: 'bidirectional',
      });
    }
  }

  // API -> Cache flows
  for (const api of apiComponents) {
    for (const cache of cacheComponents) {
      dataFlows.push({
        from: api.id,
        to: cache.id,
        label: 'Cache Lookups & Invalidation (Cache-Aside)',
        direction: 'bidirectional',
      });
    }
  }

  // API -> Queue -> Worker flows
  for (const api of apiComponents) {
    for (const queue of queueComponents) {
      dataFlows.push({
        from: api.id,
        to: queue.id,
        label: 'Enqueue Asynchronous Tasks',
        direction: 'unidirectional',
      });
    }
  }
  for (const worker of workerComponents) {
    for (const queue of queueComponents) {
      dataFlows.push({
        from: queue.id,
        to: worker.id,
        label: 'Consume Job Payload',
        direction: 'unidirectional',
      });
    }
    for (const db of dbComponents) {
      dataFlows.push({
        from: worker.id,
        to: db.id,
        label: 'Write Processed Results',
        direction: 'bidirectional',
      });
    }
  }

  // Classify Overall Architecture Topology
  let topologyType = 'standalone';
  const isMonorepo = inventoryGraph?.repository?.isMonorepo;
  const numServices = backendApps.length;

  if (numServices > 2) {
    topologyType = 'microservices';
  } else if (numServices === 1 && clientComponents.length > 0) {
    topologyType = clientComponents.some((c) => c.type === 'mobile')
      ? 'mobile-client-backend'
      : 'client-server-monolith';
  } else if (numServices === 1 && clientComponents.length === 0) {
    // Check if modular monolith
    const hasModules = files.some((f) => f.startsWith('src/modules/') || f.startsWith('src/features/'));
    topologyType = hasModules ? 'modular-monolith' : 'monolith';
  } else if (isMonorepo && numServices > 0) {
    topologyType = 'modular-monolith';
  } else if (inventoryGraph?.repository?.isLibraryOnly) {
    topologyType = 'library';
  }

  return {
    topologyType,
    components,
    dataFlows,
    detectedTechnologies: Array.from(detectedTechnologies),
    counts: {
      services: backendApps.length,
      clients: clientComponents.length,
      datastores: dbComponents.length + cacheComponents.length,
      queues: queueComponents.length,
      totalComponents: components.length,
    },
  };
}

/**
 * Detects frontend state management patterns.
 */
function detectFrontendState(projectDir, appRelPath, deps) {
  if (deps['@reduxjs/toolkit'] || deps['redux']) return 'Redux Toolkit';
  if (deps['zustand']) return 'Zustand';
  if (deps['recoil']) return 'Recoil';
  if (deps['mobx']) return 'MobX';
  if (deps['@tanstack/react-query']) return 'React Query (Server State)';
  return 'React Built-in State (useState/useReducer)';
}

/**
 * Detects whether an application operates as an API Gateway.
 */
function detectApiGatewayRole(projectDir, appRelPath, deps) {
  if (deps['fastify-http-proxy'] || deps['http-proxy-middleware'] || deps['express-gateway'] || deps['kong']) {
    return true;
  }
  return false;
}

/**
 * Detects protocols supported by backend service.
 */
function detectServiceProtocols(projectDir, appRelPath, deps) {
  const protocols = ['HTTP/1.1'];
  if (deps['@grpc/grpc-js'] || deps['grpc']) protocols.push('gRPC');
  if (deps['graphql'] || deps['@apollo/server'] || deps['apollo-server-express']) protocols.push('GraphQL');
  if (deps['ws'] || deps['socket.io']) protocols.push('WebSockets');
  return protocols;
}
