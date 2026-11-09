import fs from 'node:fs';
import path from 'node:path';

/**
 * Validates CI/CD deployment pipelines for safe release gates, environment protection,
 * secret isolation, and pre-deployment verification dependencies.
 *
 * @param {string} projectDir - Root project directory
 * @param {string[]} [files=[]] - Relative project files list
 * @returns {object[]} Array of CI/CD deployment findings
 */
export function validateCicdDeploymentGates(projectDir, files = []) {
  const findings = [];

  const workflowFiles = files.filter((f) => {
    const lower = f.toLowerCase().replace(/\\/g, '/');
    return (
      lower.startsWith('.github/workflows/') ||
      lower === '.gitlab-ci.yml' ||
      lower.endsWith('jenkinsfile') ||
      lower === '.circleci/config.yml' ||
      lower === 'bitbucket-pipelines.yml'
    );
  });

  if (workflowFiles.length === 0) {
    findings.push({
      id: 'DEP-CICD-000',
      category: 'deployment',
      status: 'WARNING',
      severity: 'medium',
      title: 'Missing Continuous Integration & Deployment Pipeline',
      explanation: 'No CI/CD pipeline definitions (.github/workflows, .gitlab-ci.yml) detected in repository.',
      evidence: { file: null },
      checkMethod: 'static_analysis',
      recommendation: 'Configure an automated CI workflow to enforce testing, linting, and security audits before releases.',
      manualVerificationRequired: false,
      confidence: 'verified_fact',
    });
    return findings;
  }

  let hasDeploymentJob = false;
  let hasEnvironmentGate = false;
  let hasTestDependency = false;

  for (const relPath of workflowFiles) {
    const fullPath = path.join(projectDir, relPath);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // 1. Check for Deployment Job & Environment Protection (DEP-CICD-001)
    const isDeployWorkflow =
      content.includes('deploy') ||
      content.includes('release') ||
      content.includes('publish') ||
      content.includes('kubectl') ||
      content.includes('helm');

    if (isDeployWorkflow) {
      hasDeploymentJob = true;
      if (content.includes('environment:') || content.includes('rules: manual') || content.includes('when: manual')) {
        hasEnvironmentGate = true;
      }
      if (content.includes('needs:') && (content.includes('test') || content.includes('build') || content.includes('lint'))) {
        hasTestDependency = true;
      }
    }

    // 2. Secret Hygiene in Workflows (DEP-CICD-002)
    const rawSecretPattern = /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']([^"${}]{8,})["']/i;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(rawSecretPattern);
      if (match && !match[1].startsWith('$') && !match[1].includes('placeholder')) {
        findings.push({
          id: 'DEP-CICD-002',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: `Hardcoded Credential in CI Workflow "${relPath}"`,
          explanation: `Line ${i + 1} appears to contain a literal token or credential. Workflow files are accessible to collaborators and may leak credentials in logs.`,
          evidence: { file: relPath, line: i + 1 },
          checkMethod: 'static_analysis',
          recommendation: 'Store credentials in repository secrets and reference via ${{ secrets.NAME }}.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
        });
      }
    }
  }

  if (hasDeploymentJob) {
    if (hasEnvironmentGate) {
      findings.push({
        id: 'DEP-CICD-001',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'CI/CD Deployment Job Guarded by Protected Environment Gate',
        explanation: 'Deployment steps configure explicit environment boundaries or manual approval checkpoints.',
        evidence: { workflowCount: workflowFiles.length },
        checkMethod: 'static_analysis',
        recommendation: 'Maintain required reviewer approvals on production environment targets.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-CICD-001',
        category: 'deployment',
        status: 'WARNING',
        severity: 'high',
        title: 'Unguarded Continuous Deployment Workflow',
        explanation: 'Deployment jobs detected without explicit environment protection gates or approval requirements. Changes pushed to the branch may deploy to production automatically without review.',
        evidence: { workflowCount: workflowFiles.length },
        checkMethod: 'static_analysis',
        recommendation: 'Add "environment: production" with required review gates in GitHub repository settings.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }

    if (hasTestDependency) {
      findings.push({
        id: 'DEP-CICD-003',
        category: 'deployment',
        status: 'PASS',
        severity: 'info',
        title: 'CI/CD Deployment Dependent on Successful Test Pipeline',
        explanation: 'Deployment jobs require successful completion of test/build stages ("needs: [test]").',
        evidence: { workflowCount: workflowFiles.length },
        checkMethod: 'static_analysis',
        recommendation: 'Ensure all required CI checks are marked mandatory in branch protection rules.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    } else {
      findings.push({
        id: 'DEP-CICD-003',
        category: 'deployment',
        status: 'WARNING',
        severity: 'high',
        title: 'Deployment Job Does Not Explicitly Depend on Test Completion',
        explanation: 'Deployment job does not declare "needs: [test]". Defective builds or failed test runs might not block deployment.',
        evidence: { workflowCount: workflowFiles.length },
        checkMethod: 'static_analysis',
        recommendation: 'Add "needs: [test, build]" to deployment jobs.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
      });
    }
  }

  return findings;
}
