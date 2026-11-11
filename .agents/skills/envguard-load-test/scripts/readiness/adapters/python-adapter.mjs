import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION, sanitizeOutput } from '../constants.mjs';

/**
 * Platform Adapter for Python Applications (Django, FastAPI, Flask).
 * Performs evidence-based static and executable production readiness assessments.
 */
export class PythonAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'python',
      name: 'Python Platform Readiness Adapter',
      version: TOOL_VERSION,
      description: 'Assesses Python applications using Django, FastAPI, Flask, and standard packaging (pip, poetry, uv, pipenv).',
      supportedLanguages: ['python'],
      supportedFrameworks: ['django', 'fastapi', 'flask'],
      requiredTools: ['python'],
    });
  }

  /**
   * Detects whether the target application is a Python project.
   */
  detect(target, context) {
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const pythonManifests = [
      'pyproject.toml',
      'requirements.txt',
      'requirements-dev.txt',
      'Pipfile',
      'setup.py',
      'setup.cfg',
      'manage.py',
      'alembic.ini',
    ];

    const detectedManifests = pythonManifests.filter((m) =>
      fs.existsSync(path.join(targetDir, m))
    );

    const hasPythonFiles = files.some(
      (f) =>
        f.endsWith('.py') &&
        !f.includes('.venv/') &&
        !f.includes('venv/') &&
        !f.includes('site-packages/')
    );

    if (detectedManifests.length === 0 && !hasPythonFiles) {
      return {
        matched: false,
        confidence: 0,
        reason: 'No Python project files, manifests, or source code detected.',
      };
    }

    // Identify frameworks
    const frameworks = [];
    let detectedFramework = null;

    // Check Django
    if (
      fs.existsSync(path.join(targetDir, 'manage.py')) ||
      this.hasDependency(targetDir, 'django')
    ) {
      frameworks.push('django');
      detectedFramework = 'django';
    }

    // Check FastAPI
    if (this.hasDependency(targetDir, 'fastapi')) {
      frameworks.push('fastapi');
      if (!detectedFramework) detectedFramework = 'fastapi';
    }

    // Check Flask
    if (this.hasDependency(targetDir, 'flask')) {
      frameworks.push('flask');
      if (!detectedFramework) detectedFramework = 'flask';
    }

    return {
      matched: true,
      confidence: detectedFramework ? 1.0 : detectedManifests.length > 0 ? 0.9 : 0.7,
      reason: detectedFramework
        ? `Detected Python application using ${detectedFramework} (${detectedManifests.join(', ')}).`
        : `Detected Python application with manifests: ${detectedManifests.join(', ')}.`,
      metadata: {
        frameworks,
        manifests: detectedManifests,
      },
    };
  }

  /**
   * Helper to inspect requirements.txt or pyproject.toml for a dependency name.
   */
  hasDependency(targetDir, depName) {
    const depLower = depName.toLowerCase();
    const candidates = ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml', 'Pipfile'];

    for (const c of candidates) {
      const full = path.join(targetDir, c);
      if (fs.existsSync(full)) {
        try {
          const content = fs.readFileSync(full, 'utf8').toLowerCase();
          if (content.includes(depLower)) return true;
        } catch { /* ignore non-critical read/parse error */ }
      }
    }
    return false;
  }

  getCapabilities() {
    return [
      'python_discovery',
      'django_readiness',
      'fastapi_readiness',
      'flask_readiness',
      'python_sql_injection',
      'python_env_secrets',
      'python_test_suite',
      'python_wsgi_asgi',
    ];
  }

  getApplicableChecks(_target, _context) {
    return [
      { id: 'PY-DISC-001', name: 'Python Project Manifest & Packaging Configured', category: 'discovery', required: true },
      { id: 'PY-DISC-002', name: 'Explicit Python Runtime Version Declared', category: 'discovery', required: true },
      { id: 'PY-DISC-003', name: 'Deterministic Lockfile or Version Pinning Present', category: 'discovery', required: false },
      { id: 'PY-ENV-001', name: 'Environment Configuration & Secret Management', category: 'env', required: true },
      { id: 'PY-SEC-001', name: 'Hardcoded SECRET_KEY or Production DEBUG Mode Guard', category: 'security', required: true },
      { id: 'PY-SEC-002', name: 'Host Header Guardrails (ALLOWED_HOSTS)', category: 'security', required: false },
      { id: 'PY-SEC-003', name: 'Session & CSRF Cookie Security Flags', category: 'security', required: false },
      { id: 'PY-SEC-004', name: 'SQL Injection Defenses & Parameterized Queries', category: 'database', required: true },
      { id: 'PY-SEC-005', name: 'Cross-Site Request Forgery (CSRF) Protection', category: 'security', required: false },
      { id: 'PY-SEC-006', name: 'Cross-Origin Resource Sharing (CORS) Configuration', category: 'security', required: false },
      { id: 'PY-DB-001', name: 'Database Migration Framework Configured', category: 'database', required: false },
      { id: 'PY-TEST-001', name: 'Automated Test Suite Configured', category: 'build_test', required: true },
      { id: 'PY-DEPLOY-001', name: 'Production WSGI/ASGI Server Configured', category: 'deployment', required: false },
    ];
  }

  getLimitations() {
    return [
      'Python static analysis scans top-level source files; dynamic imports and runtime monkey-patching cannot be statically resolved.',
      'Executable Django deployment check (python manage.py check --deploy) requires authorized test execution with active settings.',
      'Dependency security vulnerability checks require integration with dedicated scanners such as pip-audit.',
    ];
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    // Filter relevant python files
    const pyFiles = files.filter(
      (f) =>
        f.endsWith('.py') &&
        !f.includes('.venv/') &&
        !f.includes('venv/') &&
        !f.includes('site-packages/')
    );

    // =========================================================================
    // PY-DISC-001: Python Manifest & Packaging Configured
    // =========================================================================
    const hasPyproject = fs.existsSync(path.join(targetDir, 'pyproject.toml'));
    const hasRequirements = fs.existsSync(path.join(targetDir, 'requirements.txt'));
    const hasPipfile = fs.existsSync(path.join(targetDir, 'Pipfile'));
    const hasSetupPy = fs.existsSync(path.join(targetDir, 'setup.py'));

    if (hasPyproject || hasRequirements || hasPipfile || hasSetupPy) {
      const manifestFile = hasPyproject
        ? 'pyproject.toml'
        : hasRequirements
        ? 'requirements.txt'
        : hasPipfile
        ? 'Pipfile'
        : 'setup.py';
      findings.push(
        this.createFinding({
          id: 'PY-DISC-001',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Python Project Manifest Detected',
          explanation: `Found standard Python project manifest file at "${manifestFile}".`,
          evidence: { file: manifestFile },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain explicit dependency declarations with minimum version bounds.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'PY-DISC-001',
          category: 'discovery',
          status: 'WARNING',
          severity: 'high',
          title: 'Missing Python Project Manifest (pyproject.toml or requirements.txt)',
          explanation: 'Python source files exist, but no standard packaging manifest (pyproject.toml, requirements.txt, Pipfile) was detected.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Create a pyproject.toml (PEP 621) or requirements.txt to declare project dependencies.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // PY-DISC-002: Explicit Python Runtime Version Constraint
    // =========================================================================
    let declaredPythonVersion = null;
    let versionEvidenceFile = null;

    if (hasPyproject) {
      try {
        const pyproject = fs.readFileSync(path.join(targetDir, 'pyproject.toml'), 'utf8');
        const match = pyproject.match(/(?:requires-python|python)\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
          declaredPythonVersion = match[1];
          versionEvidenceFile = 'pyproject.toml';
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (!declaredPythonVersion && fs.existsSync(path.join(targetDir, '.python-version'))) {
      try {
        declaredPythonVersion = fs.readFileSync(path.join(targetDir, '.python-version'), 'utf8').trim();
        versionEvidenceFile = '.python-version';
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (declaredPythonVersion) {
      findings.push(
        this.createFinding({
          id: 'PY-DISC-002',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Explicit Python Runtime Version Declared',
          explanation: `Target Python version declared as "${declaredPythonVersion}" in ${versionEvidenceFile}.`,
          evidence: { file: versionEvidenceFile },
          checkMethod: 'static_analysis',
          recommendation: 'Test compatibility across all supported Python minor versions in CI.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'PY-DISC-002',
          category: 'discovery',
          status: 'WARNING',
          severity: 'medium',
          title: 'Undeclared Python Runtime Version Constraint',
          explanation: 'Project does not declare an explicit Python version constraint in pyproject.toml (requires-python) or .python-version.',
          evidence: { file: hasPyproject ? 'pyproject.toml' : '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Declare requires-python = ">=3.11" in pyproject.toml to prevent deployment on incompatible runtimes.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // PY-DISC-003: Deterministic Lockfile Present
    // =========================================================================
    const lockfiles = ['poetry.lock', 'uv.lock', 'Pipfile.lock', 'pdm.lock'];
    const detectedLock = lockfiles.find((l) => fs.existsSync(path.join(targetDir, l)));

    if (detectedLock) {
      findings.push(
        this.createFinding({
          id: 'PY-DISC-003',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Deterministic Dependency Lockfile Present',
          explanation: `Found lockfile "${detectedLock}" ensuring reproducible dependency resolution in production.`,
          evidence: { file: detectedLock },
          checkMethod: 'static_analysis',
          recommendation: 'Keep lockfile committed in version control and update via CI automations.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'PY-DISC-003',
          category: 'discovery',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Deterministic Dependency Lockfile',
          explanation: 'No dependency lockfile (poetry.lock, uv.lock, Pipfile.lock) detected. Production builds may suffer dependency drift.',
          evidence: { file: hasRequirements ? 'requirements.txt' : '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Use a modern packaging tool with lockfile support (uv, poetry) or pin exact package hashes.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // PY-ENV-001: Environment Configuration & Secret Loading
    // =========================================================================
    const hasEnvExample =
      fs.existsSync(path.join(targetDir, '.env.example')) ||
      fs.existsSync(path.join(projectDir, '.env.example'));
    let usesEnvLibrary = false;

    for (const relFile of pyFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        if (
          content.includes('os.environ') ||
          content.includes('os.getenv') ||
          content.includes('BaseSettings') ||
          content.includes('decouple') ||
          content.includes('environ')
        ) {
          usesEnvLibrary = true;
          break;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (hasEnvExample && usesEnvLibrary) {
      findings.push(
        this.createFinding({
          id: 'PY-ENV-001',
          category: 'env',
          status: 'PASS',
          severity: 'info',
          title: 'Environment Variable Configuration & Template Present',
          explanation: 'Found .env.example template and environment variable access patterns across application sources.',
          evidence: { file: '.env.example' },
          checkMethod: 'static_analysis',
          recommendation: 'Validate all required environment configuration variables at application boot.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (!hasEnvExample) {
      findings.push(
        this.createFinding({
          id: 'PY-ENV-001',
          category: 'env',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing .env.example Template for Python Project',
          explanation: 'No .env.example template file found documenting required environment configuration keys.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Create a safe .env.example template with dummy values for all required deployment settings.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'PY-ENV-001',
          category: 'env',
          status: 'MANUAL_REVIEW',
          severity: 'low',
          title: 'Environment Configuration Loading Requires Verification',
          explanation: '.env.example template found, but explicit environment variable loading could not be statically verified.',
          evidence: { file: '.env.example' },
          checkMethod: 'manual_verification_required',
          recommendation: 'Use pydantic-settings or python-decouple for type-safe environment variable parsing.',
          manualVerificationRequired: true,
          confidence: 'medium_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Framework-Specific Checks: Django / Flask / FastAPI
    // =========================================================================
    const isDjango =
      fs.existsSync(path.join(targetDir, 'manage.py')) || this.hasDependency(targetDir, 'django');
    const isFlask = this.hasDependency(targetDir, 'flask');

    // --- PY-SEC-001: SECRET_KEY & DEBUG Mode ---
    let debugTrueFinding = null;
    let hardcodedSecretFinding = null;
    let hasLoadedSecretKey = false;

    for (const relFile of pyFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          // Check DEBUG = True without env fallback
          if (
            /^\s*DEBUG\s*=\s*True\s*(?:#.*)?$/.test(line) &&
            !content.includes('os.getenv') &&
            !content.includes('environ') &&
            !content.includes('decouple')
          ) {
            debugTrueFinding = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
          }

          // Check hardcoded SECRET_KEY literal
          const secretMatch = line.match(/^\s*SECRET_KEY\s*=\s*['"]([^'"]{1,64})['"]/);
          if (secretMatch) {
            hardcodedSecretFinding = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
          }

          if (
            /SECRET_KEY\s*=\s*(?:os\.getenv|env|config|os\.environ)/.test(line) ||
            /SECRET_KEY\s*:\s*str/.test(line)
          ) {
            hasLoadedSecretKey = true;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (debugTrueFinding) {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Django DEBUG Mode Hardcoded to True',
          explanation: `DEBUG is hardcoded to True in "${debugTrueFinding.file}". Production deployments with DEBUG=True expose sensitive environment variables and interactive traceback consoles.`,
          evidence: {
            file: debugTrueFinding.file,
            line: debugTrueFinding.line,
            snippet: sanitizeOutput(debugTrueFinding.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Configure DEBUG to load from environment: DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1").',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hardcodedSecretFinding) {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Hardcoded Secret Key Detected in Python Application',
          explanation: `Detected hardcoded SECRET_KEY literal in "${hardcodedSecretFinding.file}". Attackers can use leaked secret keys to forge sessions, cryptographic signatures, and CSRF tokens.`,
          evidence: {
            file: hardcodedSecretFinding.file,
            line: hardcodedSecretFinding.line,
            snippet: sanitizeOutput(hardcodedSecretFinding.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Load SECRET_KEY exclusively from validated environment variables (e.g. os.environ["SECRET_KEY"]).',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasLoadedSecretKey) {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-001',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Application Secrets Loaded from Environment Configuration',
          explanation: 'SECRET_KEY is loaded from environment variables without hardcoded fallback literals.',
          evidence: { file: 'settings.py' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure SECRET_KEY possesses at least 50 unique characters of entropy.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (isDjango || isFlask) {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-001',
          category: 'security',
          status: 'MANUAL_REVIEW',
          severity: 'medium',
          title: 'Secret Key Configuration Requires Human Review',
          explanation: 'Application is Django/Flask but explicit SECRET_KEY loading could not be statically resolved.',
          evidence: { file: 'settings.py' },
          checkMethod: 'manual_verification_required',
          recommendation: 'Confirm SECRET_KEY is securely supplied at runtime by container secrets or environment variables.',
          manualVerificationRequired: true,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    }

    // --- PY-SEC-002: ALLOWED_HOSTS ---
    if (isDjango) {
      let wildcardAllowedHosts = null;
      let configuredAllowedHosts = false;

      for (const relFile of pyFiles) {
        try {
          const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
          if (/ALLOWED_HOSTS\s*=\s*\[\s*['"]\*['"]\s*\]/.test(content)) {
            wildcardAllowedHosts = { file: relFile };
            break;
          }
          if (
            /ALLOWED_HOSTS\s*=\s*(?:os\.getenv|env|\[\s*['"][^'*]+['"])/.test(content) ||
            /ALLOWED_HOSTS\s*=\s*\[[^\]]+\]/.test(content)
          ) {
            configuredAllowedHosts = true;
          }
        } catch { /* ignore non-critical read/parse error */ }
      }

      if (wildcardAllowedHosts) {
        findings.push(
          this.createFinding({
            id: 'PY-SEC-002',
            category: 'security',
            status: 'FAIL',
            severity: 'high',
            title: 'Insecure Host Header Wildcard (ALLOWED_HOSTS = ["*"])',
            explanation: `Django configuration in "${wildcardAllowedHosts.file}" permits wildcard host headers. This exposes the application to HTTP Host header poisoning and password reset token theft.`,
            evidence: { file: wildcardAllowedHosts.file },
            checkMethod: 'static_analysis',
            recommendation: 'Explicitly specify production domain names in ALLOWED_HOSTS (e.g. ALLOWED_HOSTS = [".example.com"]).',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else if (configuredAllowedHosts) {
        findings.push(
          this.createFinding({
            id: 'PY-SEC-002',
            category: 'security',
            status: 'PASS',
            severity: 'info',
            title: 'Django Host Header Validation Guardrails Enforced',
            explanation: 'ALLOWED_HOSTS declares explicit domain boundaries or dynamic environment configuration.',
            evidence: { file: 'settings.py' },
            checkMethod: 'static_analysis',
            recommendation: 'Maintain strict host header boundaries in production to mitigate header poisoning.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'PY-SEC-002',
            category: 'security',
            status: 'WARNING',
            severity: 'high',
            title: 'Unconfigured Django ALLOWED_HOSTS Setting',
            explanation: 'ALLOWED_HOSTS is empty or not configured. Production requests will be rejected with SuspiciousOperation.',
            evidence: { file: 'settings.py' },
            checkMethod: 'static_analysis',
            recommendation: 'Declare allowed domains: ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "").split(",").',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    }

    // --- PY-SEC-003: Session and Cookie Security Flags ---
    if (isDjango) {
      let insecureCookieSetting = null;
      let secureCookiesConfigured = false;

      for (const relFile of pyFiles) {
        try {
          const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
          if (
            /SESSION_COOKIE_SECURE\s*=\s*False/i.test(content) ||
            /CSRF_COOKIE_SECURE\s*=\s*False/i.test(content) ||
            /SESSION_COOKIE_HTTPONLY\s*=\s*False/i.test(content)
          ) {
            insecureCookieSetting = { file: relFile };
            break;
          }
          if (
            content.includes('SESSION_COOKIE_SECURE = True') &&
            content.includes('CSRF_COOKIE_SECURE = True')
          ) {
            secureCookiesConfigured = true;
          }
        } catch { /* ignore non-critical read/parse error */ }
      }

      if (insecureCookieSetting) {
        findings.push(
          this.createFinding({
            id: 'PY-SEC-003',
            category: 'security',
            status: 'FAIL',
            severity: 'high',
            title: 'Insecure Django Cookie Security Flags Detected',
            explanation: `Django configuration in "${insecureCookieSetting.file}" explicitly disables SESSION_COOKIE_SECURE or CSRF_COOKIE_SECURE.`,
            evidence: { file: insecureCookieSetting.file },
            checkMethod: 'static_analysis',
            recommendation: 'Set SESSION_COOKIE_SECURE = True, CSRF_COOKIE_SECURE = True, and SESSION_COOKIE_HTTPONLY = True in production settings.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else if (secureCookiesConfigured) {
        findings.push(
          this.createFinding({
            id: 'PY-SEC-003',
            category: 'security',
            status: 'PASS',
            severity: 'info',
            title: 'Secure Session & CSRF Cookie Flags Configured',
            explanation: 'Django settings enforce SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE.',
            evidence: { file: 'settings.py' },
            checkMethod: 'static_analysis',
            recommendation: 'Verify session cookies are transmitted exclusively over encrypted HTTPS.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'PY-SEC-003',
            category: 'security',
            status: 'WARNING',
            severity: 'medium',
            title: 'Django Secure Cookie Settings Not Explicitly Declared',
            explanation: 'SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE default to False in Django. Without explicit True, cookies transmit over cleartext HTTP.',
            evidence: { file: 'settings.py' },
            checkMethod: 'static_analysis',
            recommendation: 'Declare SESSION_COOKIE_SECURE = True and CSRF_COOKIE_SECURE = True for production releases.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    }

    // =========================================================================
    // PY-SEC-004: SQL Injection Defenses & Parameterized Queries
    // =========================================================================
    let rawSqlInjectionFinding = null;
    let hasSafeQueries = false;

    for (const relFile of pyFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          // Check cursor.execute with f-string or % string formatting
          if (
            /cursor\.execute\s*\(\s*f["'].*?\{/.test(line) ||
            /cursor\.execute\s*\(\s*["'].*?%s.*?["']\s*%/i.test(line) ||
            /cursor\.execute\s*\(\s*["'].*?["']\s*\+/i.test(line) ||
            /\.raw\s*\(\s*f["'].*?\{/.test(line) ||
            /\.raw\s*\(\s*["'].*?["']\s*\+/i.test(line)
          ) {
            rawSqlInjectionFinding = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }

          // Check safe parameterized queries
          if (
            /cursor\.execute\s*\(\s*['"][^'"]*['"]\s*,\s*\[/.test(line) ||
            /cursor\.execute\s*\(\s*['"][^'"]*['"]\s*,\s*\{/.test(line) ||
            /\.objects\.(?:filter|get|create|update)\s*\(/.test(line) ||
            /session\.query\s*\(/.test(line) ||
            /select\s*\([^)]*\)\.where\s*\(/.test(line)
          ) {
            hasSafeQueries = true;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
      if (rawSqlInjectionFinding) break;
    }

    if (rawSqlInjectionFinding) {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-004',
          category: 'database',
          status: 'FAIL',
          severity: 'critical',
          title: 'Potential SQL Injection via Python String Interpolation',
          explanation: `Detected raw database query constructed using Python string formatting/concatenation in "${rawSqlInjectionFinding.file}". This allows client input to alter SQL query structure.`,
          evidence: {
            file: rawSqlInjectionFinding.file,
            line: rawSqlInjectionFinding.line,
            snippet: sanitizeOutput(rawSqlInjectionFinding.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Pass query parameters as a tuple/list to cursor.execute (cursor.execute("SELECT ... %s", [param])) or use ORM querysets.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasSafeQueries) {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-004',
          category: 'database',
          status: 'PASS',
          severity: 'info',
          title: 'Parameterized Database Queries Enforced in Python',
          explanation: 'Data access operations utilize type-safe ORM querysets or parameterized query placeholders.',
          evidence: { file: pyFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain automated linting (flake8-bugbear / bandit) to prevent raw SQL string formatting.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-004',
          category: 'database',
          status: 'NOT_APPLICABLE',
          severity: 'info',
          title: 'SQL Database Checks Not Applicable (No Database Calls Detected)',
          explanation: 'No raw database cursor calls or ORM query operations detected in analyzed Python files.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'If database access is added, enforce parameterized query placeholders.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // PY-SEC-005: CSRF Protection
    // =========================================================================
    if (isDjango) {
      let hasCsrfMiddleware = false;
      for (const relFile of pyFiles) {
        try {
          const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
          if (content.includes('django.middleware.csrf.CsrfViewMiddleware')) {
            hasCsrfMiddleware = true;
            break;
          }
        } catch { /* ignore non-critical read/parse error */ }
      }

      if (hasCsrfMiddleware) {
        findings.push(
          this.createFinding({
            id: 'PY-SEC-005',
            category: 'security',
            status: 'PASS',
            severity: 'info',
            title: 'Django CSRF Middleware Configured',
            explanation: 'django.middleware.csrf.CsrfViewMiddleware is declared in MIDDLEWARE list.',
            evidence: { file: 'settings.py' },
            checkMethod: 'static_analysis',
            recommendation: 'Ensure POST and state-mutating views maintain CSRF token validation.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'PY-SEC-005',
            category: 'security',
            status: 'FAIL',
            severity: 'high',
            title: 'Missing Django CSRF Protection Middleware',
            explanation: 'django.middleware.csrf.CsrfViewMiddleware is absent from MIDDLEWARE. State-mutating requests are vulnerable to CSRF exploitation.',
            evidence: { file: 'settings.py' },
            checkMethod: 'static_analysis',
            recommendation: 'Add "django.middleware.csrf.CsrfViewMiddleware" to MIDDLEWARE in settings.py.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    }

    // =========================================================================
    // PY-SEC-006: CORS Configuration
    // =========================================================================
    let insecureCors = null;
    let configuredCors = false;

    for (const relFile of pyFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        // FastAPI / Starlette CORSMiddleware with allow_origins=["*"] and allow_credentials=True
        if (
          content.includes('CORSMiddleware') &&
          /allow_origins\s*=\s*\[\s*['"]\*['"]\s*\]/.test(content) &&
          /allow_credentials\s*=\s*True/.test(content)
        ) {
          insecureCors = {
            file: relFile,
            reason: 'FastAPI CORSMiddleware configured with wildcard allow_origins=["*"] combined with allow_credentials=True.',
          };
          break;
        }
        // Django corsheaders with CORS_ALLOW_ALL_ORIGINS = True and CORS_ALLOW_CREDENTIALS = True
        if (
          content.includes('CORS_ALLOW_ALL_ORIGINS = True') &&
          content.includes('CORS_ALLOW_CREDENTIALS = True')
        ) {
          insecureCors = {
            file: relFile,
            reason: 'Django CORS headers configured with CORS_ALLOW_ALL_ORIGINS = True and CORS_ALLOW_CREDENTIALS = True.',
          };
          break;
        }

        if (
          content.includes('CORSMiddleware') ||
          content.includes('corsheaders') ||
          content.includes('flask_cors')
        ) {
          configuredCors = true;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (insecureCors) {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-006',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Insecure CORS Policy: Wildcard Origins with Credentials',
          explanation: insecureCors.reason,
          evidence: { file: insecureCors.file },
          checkMethod: 'static_analysis',
          recommendation: 'Restrict allow_origins to explicit trusted client domains when credentials are enabled.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (configuredCors) {
      findings.push(
        this.createFinding({
          id: 'PY-SEC-006',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'CORS Middleware Guardrails Configured',
          explanation: 'Found CORS middleware configured with explicit origin boundaries.',
          evidence: { file: pyFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Regularly audit allowed CORS origins to ensure decommissioned domains are removed.',
          manualVerificationRequired: false,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // PY-DB-001: Database Migrations
    // =========================================================================
    const hasAlembic = fs.existsSync(path.join(targetDir, 'alembic.ini'));
    const hasDjangoMigrations = files.some(
      (f) => f.includes('migrations/') && f.endsWith('.py') && !f.endsWith('__init__.py')
    );

    if (hasDjangoMigrations) {
      findings.push(
        this.createFinding({
          id: 'PY-DB-001',
          category: 'database',
          status: 'PASS',
          severity: 'info',
          title: 'Django Database Migrations Configured',
          explanation: 'Found versioned Django schema migration files in migrations/.',
          evidence: { file: 'migrations/' },
          checkMethod: 'static_analysis',
          recommendation: 'Run python manage.py migrate --plan in CI to preview schema changes before deployment.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasAlembic) {
      findings.push(
        this.createFinding({
          id: 'PY-DB-001',
          category: 'database',
          status: 'PASS',
          severity: 'info',
          title: 'Alembic Database Migration Framework Configured',
          explanation: 'Found alembic.ini configuration for SQLAlchemy schema migration management.',
          evidence: { file: 'alembic.ini' },
          checkMethod: 'static_analysis',
          recommendation: 'Verify forward and reverse migrations using alembic upgrade head in staging.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // PY-TEST-001: Automated Test Suite Configured
    // =========================================================================
    const hasPytestIni =
      fs.existsSync(path.join(targetDir, 'pytest.ini')) ||
      fs.existsSync(path.join(targetDir, 'setup.cfg'));
    const hasTestFiles = files.some(
      (f) =>
        (f.includes('tests/') || f.includes('test_') || f.endsWith('_test.py')) &&
        f.endsWith('.py')
    );

    if (hasPytestIni || hasTestFiles) {
      findings.push(
        this.createFinding({
          id: 'PY-TEST-001',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Automated Python Test Suite Configured',
          explanation: 'Found automated Python test files (pytest / unittest) and configuration.',
          evidence: { file: hasPytestIni ? 'pytest.ini' : 'tests/' },
          checkMethod: 'static_analysis',
          recommendation: 'Enforce test coverage thresholds (e.g. pytest-cov >= 80%) in continuous integration.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'PY-TEST-001',
          category: 'build_test',
          status: 'WARNING',
          severity: 'high',
          title: 'No Automated Python Tests Detected',
          explanation: 'Could not find a tests/ directory, pytest.ini, or test_*.py files.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Create automated unit and integration tests using pytest or unittest.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // PY-DEPLOY-001: Production WSGI/ASGI Server
    // =========================================================================
    const hasProductionServer =
      this.hasDependency(targetDir, 'gunicorn') ||
      this.hasDependency(targetDir, 'uvicorn') ||
      this.hasDependency(targetDir, 'hypercorn') ||
      files.some((f) => {
        if (!f.endsWith('.py') && !f.endsWith('.sh') && !f.includes('Dockerfile') && !f.includes('Procfile')) return false;
        try {
          const content = fs.readFileSync(path.join(projectDir, f), 'utf8');
          return content.includes('gunicorn') || content.includes('uvicorn');
        } catch {
          return false;
        }
      });

    if (hasProductionServer) {
      findings.push(
        this.createFinding({
          id: 'PY-DEPLOY-001',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Production WSGI/ASGI Server Configured',
          explanation: 'Detected production-grade application server (Gunicorn / Uvicorn).',
          evidence: { file: hasRequirements ? 'requirements.txt' : 'Dockerfile' },
          checkMethod: 'static_analysis',
          recommendation: 'Configure appropriate worker process counts and connection limits based on target CPU cores.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    return findings;
  }

  runDynamicChecks(target, context, execRunner) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;

    // Check if test execution is requested
    if (!context.allowExec) {
      findings.push(
        this.createFinding({
          id: 'PY-EXEC-001',
          category: 'build_test',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Python Test Suite Execution Skipped (Read-Only Mode)',
          explanation: 'Test execution requires explicit execution authorization (--allow-exec).',
          evidence: { file: '.' },
          checkMethod: 'command_execution',
          recommendation: 'Run assessment with --allow-exec to execute automated test suites.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
      return findings;
    }

    // If authorized, run pytest or manage.py check
    const hasManagePy = fs.existsSync(path.join(targetDir, 'manage.py'));
    if (hasManagePy) {
      const result = execRunner({
        command: 'python',
        args: ['manage.py', 'check'],
        cwd: targetDir,
        context,
      });

      if (result.exitCode === 0) {
        findings.push(
          this.createFinding({
            id: 'PY-EXEC-002',
            category: 'build_test',
            status: 'PASS',
            severity: 'info',
            title: 'Django System Check Passed (manage.py check)',
            explanation: 'Django system check identified no issues or configuration errors.',
            evidence: {
              command: 'python manage.py check',
              exitCode: result.exitCode,
              durationMs: result.durationMs,
            },
            checkMethod: 'command_execution',
            recommendation: 'Incorporate python manage.py check into continuous integration pipelines.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'PY-EXEC-002',
            category: 'build_test',
            status: 'FAIL',
            severity: 'high',
            title: 'Django System Check Failed',
            explanation: `Django system check failed with exit code ${result.exitCode}. Output: ${sanitizeOutput(result.stderr || result.stdout)}`,
            evidence: {
              command: 'python manage.py check',
              exitCode: result.exitCode,
              durationMs: result.durationMs,
            },
            checkMethod: 'command_execution',
            recommendation: 'Resolve Django system check errors before proceeding with release.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    }

    return findings;
  }
}

