import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION, sanitizeOutput, parseYamlFallback } from '../constants.mjs';

let YAMLParser = null;
try {
  const mod = await import('yaml');
  YAMLParser = mod.default || mod;
} catch {
  // If yaml module is not installed, fallback YAML parser is used for basic structures
}

/**
 * Node.js & TypeScript Backend, CLI, and Library Adapter.
 */
export class NodeTypeScriptAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'node-typescript',
      name: 'Node.js & TypeScript Ecosystem Adapter',
      version: TOOL_VERSION,
      description: 'Assesses Node.js and TypeScript backends, APIs, CLIs, and libraries for production readiness.',
      supportedLanguages: ['javascript', 'typescript'],
      supportedFrameworks: ['express', 'fastify', 'nestjs', 'koa', 'hapi', 'connect'],
      requiredTools: ['node'],
    });
  }

  detect(target, context) {
    const targetDir = target.absPath || context.projectDir;
    const hasPkgFile = fs.existsSync(path.join(targetDir, 'package.json'));
    const isNode =
      hasPkgFile ||
      target.manifest !== null ||
      target.languages?.includes('javascript') ||
      target.languages?.includes('typescript');

    if (!isNode) {
      return {
        matched: false,
        confidence: 0,
        reason: 'Target directory does not appear to be a Node.js or TypeScript project.',
      };
    }

    let confidence = 1.0;
    if (target.type === 'frontend') {
      confidence = 0.5; // NextJsReactAdapter takes priority for frontend web applications
    } else if (target.type === 'fullstack') {
      confidence = 0.9;
    }

    return {
      matched: true,
      confidence,
      reason: `Matched Node.js / TypeScript project (type: ${target.type}).`,
      metadata: {
        type: target.type,
        frameworks: target.frameworks,
        languages: target.languages,
      },
    };
  }

  getCapabilities() {
    return [
      'manifest_inspection',
      'runtime_version_verification',
      'lockfile_validation',
      'environment_startup_validation',
      'build_and_test_execution',
      'security_middleware_inspection',
      'openapi_contract_validation',
      'database_persistence_verification',
      'health_and_shutdown_signals',
      'accessibility_heuristics',
      'performance_scripts',
    ];
  }

  getApplicableChecks(target, context) {
    const isLibrary = target.type === 'library';
    const checks = [
      { id: 'DISC-001', name: 'Valid Project Manifest Detected', category: 'discovery', required: true },
      { id: 'DISC-002', name: 'Explicit Node.js Runtime Version Specified', category: 'discovery', required: true },
      { id: 'DISC-003', name: 'Deterministic Dependency Lockfile Present', category: 'discovery', required: true },
      { id: 'ENV-001', name: 'Environment Variable Template Present', category: 'env', required: true },
      { id: 'ENV-003', name: 'Type-Safe Startup Environment Validation Detected', category: 'env', required: true },
      { id: 'BUILD-001', name: 'Build Script Verification', category: 'build_test', required: true },
      { id: 'BUILD-002', name: 'Test Script Verification', category: 'build_test', required: true },
      { id: 'BUILD-003', name: 'Typecheck Script Verification', category: 'build_test', required: false },
      { id: 'BUILD-004', name: 'Lint Script Verification', category: 'build_test', required: false },
      { id: 'SEC-002', name: 'No Raw Secret Logging Patterns Detected', category: 'security', required: true },
      { id: 'SEC-003', name: 'Security Middleware Configured (Helmet/CORS)', category: 'security', required: !isLibrary },
      { id: 'API-001', name: 'OpenAPI Document Parsed Successfully', category: 'api', required: !isLibrary },
      { id: 'API-002', name: 'Valid OpenAPI Contract Present', category: 'api', required: !isLibrary },
      { id: 'API-003', name: 'RESTful URI Conventions Followed', category: 'api', required: !isLibrary },
      { id: 'API-004', name: 'Standardized Error Model Defined', category: 'api', required: !isLibrary },
      { id: 'API-005', name: 'API Implementation Aligns with OpenAPI Contract', category: 'api', required: !isLibrary },
      { id: 'API-006', name: 'Runtime API Integration Testing', category: 'api', required: !isLibrary },
      { id: 'DB-001', name: 'Production Database Driver or ORM Configured', category: 'database', required: false },
      { id: 'DB-002', name: 'Database Migration Scripts or Files Present', category: 'database', required: false },
      { id: 'DB-003', name: 'Database Connection Pooling and Timeout Configuration', category: 'database', required: false },
      { id: 'DEP-002', name: 'Health Check Endpoint Available (/health)', category: 'deployment', required: !isLibrary },
      { id: 'DEP-003', name: 'Graceful Process Shutdown Handlers Detected', category: 'deployment', required: !isLibrary },
      { id: 'A11Y-001', name: 'Automated Accessibility Tooling', category: 'accessibility', required: false },
      { id: 'PERF-001', name: 'Load Testing or Benchmark Scripts Detected', category: 'performance', required: false },
      { id: 'PERF-002', name: 'Live Performance Load Test Execution', category: 'performance', required: false },
    ];
    return checks;
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];
    const pkg = target.manifest;
    const isLibrary = target.type === 'library';

    // =========================================================================
    // Module A: Discovery (DISC-001, DISC-002, DISC-003)
    // =========================================================================
    if (pkg) {
      findings.push(
        this.createFinding({
          id: 'DISC-001',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Valid Project Manifest Detected',
          explanation: `Found valid package.json for project "${pkg.name || target.name}" (version: ${pkg.version || '0.0.0'}).`,
          evidence: { file: path.relative(projectDir, path.join(targetDir, 'package.json')).replace(/\\/g, '/') },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain explicit name, version, description, and repository metadata in package.json.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );

      // DISC-002: Engines
      if (pkg.engines && pkg.engines.node) {
        findings.push(
          this.createFinding({
            id: 'DISC-002',
            category: 'discovery',
            status: 'PASS',
            severity: 'info',
            title: 'Explicit Node.js Runtime Version Specified',
            explanation: `Project explicitly declares supported Node.js runtime version: ${pkg.engines.node}.`,
            evidence: { file: 'package.json', snippet: `"node": "${pkg.engines.node}"` },
            checkMethod: 'static_analysis',
            recommendation: 'Keep engines.node synchronized with CI matrix and deployment container base images.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'DISC-002',
            category: 'discovery',
            status: 'WARNING',
            severity: 'medium',
            title: 'Undeclared Node.js Runtime Version',
            explanation: 'package.json does not declare an "engines.node" field. Deployment environments may default to unexpected Node versions.',
            evidence: { file: 'package.json' },
            checkMethod: 'static_analysis',
            recommendation: 'Declare explicitly supported Node.js versions in package.json "engines" field (e.g. "^22.0.0 || ^24.0.0 || ^26.0.0").',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    } else {
      findings.push(
        this.createFinding({
          id: 'DISC-001',
          category: 'discovery',
          status: 'FAIL',
          severity: 'critical',
          title: 'Missing or Malformed package.json',
          explanation: 'No valid package.json manifest could be parsed in project root.',
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Initialize a valid package.json using "npm init" and declare name, version, and dependencies.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // DISC-003: Lockfile
    const lockfiles = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'].filter(
      (f) => fs.existsSync(path.join(targetDir, f)) || fs.existsSync(path.join(projectDir, f))
    );
    if (lockfiles.length > 0) {
      findings.push(
        this.createFinding({
          id: 'DISC-003',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Deterministic Dependency Lockfile Present',
          explanation: `Found package lockfile(s): ${lockfiles.join(', ')}.`,
          evidence: { file: lockfiles[0] },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure lockfile is committed to version control and kept up to date.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'DISC-003',
          category: 'discovery',
          status: 'WARNING',
          severity: 'high',
          title: 'Missing Package Lockfile',
          explanation: 'No package-lock.json, pnpm-lock.yaml, or yarn.lock found. Builds may be non-deterministic.',
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Commit a package lockfile to ensure deterministic builds in production.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Module B: Environment (ENV-001, ENV-003)
    // =========================================================================
    const envExamplePath = path.join(targetDir, '.env.example');
    const rootEnvExamplePath = path.join(projectDir, '.env.example');
    const hasEnvExample = fs.existsSync(envExamplePath) || fs.existsSync(rootEnvExamplePath);

    if (hasEnvExample) {
      findings.push(
        this.createFinding({
          id: 'ENV-001',
          category: 'env',
          status: 'PASS',
          severity: 'info',
          title: 'Environment Variable Template Present',
          explanation: 'Found documented environment template at ".env.example".',
          evidence: { file: fs.existsSync(envExamplePath) ? '.env.example' : path.relative(targetDir, rootEnvExamplePath).replace(/\\/g, '/') },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure all required configuration keys are documented in .env.example with non-secret dummy defaults.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'ENV-001',
          category: 'env',
          status: isLibrary ? 'NOT_APPLICABLE' : 'FAIL',
          severity: isLibrary ? 'info' : 'high',
          title: isLibrary ? 'Environment Template Not Applicable to Library' : 'Missing Environment Variable Template (.env.example)',
          explanation: isLibrary
            ? 'Library packages do not typically load environment configuration files directly.'
            : 'No .env.example template file found in project root. Deployment engineers cannot verify required configuration keys.',
          evidence: { file: '.env.example' },
          checkMethod: 'static_analysis',
          recommendation: isLibrary
            ? 'If runtime configuration is required, document it in README.'
            : 'Generate a safe .env.example using "envguard-audit" or "envguard-setup".',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // ENV-003: Type-safe startup validation
    let hasValidationSchema = false;
    let schemaFile = null;
    for (const file of files) {
      if (
        file.endsWith('.ts') ||
        file.endsWith('.js') ||
        file.endsWith('.mjs') ||
        file.endsWith('.cjs')
      ) {
        const full = path.join(projectDir, file);
        try {
          const content = fs.readFileSync(full, 'utf8');
          if (
            content.includes('guard(') ||
            content.includes('envguard') ||
            content.includes('envalid') ||
            content.includes('cleanEnv(') ||
            content.includes('t3-env') ||
            (content.includes('z.object(') && content.includes('process.env'))
          ) {
            hasValidationSchema = true;
            schemaFile = file;
            break;
          }
        } catch {}
      }
    }

    if (hasValidationSchema) {
      findings.push(
        this.createFinding({
          id: 'ENV-003',
          category: 'env',
          status: 'PASS',
          severity: 'info',
          title: 'Type-Safe Startup Environment Validation Detected',
          explanation: `Startup environment schema validation detected in "${schemaFile}". (Static heuristic: runtime enforcement not dynamically exercised).`,
          evidence: { file: schemaFile },
          checkMethod: 'heuristic',
          recommendation: 'Ensure schema fails fast on process boot before any network listener binds.',
          manualVerificationRequired: false,
          confidence: 'medium_heuristic',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'ENV-003',
          category: 'env',
          status: isLibrary ? 'NOT_APPLICABLE' : 'WARNING',
          severity: isLibrary ? 'info' : 'medium',
          title: isLibrary ? 'Startup Validation Schema Not Applicable to Library' : 'No Startup Environment Validation Schema Detected',
          explanation: isLibrary
            ? 'Library packages generally receive parameters directly rather than reading process.env at boot.'
            : 'No guard(), envalid, or Zod environment validation schema detected at application startup.',
          evidence: { file: 'src/' },
          checkMethod: 'heuristic',
          recommendation: 'Use EnvGuard (guard()) to validate all required environment variables at application boot.',
          manualVerificationRequired: false,
          confidence: 'medium_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Module C: Security (SEC-002, SEC-003)
    // =========================================================================
    let sensitiveLoggingFile = null;
    let sensitiveLoggingSnippet = null;
    for (const file of files) {
      if (
        (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.mjs')) &&
        !file.includes('.test.') &&
        !file.includes('.spec.') &&
        !file.startsWith('tests/')
      ) {
        const full = path.join(projectDir, file);
        try {
          const content = fs.readFileSync(full, 'utf8');
          const lines = content.split(/\r?\n/);
          for (const line of lines) {
            if (
              /console\.(log|info|warn|error)\s*\(\s*process\.env\b/.test(line) ||
              /console\.(log|info|warn|error)\s*\(.*(password|secret|token|api_?key)/i.test(line)
            ) {
              sensitiveLoggingFile = file;
              sensitiveLoggingSnippet = line.trim();
              break;
            }
          }
        } catch {}
      }
      if (sensitiveLoggingFile) break;
    }

    if (sensitiveLoggingFile) {
      findings.push(
        this.createFinding({
          id: 'SEC-002',
          category: 'security',
          status: 'WARNING',
          severity: 'high',
          title: 'Potential Sensitive Value Logging Detected',
          explanation: `Detected potential secret or environment variable logging in "${sensitiveLoggingFile}".`,
          evidence: {
            file: sensitiveLoggingFile,
            snippet: sanitizeOutput(sensitiveLoggingSnippet),
          },
          checkMethod: 'heuristic',
          recommendation: 'Avoid logging raw secrets or unmasked environment variables to stdout/stderr.',
          manualVerificationRequired: true,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'SEC-002',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'No Raw Secret Logging Patterns Detected',
          explanation: 'Static scan found no obvious console.log(process.env) or unmasked secret logging patterns.',
          evidence: { file: 'src/' },
          checkMethod: 'heuristic',
          recommendation: 'Maintain automated lint rules (e.g. no-console) to prevent accidental runtime credential exposure.',
          manualVerificationRequired: false,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    }

    // SEC-003: Security Middleware (Helmet/CORS)
    if (isLibrary) {
      findings.push(
        this.createFinding({
          id: 'SEC-003',
          category: 'security',
          status: 'NOT_APPLICABLE',
          severity: 'info',
          title: 'HTTP Security Headers Not Applicable to Library',
          explanation: 'Project is a reusable library package without HTTP server listeners.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'If HTTP server components are introduced, configure Helmet and strict CORS.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
      const hasHelmet = Boolean(deps['helmet']);
      const hasCors = Boolean(deps['cors']);

      if (hasHelmet || hasCors) {
        findings.push(
          this.createFinding({
            id: 'SEC-003',
            category: 'security',
            status: 'PASS',
            severity: 'info',
            title: 'Security Middleware Configured (Helmet/CORS)',
            explanation: `Project incorporates security middleware packages: ${[hasHelmet ? 'helmet' : null, hasCors ? 'cors' : null].filter(Boolean).join(', ')}.`,
            evidence: { file: 'package.json' },
            checkMethod: 'static_analysis',
            recommendation: 'Verify Content Security Policy (CSP) and allowed CORS origins are strictly scoped for production.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'SEC-003',
            category: 'security',
            status: 'WARNING',
            severity: 'medium',
            title: 'Missing Standard HTTP Security Headers (Helmet)',
            explanation: 'Project does not appear to use "helmet" or standard HTTP header hardening middleware.',
            evidence: { file: 'package.json' },
            checkMethod: 'static_analysis',
            recommendation: 'Install and configure "helmet" to protect against common web vulnerabilities (XSS, clickjacking, MIME sniffing).',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    }

    // =========================================================================
    // Module D: API Readiness (API-001 to API-006)
    // =========================================================================
    if (isLibrary) {
      for (const apiId of ['API-001', 'API-002', 'API-003', 'API-004', 'API-005', 'API-006']) {
        findings.push(
          this.createFinding({
            id: apiId,
            category: 'api',
            status: 'NOT_APPLICABLE',
            severity: 'info',
            title: 'OpenAPI Specification Not Applicable to Library',
            explanation: 'Project is a reusable library package without HTTP REST server endpoints.',
            evidence: { file: 'package.json' },
            checkMethod: 'static_analysis',
            recommendation: 'Document public TypeScript interfaces and module export contracts in README or API docs.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    } else {
      const openapiFiles = files.filter(
        (f) =>
          (f.includes('openapi') || f.includes('swagger')) &&
          (f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'))
      );

      if (openapiFiles.length === 0) {
        findings.push(
          this.createFinding({
            id: 'API-001',
            category: 'api',
            status: 'WARNING',
            severity: 'low',
            title: 'No OpenAPI Specification Document Found',
            explanation: 'No openapi.json or openapi.yaml specification was detected in the project.',
            evidence: { file: 'docs/' },
            checkMethod: 'static_analysis',
            recommendation: 'Document REST API endpoints using OpenAPI 3.1 contracts (envguard-api-design).',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        const specFile = openapiFiles[0];
        const specFull = path.join(projectDir, specFile);
        let spec = null;
        let parseError = null;
        const isYaml = specFile.endsWith('.yaml') || specFile.endsWith('.yml');

        try {
          const raw = fs.readFileSync(specFull, 'utf8');
          if (isYaml) {
            if (YAMLParser) {
              spec = YAMLParser.parse(raw);
            } else {
              spec = parseYamlFallback(raw);
            }
          } else {
            spec = JSON.parse(raw);
          }
        } catch (err) {
          parseError = err;
        }

        if (parseError || !spec) {
          findings.push(
            this.createFinding({
              id: 'API-001',
              category: 'api',
              status: 'FAIL',
              severity: 'high',
              title: 'Malformed OpenAPI Specification',
              explanation: `Failed to parse OpenAPI document at "${specFile}": ${parseError?.message || 'Invalid syntax'}`,
              evidence: { file: specFile },
              checkMethod: 'static_analysis',
              recommendation: 'Ensure OpenAPI specification is valid JSON or YAML conforming to OpenAPI 3.x schema.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );
        } else {
          // API-001 Pass
          findings.push(
            this.createFinding({
              id: 'API-001',
              category: 'api',
              status: 'PASS',
              severity: 'info',
              title: `OpenAPI Document Parsed Successfully (${isYaml ? 'YAML' : 'JSON'})`,
              explanation: `Successfully parsed OpenAPI contract at "${specFile}".`,
              evidence: { file: specFile },
              checkMethod: 'static_analysis',
              recommendation: 'Keep API contract synchronized with route implementations.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );

          // API-002: Version & Paths
          const openapiVersion = spec.openapi || spec.swagger || 'unknown';
          const paths = Object.keys(spec.paths || {});
          if (paths.length > 0) {
            findings.push(
              this.createFinding({
                id: 'API-002',
                category: 'api',
                status: 'PASS',
                severity: 'info',
                title: `Valid OpenAPI Contract Present (${openapiVersion})`,
                explanation: `Found valid OpenAPI contract at "${specFile}" declaring ${paths.length} path(s).`,
                evidence: { file: specFile, snippet: `version: ${openapiVersion}, paths: ${paths.length}` },
                checkMethod: 'static_analysis',
                recommendation: 'Ensure all public API endpoints are documented.',
                manualVerificationRequired: false,
                confidence: 'verified_fact',
                targetPath: target.path,
              })
            );
          } else {
            findings.push(
              this.createFinding({
                id: 'API-002',
                category: 'api',
                status: 'WARNING',
                severity: 'medium',
                title: 'OpenAPI Specification Defines Zero Paths',
                explanation: `OpenAPI document "${specFile}" contains no endpoint paths.`,
                evidence: { file: specFile },
                checkMethod: 'static_analysis',
                recommendation: 'Add operation definitions for all public API endpoints.',
                manualVerificationRequired: false,
                confidence: 'verified_fact',
                targetPath: target.path,
              })
            );
          }

          // API-003: RESTful URI Conventions
          const nonRestPaths = paths.filter(
            (p) => /\/(get|post|create|delete|update|fetch)[A-Z0-9]/i.test(p) || p.includes('/get') || p.includes('/create')
          );
          if (nonRestPaths.length > 0) {
            findings.push(
              this.createFinding({
                id: 'API-003',
                category: 'api',
                status: 'WARNING',
                severity: 'medium',
                title: 'Non-RESTful RPC Action Verbs in API URLs',
                explanation: `OpenAPI specification contains RPC-style action verbs in paths: "${nonRestPaths.slice(0, 3).join(', ')}".`,
                evidence: { file: specFile, snippet: nonRestPaths[0] },
                checkMethod: 'static_analysis',
                recommendation: 'Use plural nouns and standard HTTP methods (e.g. POST /tasks instead of /createTask).',
                manualVerificationRequired: false,
                confidence: 'verified_fact',
                targetPath: target.path,
              })
            );
          } else {
            findings.push(
              this.createFinding({
                id: 'API-003',
                category: 'api',
                status: 'PASS',
                severity: 'info',
                title: 'RESTful URI Naming Conventions Followed',
                explanation: 'Endpoint paths adhere to RESTful noun-based conventions without RPC action verbs.',
                evidence: { file: specFile },
                checkMethod: 'static_analysis',
                recommendation: 'Maintain RESTful naming standards across all newly added routes.',
                manualVerificationRequired: false,
                confidence: 'verified_fact',
                targetPath: target.path,
              })
            );
          }

          // API-004: Standardized Error Model (RFC 9457 / RFC 7807)
          const schemas = spec.components?.schemas || {};
          const hasProblemDetails = Object.keys(schemas).some(
            (name) => /problemdetail/i.test(name) || (/error/i.test(name) && schemas[name]?.properties?.status) || /application\/problem\+json/.test(JSON.stringify(schemas[name]))
          );
          if (hasProblemDetails) {
            findings.push(
              this.createFinding({
                id: 'API-004',
                category: 'api',
                status: 'PASS',
                severity: 'info',
                title: 'Standardized Error Model Defined (RFC 9457 / RFC 7807)',
                explanation: 'OpenAPI specification includes RFC 9457 / RFC 7807 problem details or structured error models.',
                evidence: { file: specFile },
                checkMethod: 'static_analysis',
                recommendation: 'Ensure all error responses (4xx, 5xx) conform to the Problem Details schema.',
                manualVerificationRequired: false,
                confidence: 'verified_fact',
                targetPath: target.path,
              })
            );
          } else {
            findings.push(
              this.createFinding({
                id: 'API-004',
                category: 'api',
                status: 'WARNING',
                severity: 'medium',
                title: 'Missing RFC 9457 / RFC 7807 Problem Details Schema',
                explanation: 'OpenAPI contract does not define a standard Problem Details error envelope.',
                evidence: { file: specFile },
                checkMethod: 'static_analysis',
                recommendation: 'Incorporate RFC 9457 Problem Details schema for consistent machine-readable error responses.',
                manualVerificationRequired: false,
                confidence: 'verified_fact',
                targetPath: target.path,
              })
            );
          }

          // API-005: Route alignment
          const srcRouteFiles = files.filter(
            (f) =>
              (f.startsWith('src/') || f.startsWith('app/') || f.startsWith('routes/')) &&
              (f.endsWith('.ts') || f.endsWith('.js')) &&
              !f.includes('.test.') &&
              !f.includes('.spec.')
          );

          let detectedSourceRoutes = 0;
          for (const sf of srcRouteFiles) {
            try {
              const code = fs.readFileSync(path.join(projectDir, sf), 'utf8');
              for (const p of paths) {
                const cleanP = p.replace(/\{[^}]+\}/g, '');
                if (code.includes(cleanP) || (cleanP.length > 3 && code.includes(path.basename(cleanP)))) {
                  detectedSourceRoutes++;
                  break;
                }
              }
            } catch {}
          }

          if (detectedSourceRoutes > 0 || paths.length === 0) {
            findings.push(
              this.createFinding({
                id: 'API-005',
                category: 'api',
                status: 'PASS',
                severity: 'info',
                title: 'API Implementation Aligns with OpenAPI Contract',
                explanation: `Detected route handlers corresponding to ${detectedSourceRoutes} path(s) declared in OpenAPI spec.`,
                evidence: { file: specFile },
                checkMethod: 'heuristic',
                recommendation: 'Automate contract verification with schema-driven integration tests.',
                manualVerificationRequired: false,
                confidence: 'medium_heuristic',
                targetPath: target.path,
              })
            );
          } else {
            findings.push(
              this.createFinding({
                id: 'API-005',
                category: 'api',
                status: 'MANUAL_REVIEW',
                severity: 'medium',
                title: 'API Route Alignment Requires Engineering Review',
                explanation: 'Could not statically map declared OpenAPI paths to route handler registrations in source files.',
                evidence: { file: specFile },
                checkMethod: 'manual_verification_required',
                recommendation: 'Perform manual verification or run API contract test suites to verify implementation.',
                manualVerificationRequired: true,
                confidence: 'unverified',
                targetPath: target.path,
              })
            );
          }

          // API-006: Runtime integration
          findings.push(
            this.createFinding({
              id: 'API-006',
              category: 'api',
              status: context.allowExec ? 'PASS' : 'NOT_RUN',
              severity: 'info',
              title: context.allowExec ? 'API Integration Tests Verified via Test Suite' : 'Runtime API Integration Testing Not Executed',
              explanation: context.allowExec
                ? 'API endpoint integration exercised during authorized test suite execution.'
                : 'Runtime API integration testing requires command execution authorization (--allow-exec).',
              evidence: { file: specFile },
              checkMethod: context.allowExec ? 'command_execution' : 'manual_verification_required',
              recommendation: 'Run comprehensive API integration tests in staging with real HTTP client requests.',
              manualVerificationRequired: !context.allowExec,
              confidence: context.allowExec ? 'verified_fact' : 'unverified',
              targetPath: target.path,
            })
          );
        }
      }
    }

    // =========================================================================
    // Module E: Database (DB-001, DB-002, DB-003)
    // =========================================================================
    const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
    const dbPackages = ['pg', 'mysql2', 'sqlite3', 'better-sqlite3', 'prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'mongoose', 'knex', 'sequelize'];
    const detectedDb = dbPackages.filter((p) => deps[p]);

    if (detectedDb.length > 0) {
      findings.push(
        this.createFinding({
          id: 'DB-001',
          category: 'database',
          status: 'PASS',
          severity: 'info',
          title: 'Production Database Driver or ORM Configured',
          explanation: `Detected database driver or ORM packages: ${detectedDb.join(', ')}.`,
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure database connection credentials use secret environment variables.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );

      const migrationFiles = files.filter(
        (f) =>
          f.includes('migration') ||
          f.includes('prisma/schema.prisma') ||
          f.includes('drizzle/') ||
          f.endsWith('.sql')
      );

      if (migrationFiles.length > 0) {
        findings.push(
          this.createFinding({
            id: 'DB-002',
            category: 'database',
            status: 'PASS',
            severity: 'info',
            title: 'Database Migration Scripts or Files Present',
            explanation: `Found database migration files: ${migrationFiles.slice(0, 3).join(', ')}.`,
            evidence: { file: migrationFiles[0] },
            checkMethod: 'static_analysis',
            recommendation: 'Verify forward and backward migration compatibility in staging before release.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'DB-002',
            category: 'database',
            status: 'WARNING',
            severity: 'high',
            title: 'No Database Migration Scripts Found',
            explanation: 'Database dependencies are declared, but no migration directory or schema definitions were detected.',
            evidence: { file: 'package.json' },
            checkMethod: 'static_analysis',
            recommendation: 'Use a structured migration framework (Prisma, Drizzle, Knex) to version database schema changes.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }

      findings.push(
        this.createFinding({
          id: 'DB-003',
          category: 'database',
          status: 'MANUAL_REVIEW',
          severity: 'medium',
          title: 'Database Connection Pooling and Timeout Configuration',
          explanation: 'Connection pool sizing (min/max connections) and query timeout policies require human engineering review.',
          evidence: { file: 'package.json' },
          checkMethod: 'manual_verification_required',
          recommendation: 'Audit connection pool settings against target database connection limits and autoscaling topology.',
          manualVerificationRequired: true,
          confidence: 'unverified',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'DB-001',
          category: 'database',
          status: 'NOT_APPLICABLE',
          severity: 'info',
          title: 'Database Checks Not Applicable (No DB Driver Detected)',
          explanation: 'Project does not declare standard relational or document database drivers in package.json.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'If database persistence is added, ensure connection pooling and migration tracking are configured.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Module F: Deployment Signals (DEP-002, DEP-003)
    // =========================================================================
    if (isLibrary) {
      findings.push(
        this.createFinding({
          id: 'DEP-002',
          category: 'deployment',
          status: 'NOT_APPLICABLE',
          severity: 'info',
          title: 'Health Check Endpoint Not Applicable to Library',
          explanation: 'Project is a library package without an HTTP server process.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain automated test suites to ensure library correctness.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
      findings.push(
        this.createFinding({
          id: 'DEP-003',
          category: 'deployment',
          status: 'NOT_APPLICABLE',
          severity: 'info',
          title: 'Graceful Shutdown Not Applicable to Library',
          explanation: 'Project is a library package without an independent process lifecycle.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure exported classes or connections provide clean dispose/close methods.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      let healthFile = null;
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.mjs')) {
          const full = path.join(projectDir, file);
          try {
            const content = fs.readFileSync(full, 'utf8');
            if (content.includes('/health') || content.includes('/healthz') || content.includes('/livez')) {
              healthFile = file;
              break;
            }
          } catch {}
        }
      }

      if (healthFile) {
        findings.push(
          this.createFinding({
            id: 'DEP-002',
            category: 'deployment',
            status: 'PASS',
            severity: 'info',
            title: 'Health Check Endpoint Available (/health)',
            explanation: `Found health check route definition in "${healthFile}".`,
            evidence: { file: healthFile },
            checkMethod: 'static_analysis',
            recommendation: 'Ensure health check validates database connectivity and responds with HTTP 200 within 2 seconds.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'DEP-002',
            category: 'deployment',
            status: 'WARNING',
            severity: 'high',
            title: 'Missing Health Check Endpoint (/health)',
            explanation: 'Could not detect an HTTP health check route (/health, /healthz, /livez) in application source.',
            evidence: { file: 'src/' },
            checkMethod: 'static_analysis',
            recommendation: 'Implement a lightweight /health endpoint returning HTTP 200 and process status.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }

      let shutdownFile = null;
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.mjs')) {
          const full = path.join(projectDir, file);
          try {
            const content = fs.readFileSync(full, 'utf8');
            if (content.includes('SIGTERM') || content.includes('SIGINT')) {
              shutdownFile = file;
              break;
            }
          } catch {}
        }
      }

      if (shutdownFile) {
        findings.push(
          this.createFinding({
            id: 'DEP-003',
            category: 'deployment',
            status: 'PASS',
            severity: 'info',
            title: 'Graceful Process Shutdown Handlers Detected',
            explanation: `Found SIGTERM/SIGINT signal listeners in "${shutdownFile}".`,
            evidence: { file: shutdownFile },
            checkMethod: 'static_analysis',
            recommendation: 'Verify in-flight HTTP requests and database connections drain within 30 seconds of SIGTERM.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'DEP-003',
            category: 'deployment',
            status: 'WARNING',
            severity: 'medium',
            title: 'Missing Graceful Shutdown Signal Handling',
            explanation: 'No process.on("SIGTERM") or process.on("SIGINT") listeners detected. Container orchestrators may abruptly terminate in-flight requests.',
            evidence: { file: 'src/' },
            checkMethod: 'static_analysis',
            recommendation: 'Implement process.on("SIGTERM") to close HTTP servers without dropping in-flight requests.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    }

    // =========================================================================
    // Module G: Accessibility (A11Y-001, A11Y-002)
    // =========================================================================
    const isFrontend = Boolean(
      deps.react || deps['react-dom'] || deps.vue || deps.svelte || deps.next || files.some((f) => f.endsWith('.tsx') || f.endsWith('.jsx'))
    );

    if (!isFrontend) {
      findings.push(
        this.createFinding({
          id: 'A11Y-001',
          category: 'accessibility',
          status: 'NOT_APPLICABLE',
          severity: 'info',
          title: 'Frontend Accessibility Checks Not Applicable',
          explanation: 'Project does not appear to contain interactive frontend UI code.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'If web UI components are added, incorporate automated a11y linters and axe-core.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      const hasA11yLinter = Boolean(deps['eslint-plugin-jsx-a11y'] || deps['axe-core'] || deps['@axe-core/react']);
      if (hasA11yLinter) {
        findings.push(
          this.createFinding({
            id: 'A11Y-001',
            category: 'accessibility',
            status: 'PASS',
            severity: 'info',
            title: 'Automated Accessibility Tooling Configured',
            explanation: 'Detected automated accessibility auditing packages in project dependencies.',
            evidence: { file: 'package.json' },
            checkMethod: 'static_analysis',
            recommendation: 'Verify accessibility rules are enforced in ESLint and CI test suites.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'A11Y-001',
            category: 'accessibility',
            status: 'WARNING',
            severity: 'medium',
            title: 'Missing Automated Accessibility Tooling',
            explanation: 'Frontend components detected without eslint-plugin-jsx-a11y or axe-core.',
            evidence: { file: 'package.json' },
            checkMethod: 'static_analysis',
            recommendation: 'Install eslint-plugin-jsx-a11y to catch WCAG contrast and keyboard navigation issues.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }

      findings.push(
        this.createFinding({
          id: 'A11Y-002',
          category: 'accessibility',
          status: 'MANUAL_REVIEW',
          severity: 'medium',
          title: 'Manual Keyboard & Screen Reader Verification Required',
          explanation: 'Automated audits only catch ~40% of WCAG issues. Screen reader navigation and focus order require human verification.',
          evidence: { file: 'src/' },
          checkMethod: 'manual_verification_required',
          recommendation: 'Test core user journeys with NVDA/VoiceOver and keyboard-only navigation.',
          manualVerificationRequired: true,
          confidence: 'unverified',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Module H: Performance (PERF-001, PERF-002)
    // =========================================================================
    const scripts = pkg?.scripts || {};
    const hasPerfScripts = Boolean(
      scripts.benchmark ||
      scripts.loadtest ||
      scripts['test:load'] ||
      scripts['test:perf'] ||
      deps.k6 ||
      deps.autocannon
    );

    if (hasPerfScripts) {
      findings.push(
        this.createFinding({
          id: 'PERF-001',
          category: 'performance',
          status: 'PASS',
          severity: 'info',
          title: 'Load Testing or Benchmark Scripts Configured',
          explanation: 'Detected load testing or benchmarking configurations (k6, autocannon).',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Establish latency thresholds (p95 < 200ms) in staging environments before major releases.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'PERF-001',
          category: 'performance',
          status: 'WARNING',
          severity: 'low',
          title: 'No Load Testing or Benchmark Scripts Detected',
          explanation: 'Could not detect k6, autocannon, or benchmark test scripts.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Create realistic workload profiles and measure p95/p99 latency thresholds.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    findings.push(
      this.createFinding({
        id: 'PERF-002',
        category: 'performance',
        status: 'NOT_RUN',
        severity: 'info',
        title: 'Live Workload Load Testing Not Executed',
        explanation: 'Simulated high-concurrency traffic generation requires an isolated staging environment and explicit authorization.',
        evidence: { file: 'package.json' },
        checkMethod: 'manual_verification_required',
        recommendation: 'Run synthetic load tests against a non-production staging cluster.',
        manualVerificationRequired: true,
        confidence: 'unverified',
        targetPath: target.path,
      })
    );

    return findings;
  }

  runDynamicChecks(target, context, execRunner) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const pkg = target.manifest;
    const scripts = pkg?.scripts || {};
    const allowExec = context.allowExec ?? false;
    const timeoutMs = context.timeoutMs ?? 10000;
    const trustProject = context.trustProject ?? false;
    const allowedCommands = context.allowedCommands ?? null;

    const checkConfigs = [
      { id: 'BUILD-001', name: 'build', required: true },
      { id: 'BUILD-002', name: 'test', required: true },
      { id: 'BUILD-003', name: 'typecheck', alias: 'check-types', required: false },
      { id: 'BUILD-004', name: 'lint', required: false },
    ];

    for (const conf of checkConfigs) {
      const scriptKey = scripts[conf.name] ? conf.name : (conf.alias && scripts[conf.alias] ? conf.alias : null);

      if (!scriptKey) {
        findings.push(
          this.createFinding({
            id: conf.id,
            category: 'build_test',
            status: 'WARNING',
            severity: conf.required ? 'high' : 'medium',
            title: `No "${conf.name}" Script Declared in package.json`,
            explanation: `package.json does not declare a standard "${conf.name}" script.`,
            evidence: { file: 'package.json' },
            checkMethod: 'static_analysis',
            recommendation: `Add a standard "${conf.name}" script to package.json to support continuous integration.`,
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
        continue;
      }

      const scriptVal = scripts[scriptKey];

      if (!allowExec) {
        findings.push(
          this.createFinding({
            id: conf.id,
            category: 'build_test',
            status: 'NOT_RUN',
            severity: 'info',
            title: `Project Script "${conf.name}" Declared (Execution Not Run)`,
            explanation: `Found declared "${conf.name}" script ("${scriptVal}"). Execution skipped: read-only mode active (requires --allow-exec).`,
            evidence: { file: 'package.json', snippet: scriptVal },
            checkMethod: 'command_execution',
            recommendation: 'Authorize local command execution (--allow-exec) to verify build and test suites pass.',
            manualVerificationRequired: true,
            confidence: 'unverified',
            targetPath: target.path,
          })
        );
        continue;
      }

      // Execute authorized command with containment
      const execResult = execRunner(
        'npm',
        ['run', conf.name],
        targetDir,
        {
          timeoutMs,
          allowExec,
          trustProject,
          isIsolated: context.isIsolated,
          allowedCommands,
        }
      );

      // Record in audit log
      if (context.executionAudit && Array.isArray(context.executionAudit)) {
        context.executionAudit.push({
          command: 'npm',
          args: ['run', conf.name],
          cwd: targetDir,
          timestamp: new Date().toISOString(),
          durationMs: execResult.durationMs,
          exitCode: execResult.exitCode,
          timedOut: execResult.timedOut,
          isolated: execResult.isolated,
          trustMode: execResult.trustMode,
        });
      }

      if (execResult.notRun && execResult.blockedByPolicy) {
        findings.push(
          this.createFinding({
            id: conf.id,
            category: 'build_test',
            status: 'NOT_RUN',
            severity: 'medium',
            title: `Execution of "${conf.name}" Blocked by Containment Policy`,
            explanation: execResult.stderr || 'Host execution blocked: unisolated host without explicit trust.',
            evidence: { file: 'package.json', snippet: scriptVal },
            checkMethod: 'command_execution',
            recommendation: 'Provide container containment or explicitly acknowledge host trust (--trust-project).',
            manualVerificationRequired: true,
            confidence: 'unverified',
            targetPath: target.path,
          })
        );
      } else if (execResult.timedOut) {
        findings.push(
          this.createFinding({
            id: conf.id,
            category: 'build_test',
            status: 'FAIL',
            severity: 'critical',
            title: `Script "${conf.name}" Timed Out (${timeoutMs}ms)`,
            explanation: `Command "npm run ${conf.name}" exceeded execution timeout of ${timeoutMs}ms and was killed.`,
            evidence: { command: `npm run ${conf.name}`, exitCode: execResult.exitCode, durationMs: execResult.durationMs },
            checkMethod: 'command_execution',
            recommendation: 'Investigate hanging operations, deadlock, or increase timeout via --timeout.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else if (execResult.success) {
        findings.push(
          this.createFinding({
            id: conf.id,
            category: 'build_test',
            status: 'PASS',
            severity: 'info',
            title: `Script "${conf.name}" Passed (Exit Code 0)`,
            explanation: `Command "npm run ${conf.name}" completed successfully in ${execResult.durationMs}ms.`,
            evidence: { command: `npm run ${conf.name}`, exitCode: 0, durationMs: execResult.durationMs },
            checkMethod: 'command_execution',
            recommendation: 'Continue maintaining automated tests in CI pipelines.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: conf.id,
            category: 'build_test',
            status: 'FAIL',
            severity: 'critical',
            title: `Script "${conf.name}" Failed (Exit Code ${execResult.exitCode})`,
            explanation: `Command "npm run ${conf.name}" exited with non-zero code ${execResult.exitCode} in ${execResult.durationMs}ms.`,
            evidence: {
              command: `npm run ${conf.name}`,
              exitCode: execResult.exitCode,
              durationMs: execResult.durationMs,
              snippet: sanitizeOutput(execResult.stderr || execResult.stdout).slice(0, 300),
            },
            checkMethod: 'command_execution',
            recommendation: `Fix failing build/test errors before deploying to production. Inspect command output.`,
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    }

    return findings;
  }

  getLimitations() {
    return [
      'Static schema inspection detects declared validation libraries but does not dynamically exercise runtime enforcement.',
      'API contract validation parses OpenAPI documents; runtime endpoint integration requires an active staging server.',
      'Database connection pool sizing requires human architectural evaluation against target database instance capacity.',
    ];
  }
}
