import fs from 'node:fs';
import path from 'node:path';

/**
 * Validates container configuration (Dockerfiles and Docker Compose files).
 * Inspects security posture, non-root execution, health checks, multi-stage builds,
 * resource limits, and secrets isolation.
 *
 * @param {string} projectDir - Root project directory
 * @param {string[]} [files=[]] - Relative project files list
 * @returns {object[]} Array of container findings
 */
export function validateContainerSetup(projectDir, files = []) {
  const findings = [];

  // 1. Locate Dockerfiles & Compose files
  const dockerfiles = files.filter((f) => {
    const base = path.basename(f).toLowerCase();
    return (
      base === 'dockerfile' ||
      base.startsWith('dockerfile.') ||
      base.endsWith('.dockerfile') ||
      base === 'containerfile' ||
      base.startsWith('containerfile.')
    );
  });

  const composeFiles = files.filter((f) => {
    const base = path.basename(f).toLowerCase();
    return (
      base === 'docker-compose.yml' ||
      base === 'docker-compose.yaml' ||
      base === 'compose.yml' ||
      base === 'compose.yaml'
    );
  });

  if (dockerfiles.length === 0 && composeFiles.length === 0) {
    findings.push({
      id: 'DEP-CONTAINER-000',
      category: 'deployment',
      status: 'NOT_APPLICABLE',
      severity: 'info',
      title: 'Container Configuration Not Detected',
      explanation: 'No Dockerfile, Containerfile, or docker-compose manifests found in repository.',
      evidence: { file: null },
      checkMethod: 'static_analysis',
      recommendation: 'If targeting containerized platforms (Kubernetes, ECS, Cloud Run), add a multi-stage Dockerfile.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
    return findings;
  }

  // 2. Validate Dockerfiles
  for (const relPath of dockerfiles) {
    const fullPath = path.join(projectDir, relPath);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // A. Check for Unprivileged USER directive (DEP-CONTAINER-001)
    let hasUserDirective = false;
    let isRootUser = false;
    let userLine = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('USER ') || trimmed.startsWith('user ')) {
        hasUserDirective = true;
        userLine = trimmed;
        const specified = trimmed.slice(5).trim();
        if (specified === 'root' || specified === '0' || specified === '0:0') {
          isRootUser = true;
        }
      }
    }

    if (hasUserDirective && !isRootUser) {
      findings.push({
        id: 'DEP-CONTAINER-001',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'Container Runs as Unprivileged User',
        explanation: `Dockerfile "${relPath}" declares unprivileged runtime user via "${userLine}".`,
        evidence: { file: relPath, line: userLine },
        checkMethod: 'static_analysis',
        recommendation: 'Maintain non-root container execution to prevent container breakout vulnerabilities.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-CONTAINER-001',
        category: 'deployment',
        status: 'FAIL',
        severity: 'high',
        title: isRootUser
          ? 'Container Explicitly Runs as Root User'
          : 'Missing Unprivileged USER Directive in Dockerfile',
        explanation: isRootUser
          ? `Dockerfile "${relPath}" explicitly switches to root via "${userLine}".`
          : `Dockerfile "${relPath}" does not specify a USER directive. By default, OCI containers execute as root (UID 0), posing container breakout security risks.`,
        evidence: { file: relPath },
        checkMethod: 'static_analysis',
        recommendation: 'Add "USER node" or create an unprivileged user (e.g. "RUN addgroup -S app && adduser -S app -G app && USER app") before CMD/ENTRYPOINT.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }

    // B. Check for HEALTHCHECK directive (DEP-CONTAINER-002)
    const hasHealthcheck = lines.some((l) => l.trim().startsWith('HEALTHCHECK ') || l.trim().startsWith('healthcheck '));
    if (hasHealthcheck) {
      findings.push({
        id: 'DEP-CONTAINER-002',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'Container Declares HEALTHCHECK Directive',
        explanation: `Dockerfile "${relPath}" defines automated container healthcheck monitoring.`,
        evidence: { file: relPath },
        checkMethod: 'static_analysis',
        recommendation: 'Ensure healthcheck probe tests lightweight loopback endpoint with bounded timeout.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-CONTAINER-002',
        category: 'deployment',
        status: 'WARNING',
        severity: 'medium',
        title: 'Missing Container HEALTHCHECK Directive',
        explanation: `Dockerfile "${relPath}" lacks HEALTHCHECK directive. Orchestrators relying on container-level health signals cannot detect stalled processes.`,
        evidence: { file: relPath },
        checkMethod: 'static_analysis',
        recommendation: 'Add "HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1" to Dockerfile.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }

    // C. Check for Multi-Stage Build (DEP-CONTAINER-003)
    const fromStatements = lines.filter((l) => l.trim().toUpperCase().startsWith('FROM '));
    if (fromStatements.length > 1) {
      findings.push({
        id: 'DEP-CONTAINER-003',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'Multi-Stage Container Build Detected',
        explanation: `Dockerfile "${relPath}" uses ${fromStatements.length} stages, isolating build dependencies from production runtime.`,
        evidence: { file: relPath, count: fromStatements.length },
        checkMethod: 'static_analysis',
        recommendation: 'Ensure build SDKs and devDependencies are excluded from final stage.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-CONTAINER-003',
        category: 'deployment',
        status: 'WARNING',
        severity: 'low',
        title: 'Single-Stage Container Build Detected',
        explanation: `Dockerfile "${relPath}" uses a single build stage. Development dependencies, compilers, or source artifacts may inflate image size and attack surface.`,
        evidence: { file: relPath },
        checkMethod: 'static_analysis',
        recommendation: 'Adopt multi-stage builds (e.g. "FROM node:22-alpine AS builder" followed by "FROM node:22-alpine AS runner").',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }

    // D. Check for Secrets/Tokens Hardcoded in ENV/ARG (DEP-CONTAINER-005)
    const secretKeyPattern = /(password|secret|token|api_?key|private_?key)/i;
    const placeholderPattern = /^(your_.*|placeholder|changeme|xxx|<.*>|\$\{[A-Z0-9_]+\}|)$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('ENV ') || line.startsWith('ARG ')) {
        const parts = line.slice(4).trim().split('=');
        if (parts.length >= 2) {
          const varName = parts[0].trim();
          const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
          if (secretKeyPattern.test(varName) && val.length > 6 && !placeholderPattern.test(val)) {
            findings.push({
              id: 'DEP-CONTAINER-005',
              category: 'security',
              status: 'FAIL',
              severity: 'critical',
              title: `Hardcoded Secret in Dockerfile "${varName}"`,
              explanation: `Dockerfile "${relPath}" (line ${i + 1}) assigns a literal credential value to ${varName}. OCI layer history preserves secrets even if deleted in later layers.`,
              evidence: { file: relPath, line: i + 1, varName },
              checkMethod: 'static_analysis',
              recommendation: 'Remove literal secret from Dockerfile. Inject credentials at runtime via Docker secrets or Kubernetes Secrets.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
            });
          }
        }
      }
    }
  }

  // 3. Validate Docker Compose Files
  for (const relPath of composeFiles) {
    const fullPath = path.join(projectDir, relPath);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const hasLimits = content.includes('limits:') || content.includes('mem_limit:') || content.includes('cpus:');
    if (hasLimits) {
      findings.push({
        id: 'DEP-CONTAINER-004',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'Container Resource Limits Configured in Compose',
        explanation: `Compose file "${relPath}" configures CPU or memory boundaries.`,
        evidence: { file: relPath },
        checkMethod: 'static_analysis',
        recommendation: 'Verify memory limits accommodate peak load with at least 30% headroom.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-CONTAINER-004',
        category: 'deployment',
        status: 'WARNING',
        severity: 'medium',
        title: 'Missing Container Resource Limits in Compose',
        explanation: `Compose file "${relPath}" does not specify CPU/memory limits. Unconstrained containers can exhaust host resources and crash other services.`,
        evidence: { file: relPath },
        checkMethod: 'static_analysis',
        recommendation: 'Add deploy.resources.limits (e.g. cpus: "1.0", memory: "1G") to service definitions.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }
  }

  return findings;
}
