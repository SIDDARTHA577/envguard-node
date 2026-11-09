/**
 * Deployment Readiness Gate Evaluator.
 * Distinguishes build readiness from deployment readiness.
 *
 * Enforces core architectural principles:
 * 1. A passing build or test suite does NOT imply an application is safe to deploy.
 * 2. Unprivileged containers, health probes, graceful shutdown, and rollback capabilities
 *    are mandatory deployment prerequisites.
 * 3. The agent NEVER triggers production deployments automatically. Deployment execution
 *    is strictly guarded and requires separate, explicit operator authorization.
 */

export const DEPLOYMENT_GATE_VERDICTS = {
  READY_FOR_DEPLOYMENT: 'READY_FOR_DEPLOYMENT',
  REQUIRES_MANUAL_APPROVAL: 'REQUIRES_MANUAL_APPROVAL',
  BLOCKED: 'BLOCKED',
};

export const DEPLOYMENT_EXECUTION_GUARD = {
  autoDeployAllowed: false,
  policy: 'STRICT_NO_AUTO_DEPLOY',
  reason:
    'Deployment execution requires separate, explicit human authorization. EnvGuard is a readiness audit tool and never executes production deployments autonomously.',
};

/**
 * Evaluates full deployment readiness across container configuration, Kubernetes manifests,
 * CI/CD pipelines, and operational reliability findings.
 *
 * @param {object} params
 * @param {object[]} params.deploymentFindings - Findings from container, k8s, cicd, and reliability validators
 * @param {object[]} [params.policyFindings=[]] - Overall findings from readiness audit
 * @param {object} [params.options={}] - Optional evaluation options
 * @returns {object} Comprehensive deployment gate verdict with blockers and prerequisites
 */
export function evaluateDeploymentGate({
  deploymentFindings = [],
  policyFindings = [],
  options = {},
} = {}) {
  const allFindings = [...deploymentFindings, ...policyFindings];

  const blockers = [];
  const warnings = [];
  const missingPrerequisites = [];

  for (const f of allFindings) {
    if (f.status === 'FAIL') {
      blockers.push({
        id: f.id,
        category: f.category,
        title: f.title,
        severity: f.severity,
        recommendation: f.recommendation,
      });
    } else if (f.status === 'WARNING') {
      warnings.push({
        id: f.id,
        category: f.category,
        title: f.title,
        severity: f.severity,
        recommendation: f.recommendation,
      });
    }
  }

  // Check critical deployment prerequisites
  const hasHealthCheck = allFindings.some(
    (f) =>
      (f.id === 'DEP-002' || f.id === 'DEP-CONTAINER-002' || f.id === 'DEP-K8S-001') &&
      f.status === 'PASS'
  );
  if (!hasHealthCheck) {
    const isApplicable = !allFindings.some(
      (f) => (f.id === 'DEP-002' || f.id === 'DEP-K8S-001') && f.status === 'NOT_APPLICABLE'
    );
    if (isApplicable) {
      missingPrerequisites.push({
        id: 'PREREQ-HEALTH-CHECK',
        title: 'Lightweight Health Probe (/health, /healthz, or readinessProbe)',
        impact: 'Container orchestrators and load balancers cannot detect service readiness.',
      });
    }
  }

  const hasGracefulShutdown = allFindings.some(
    (f) => (f.id === 'DEP-003' || f.id === 'DEP-REL-001') && f.status === 'PASS'
  );
  if (!hasGracefulShutdown) {
    const isApplicable = !allFindings.some(
      (f) => (f.id === 'DEP-003' || f.id === 'DEP-REL-001') && f.status === 'NOT_APPLICABLE'
    );
    if (isApplicable) {
      missingPrerequisites.push({
        id: 'PREREQ-GRACEFUL-SHUTDOWN',
        title: 'SIGTERM/SIGINT Process Shutdown Handler with Connection Draining',
        impact: 'In-flight HTTP requests and database transactions will be abruptly severed during rollout.',
      });
    }
  }

  // Determine gate verdict
  let verdict;
  let deployable = false;

  if (blockers.length > 0 || missingPrerequisites.length > 0) {
    verdict = DEPLOYMENT_GATE_VERDICTS.BLOCKED;
    deployable = false;
  } else if (warnings.length > 0) {
    verdict = DEPLOYMENT_GATE_VERDICTS.REQUIRES_MANUAL_APPROVAL;
    deployable = false; // Requires explicit manual human sign-off
  } else {
    verdict = DEPLOYMENT_GATE_VERDICTS.READY_FOR_DEPLOYMENT;
    deployable = true;
  }

  return {
    verdict,
    deployable,
    executionGuard: DEPLOYMENT_EXECUTION_GUARD,
    summary: {
      totalEvaluated: allFindings.length,
      blockersCount: blockers.length,
      warningsCount: warnings.length,
      missingPrerequisitesCount: missingPrerequisites.length,
    },
    blockers,
    warnings,
    missingPrerequisites,
    educationalGuidance: [
      'A passing build/test suite verifies code compilation and functional logic, but does NOT verify operational deployment readiness.',
      'Production deployment requires verified health probes, non-root container isolation, resource caps, and rollback plans.',
      'Deployment execution must always be triggered by an authorized human operator or secure CD pipeline, never by an autonomous agent.',
    ],
  };
}
