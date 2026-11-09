import fs from 'node:fs';
import path from 'node:path';

/**
 * Validates Kubernetes manifests for production deployment readiness.
 * Evaluates health probes (liveness/readiness), resource limits, security contexts,
 * and high-availability replica counts.
 *
 * @param {string} projectDir - Root project directory
 * @param {string[]} [files=[]] - Relative project files list
 * @returns {object[]} Array of Kubernetes deployment findings
 */
export function validateKubernetesManifests(projectDir, files = []) {
  const findings = [];

  // Filter potential k8s manifest files
  const k8sFiles = files.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    if (ext !== '.yaml' && ext !== '.yml') return false;
    const lower = f.toLowerCase().replace(/\\/g, '/');
    return (
      lower.includes('k8s') ||
      lower.includes('deploy') ||
      lower.includes('manifest') ||
      lower.includes('helm') ||
      lower.includes('chart') ||
      path.basename(lower).startsWith('deployment')
    );
  });

  const parsedWorkloads = [];

  for (const relPath of k8sFiles) {
    const fullPath = path.join(projectDir, relPath);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    // Check if it looks like a Kubernetes workload manifest
    if (
      content.includes('apiVersion:') &&
      (content.includes('kind: Deployment') ||
        content.includes('kind: StatefulSet') ||
        content.includes('kind: DaemonSet') ||
        content.includes('kind: Pod'))
    ) {
      parsedWorkloads.push({
        file: relPath,
        content,
        isDeployment: content.includes('kind: Deployment'),
        isStatefulSet: content.includes('kind: StatefulSet'),
      });
    }
  }

  if (parsedWorkloads.length === 0) {
    findings.push({
      id: 'DEP-K8S-000',
      category: 'deployment',
      status: 'NOT_APPLICABLE',
      severity: 'info',
      title: 'Kubernetes Manifests Not Detected',
      explanation: 'No Kubernetes workload manifests (Deployments, StatefulSets) found in repository.',
      evidence: { file: null },
      checkMethod: 'static_analysis',
      recommendation: 'If targeting Kubernetes, ensure manifests configure liveness/readiness probes and explicit resource boundaries.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
    return findings;
  }

  for (const workload of parsedWorkloads) {
    const { file, content } = workload;

    // 1. Health Probes (DEP-K8S-001)
    const hasReadinessProbe = content.includes('readinessProbe:');
    const hasLivenessProbe = content.includes('livenessProbe:');

    if (hasReadinessProbe && hasLivenessProbe) {
      findings.push({
        id: 'DEP-K8S-001',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'Kubernetes Health Probes Configured',
        explanation: `Manifest "${file}" defines both readinessProbe and livenessProbe.`,
        evidence: { file },
        checkMethod: 'static_analysis',
        recommendation: 'Ensure readiness probe checks database readiness while liveness probe checks process health only.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-K8S-001',
        category: 'deployment',
        status: 'FAIL',
        severity: 'high',
        title: 'Missing Kubernetes Readiness or Liveness Probe',
        explanation: `Manifest "${file}" lacks ${
          !hasReadinessProbe && !hasLivenessProbe
            ? 'both readinessProbe and livenessProbe'
            : !hasReadinessProbe
            ? 'readinessProbe'
            : 'livenessProbe'
        }. Without probes, Kubernetes cannot route traffic safely during rollouts or restart hung pods.`,
        evidence: { file, hasReadinessProbe, hasLivenessProbe },
        checkMethod: 'static_analysis',
        recommendation: 'Add readinessProbe (httpGet on /readyz) and livenessProbe (httpGet on /livez) with suitable initialDelaySeconds.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }

    // 2. Resource Requests and Limits (DEP-K8S-002)
    const hasRequests = content.includes('requests:');
    const hasLimits = content.includes('limits:');

    if (hasRequests && hasLimits) {
      findings.push({
        id: 'DEP-K8S-002',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'Kubernetes Resource Requests & Limits Specified',
        explanation: `Manifest "${file}" defines both CPU/memory requests and limits.`,
        evidence: { file },
        checkMethod: 'static_analysis',
        recommendation: 'Verify request sizing matches baseline utilization and limits allow burst headroom.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-K8S-002',
        category: 'deployment',
        status: 'WARNING',
        severity: 'medium',
        title: 'Missing Kubernetes Resource Requests or Limits',
        explanation: `Manifest "${file}" does not define both resource requests and limits. Unbounded pods can cause node resource starvation and eviction cascades.`,
        evidence: { file, hasRequests, hasLimits },
        checkMethod: 'static_analysis',
        recommendation: 'Specify resources.requests and resources.limits for CPU (e.g. 250m / 500m) and memory (e.g. 512Mi / 1Gi).',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }

    // 3. Security Context & Non-Root Execution (DEP-K8S-003)
    const hasRunAsNonRoot = content.includes('runAsNonRoot: true');
    const hasReadOnlyRoot = content.includes('readOnlyRootFilesystem: true');
    const hasNoPrivEscalation = content.includes('allowPrivilegeEscalation: false');

    if (hasRunAsNonRoot || hasNoPrivEscalation) {
      findings.push({
        id: 'DEP-K8S-003',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'Kubernetes Pod Security Context Hardened',
        explanation: `Manifest "${file}" configures pod security constraints (${[
          hasRunAsNonRoot ? 'runAsNonRoot: true' : null,
          hasNoPrivEscalation ? 'allowPrivilegeEscalation: false' : null,
          hasReadOnlyRoot ? 'readOnlyRootFilesystem: true' : null,
        ]
          .filter(Boolean)
          .join(', ')}).`,
        evidence: { file },
        checkMethod: 'static_analysis',
        recommendation: 'Maintain strict Pod Security Standards (Restricted profile).',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-K8S-003',
        category: 'deployment',
        status: 'WARNING',
        severity: 'medium',
        title: 'Missing Kubernetes Pod Security Context Hardening',
        explanation: `Manifest "${file}" lacks hardened securityContext settings (runAsNonRoot: true, allowPrivilegeEscalation: false).`,
        evidence: { file },
        checkMethod: 'static_analysis',
        recommendation: 'Add securityContext: runAsNonRoot: true and allowPrivilegeEscalation: false to pod spec.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }

    // 4. Replica Count & High Availability (DEP-K8S-004)
    if (workload.isDeployment) {
      const matchReplicas = content.match(/replicas:\s*(\d+)/);
      const replicas = matchReplicas ? parseInt(matchReplicas[1], 10) : 1;

      if (replicas >= 2) {
        findings.push({
          id: 'DEP-K8S-004',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Multi-Replica Kubernetes High Availability Configured',
          explanation: `Manifest "${file}" configures replicas: ${replicas}, eliminating single-pod compute SPOF.`,
          evidence: { file, replicas },
          checkMethod: 'static_analysis',
          recommendation: 'Pair with HorizontalPodAutoscaler (HPA) and PodDisruptionBudget (PDB).',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
        });
      } else {
        findings.push({
          id: 'DEP-K8S-004',
          category: 'deployment',
          status: 'WARNING',
          severity: 'high',
          title: 'Single-Replica Deployment SPOF in Kubernetes',
          explanation: `Manifest "${file}" specifies replicas: 1. A single replica cannot provide zero-downtime rolling updates or survive node rescheduling.`,
          evidence: { file, replicas: 1 },
          checkMethod: 'static_analysis',
          recommendation: 'Configure replicas: 2 or greater behind an Ingress or ClusterIP service.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
        });
      }
    }
  }

  return findings;
}
