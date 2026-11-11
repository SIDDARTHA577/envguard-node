import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION } from '../constants.mjs';
import { checkGitTracking, parseGitignoreRules, isPathIgnoredByRules } from '../execution/git.mjs';

/**
 * Universal Language-Agnostic Repository Hygiene Adapter.
 * Applies to all repository structures regardless of language or framework.
 */
export class GenericAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'generic',
      name: 'Generic Repository Hygiene Adapter',
      version: TOOL_VERSION,
      description: 'Assesses language-agnostic repository hygiene, Git safety, secret leak defenses, and CI automation.',
      supportedLanguages: ['*'],
      supportedFrameworks: ['*'],
      requiredTools: ['git'],
    });
  }

  detect(target, _context) {
    // Generic adapter applies to all repositories and root/workspace targets
    return {
      matched: true,
      confidence: 1.0,
      reason: 'Universal language-agnostic repository hygiene adapter.',
      metadata: { isRoot: target.isRoot ?? true },
    };
  }

  getCapabilities() {
    return [
      'repo_hygiene',
      'secret_leak_defense',
      'gitignore_validation',
      'dependency_automation',
      'container_configuration',
      'ci_workflow',
    ];
  }

  getApplicableChecks(_target, _context) {
    return [
      { id: 'ENV-002', name: 'Secret Files Excluded in .gitignore', category: 'env', required: true },
      { id: 'ENV-004', name: 'Committed Secret Detection', category: 'env', required: true },
      { id: 'SEC-001', name: 'Automated Dependency Security Tooling', category: 'security', required: true },
      { id: 'DEP-001', name: 'Container Configuration Present', category: 'deployment', required: false },
      { id: 'DEP-004', name: 'Continuous Integration Workflow Configured', category: 'deployment', required: true },
    ];
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    // --- Check 1: ENV-002 (.gitignore Exclusions) ---
    const gitignorePath = path.join(projectDir, '.gitignore');
    const gitignoreExists = fs.existsSync(gitignorePath);
    let gitignoreRules = [];

    if (gitignoreExists) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        gitignoreRules = parseGitignoreRules(content);
        const hasEnvIgnored =
          content.includes('.env') || gitignoreRules.some((r) => r.pattern.includes('.env'));

        if (hasEnvIgnored) {
          findings.push(
            this.createFinding({
              id: 'ENV-002',
              category: 'env',
              status: 'PASS',
              severity: 'info',
              title: 'Secret Environment Files Excluded in .gitignore',
              explanation: '.gitignore contains exclusion rules for .env files.',
              evidence: { file: '.gitignore' },
              checkMethod: 'static_analysis',
              recommendation: 'Ensure all local secret files (.env, .env.local, *.key) remain gitignored.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );
        } else {
          findings.push(
            this.createFinding({
              id: 'ENV-002',
              category: 'env',
              status: 'FAIL',
              severity: 'critical',
              title: 'Secret Files Not Excluded in .gitignore',
              explanation: '.gitignore does not contain explicit rules to exclude ".env" or ".env.*" files.',
              evidence: { file: '.gitignore' },
              checkMethod: 'static_analysis',
              recommendation:
              'Add ".env", ".env.*", "!.env.example", and "*.key" to .gitignore to prevent accidental credential commits. Note: updating .gitignore does not remove already-tracked secrets from Git history.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );
        }
      } catch (err) {
        findings.push(
          this.createFinding({
            id: 'ENV-002',
            category: 'env',
            status: 'ERROR',
            severity: 'critical',
            title: 'Error Reading .gitignore',
            explanation: `Failed to inspect .gitignore: ${err.message}`,
            evidence: { file: '.gitignore' },
            checkMethod: 'static_analysis',
            recommendation: 'Verify file permissions for .gitignore.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    } else {
      findings.push(
        this.createFinding({
          id: 'ENV-002',
          category: 'env',
          status: 'FAIL',
          severity: 'critical',
          title: 'Missing .gitignore File',
          explanation: 'No .gitignore file found in repository root. High risk of accidental secret commits.',
          evidence: { file: '.gitignore' },
          checkMethod: 'static_analysis',
          recommendation: 'Create a .gitignore file and exclude .env, .env.local, node_modules, and sensitive files.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // --- Check 2: ENV-004 (Committed Secret Detection) ---
    const localEnvFiles = files.filter(
      (f) =>
        (f === '.env' || f === '.env.local' || f === '.env.production') &&
        !f.includes('example') &&
        !f.includes('template') &&
        !f.includes('sample')
    );

    if (localEnvFiles.length === 0) {
      findings.push(
        this.createFinding({
          id: 'ENV-004',
          category: 'env',
          status: 'PASS',
          severity: 'info',
          title: 'No Committed Secret Environment Files Detected',
          explanation: 'No tracked .env or secret environment credential files were found in Git tracking index.',
          evidence: { file: '.gitignore' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure pre-commit hooks verify no secret files are staged for commit.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      for (const envFile of localEnvFiles) {
        const gitStatus = checkGitTracking(projectDir, envFile);

        if (gitStatus.isGitRepo && gitStatus.isTracked) {
          findings.push(
            this.createFinding({
              id: 'ENV-004',
              category: 'env',
              status: 'FAIL',
              severity: 'critical',
              title: 'Sensitive .env File Tracked in Git Repository',
              explanation: `Found live environment file "${envFile}" tracked in Git repository index.`,
              evidence: { file: envFile },
              checkMethod: 'static_analysis',
              recommendation:
                'Remove live .env file from Git tracking immediately (git rm --cached) and rotate any exposed secrets. Note: adding .gitignore rules alone does not remove tracked secrets from Git commit history.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );
        } else {
          // File exists in working tree but is NOT tracked by Git
          const isIgnored = isPathIgnoredByRules(gitignoreRules, envFile);
          if (isIgnored) {
            findings.push(
              this.createFinding({
                id: 'ENV-004',
                category: 'env',
                status: 'PASS',
                severity: 'info',
                title: 'Local .env File Exists in Working Tree (Safely Ignored by Git)',
                explanation: `Local file "${envFile}" exists in working tree but is safely excluded by .gitignore and not tracked by Git.`,
                evidence: { file: envFile },
                checkMethod: 'static_analysis',
                recommendation: 'Keep working-tree secret files strictly out of version control.',
                manualVerificationRequired: false,
                confidence: 'verified_fact',
                targetPath: target.path,
              })
            );
          } else {
            findings.push(
              this.createFinding({
                id: 'ENV-004',
                category: 'env',
                status: 'FAIL',
                severity: 'high',
                title: 'Untracked .env File in Working Tree Not Excluded by .gitignore',
                explanation: `Local file "${envFile}" is not ignored by .gitignore rules. High risk of accidental commit.`,
                evidence: { file: envFile },
                checkMethod: 'static_analysis',
                recommendation: 'Add rule to .gitignore to exclude this file before committing.',
                manualVerificationRequired: false,
                confidence: 'verified_fact',
                targetPath: target.path,
              })
            );
          }
        }
      }
    }

    // --- Check 3: SEC-001 (Automated Dependency Security Tooling) ---
    const hasDependabot =
      fs.existsSync(path.join(projectDir, '.github', 'dependabot.yml')) ||
      fs.existsSync(path.join(projectDir, '.github', 'dependabot.yaml'));
    const hasRenovate =
      fs.existsSync(path.join(projectDir, 'renovate.json')) ||
      fs.existsSync(path.join(projectDir, '.github', 'renovate.json'));

    if (hasDependabot || hasRenovate) {
      findings.push(
        this.createFinding({
          id: 'SEC-001',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Automated Dependency Security Tooling Configured',
          explanation: `Detected automated dependency management configuration: ${hasDependabot ? 'Dependabot' : 'Renovate'}.`,
          evidence: { file: hasDependabot ? '.github/dependabot.yml' : 'renovate.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Regularly triage and merge automated security updates.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'SEC-001',
          category: 'security',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Automated Dependency Security Scanning Config',
          explanation: 'No Dependabot (.github/dependabot.yml) or Renovate configuration detected.',
          evidence: { file: '.github/' },
          checkMethod: 'static_analysis',
          recommendation: 'Configure Dependabot or Renovate to automatically detect and patch vulnerable dependencies.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // --- Check 4: DEP-001 (Container Configuration) ---
    const dockerFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'Containerfile'].filter(
      (f) => fs.existsSync(path.join(targetDir, f)) || fs.existsSync(path.join(projectDir, f))
    );

    if (dockerFiles.length > 0) {
      findings.push(
        this.createFinding({
          id: 'DEP-001',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Container Configuration Present (Dockerfile / Compose)',
          explanation: `Found containerization configuration: ${dockerFiles.join(', ')}.`,
          evidence: { file: dockerFiles[0] },
          checkMethod: 'static_analysis',
          recommendation: 'Verify non-root user execution and multi-stage build caching.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'DEP-001',
          category: 'deployment',
          status: 'WARNING',
          severity: 'low',
          title: 'No Dockerfile or Container Configuration Found',
          explanation: 'No Dockerfile or docker-compose.yml detected in repository or target directory.',
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Add a multi-stage Dockerfile to standardize production builds and container deployment.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // --- Check 5: DEP-004 (Continuous Integration Workflow) ---
    const ghWorkflows = path.join(projectDir, '.github', 'workflows');
    const hasGhWorkflows = fs.existsSync(ghWorkflows) && fs.readdirSync(ghWorkflows).some((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    const hasGitlabCi = fs.existsSync(path.join(projectDir, '.gitlab-ci.yml'));

    if (hasGhWorkflows || hasGitlabCi) {
      findings.push(
        this.createFinding({
          id: 'DEP-004',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Continuous Integration Workflow Configured',
          explanation: `Detected automated CI workflow: ${hasGhWorkflows ? '.github/workflows' : '.gitlab-ci.yml'}.`,
          evidence: { file: hasGhWorkflows ? '.github/workflows' : '.gitlab-ci.yml' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure CI runs lint, typecheck, test, and security audit on every pull request.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'DEP-004',
          category: 'deployment',
          status: 'WARNING',
          severity: 'high',
          title: 'Missing CI/CD Workflow Automation',
          explanation: 'No GitHub Actions workflows or GitLab CI configurations detected.',
          evidence: { file: '.github/' },
          checkMethod: 'static_analysis',
          recommendation: 'Configure CI to automatically test and validate builds before deployment (envguard-ci).',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    return findings;
  }

  getLimitations() {
    return [
      'Static analysis scans top-level and Git-tracked paths; untracked binaries or archives are not decompiled.',
      'Containerfile quality checks do not verify live Docker daemon build steps or registry image signatures.',
    ];
  }
}
