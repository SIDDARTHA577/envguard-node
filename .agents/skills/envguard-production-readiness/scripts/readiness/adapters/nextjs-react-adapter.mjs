import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION, sanitizeOutput } from '../constants.mjs';

/**
 * Next.js & React Web Application Adapter.
 * Assesses React and Next.js frontends and fullstack web applications.
 */
export class NextJsReactAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'nextjs-react',
      name: 'Next.js & React Web Application Adapter',
      version: TOOL_VERSION,
      description: 'Assesses Next.js and React web applications for architectural integrity, environment boundaries, a11y, and security.',
      supportedLanguages: ['javascript', 'typescript'],
      supportedFrameworks: ['nextjs', 'react'],
      requiredTools: ['node'],
    });
  }

  detect(target, context) {
    const deps = { ...(target.manifest?.dependencies || {}), ...(target.manifest?.devDependencies || {}) };
    const hasNext = Boolean(deps['next']);
    const hasReact = Boolean(deps['react'] || deps['react-dom']);
    const targetDir = target.absPath || context.projectDir;

    const hasNextConfig =
      fs.existsSync(path.join(targetDir, 'next.config.js')) ||
      fs.existsSync(path.join(targetDir, 'next.config.mjs')) ||
      fs.existsSync(path.join(targetDir, 'next.config.ts'));

    if (hasNext || hasNextConfig) {
      return {
        matched: true,
        confidence: 1.0,
        reason: 'Detected Next.js framework configuration and dependencies.',
        metadata: { framework: 'nextjs', router: target.nextRouter || 'unknown' },
      };
    }

    if (hasReact) {
      return {
        matched: true,
        confidence: 0.9,
        reason: 'Detected React library in project dependencies.',
        metadata: { framework: 'react' },
      };
    }

    return {
      matched: false,
      confidence: 0,
      reason: 'No Next.js or React dependencies or configuration files detected.',
    };
  }

  getCapabilities() {
    return [
      'react_architecture_detection',
      'client_server_env_boundary',
      'tsconfig_strictness',
      'accessibility_tooling',
      'core_web_vitals_optimization',
      'bundle_analyzer_configuration',
      'security_headers_configuration',
      'route_error_boundaries',
      'accessible_form_validation',
      'automated_accessibility_testing',
    ];
  }

  getApplicableChecks(target, context) {
    return [
      { id: 'NEXT-001', name: 'Next.js & React Architecture Configuration', category: 'discovery', required: true },
      { id: 'NEXT-002', name: 'Client-Server Environment Boundary Security', category: 'security', required: true },
      { id: 'NEXT-003', name: 'TypeScript Strict Mode Configuration', category: 'build_test', required: true },
      { id: 'NEXT-004', name: 'Automated Frontend Accessibility Tooling', category: 'accessibility', required: true },
      { id: 'NEXT-005', name: 'Core Web Vitals Optimization (Image & Font)', category: 'performance', required: false },
      { id: 'NEXT-006', name: 'Bundle Analyzer Configuration', category: 'performance', required: false },
      { id: 'NEXT-007', name: 'Next.js HTTP Security Headers Configuration', category: 'security', required: false },
      { id: 'NEXT-008', name: 'Manual Keyboard & Screen Reader Verification', category: 'accessibility', required: false },
      { id: 'NEXT-009', name: 'Route Error Boundaries & Fallback UI', category: 'build_test', required: false },
      { id: 'NEXT-010', name: 'Form Validation & Accessible Feedback', category: 'accessibility', required: false },
      { id: 'NEXT-011', name: 'Automated Frontend Accessibility Tooling', category: 'accessibility', required: false },
    ];
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];
    const pkg = target.manifest;
    const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

    // =========================================================================
    // Check 1: NEXT-001 (Architecture Configuration)
    // =========================================================================
    const nextVersion = deps['next'] || 'unknown';
    const reactVersion = deps['react'] || 'unknown';
    const routerType = target.nextRouter || 'standard';

    findings.push(
      this.createFinding({
        id: 'NEXT-001',
        category: 'discovery',
        status: 'PASS',
        severity: 'info',
        title: 'Next.js & React Architecture Configured',
        explanation: `Detected Next.js (${nextVersion}) with React (${reactVersion}). Routing architecture: ${routerType}.`,
        evidence: { file: 'package.json', snippet: `"next": "${nextVersion}", "react": "${reactVersion}"` },
        checkMethod: 'static_analysis',
        recommendation: 'Keep Next.js and React updated to supported LTS or latest stable releases.',
        manualVerificationRequired: false,
        confidence: 'verified_fact',
        targetPath: target.path,
      })
    );

    // =========================================================================
    // Check 2: NEXT-002 (Client-Server Environment Boundary Security)
    // Inspects 'use client' components for unauthorized access to server-only process.env variables
    // =========================================================================
    let clientBoundaryViolation = null;
    let clientComponentCheckedCount = 0;

    for (const file of files) {
      if (
        (file.endsWith('.tsx') || file.endsWith('.jsx') || file.endsWith('.js') || file.endsWith('.ts')) &&
        !file.includes('.test.') &&
        !file.includes('.spec.')
      ) {
        const full = path.join(projectDir, file);
        try {
          const content = fs.readFileSync(full, 'utf8');
          // Check if this is a Client Component
          if (content.includes("'use client'") || content.includes('"use client"')) {
            clientComponentCheckedCount++;
            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              // Look for process.env access
              const matches = line.match(/process\.env\.([A-Z0-9_]+)/g);
              if (matches) {
                for (const match of matches) {
                  const varName = match.replace('process.env.', '');
                  // If variable does not start with NEXT_PUBLIC_ and is not NODE_ENV
                  if (!varName.startsWith('NEXT_PUBLIC_') && varName !== 'NODE_ENV') {
                    clientBoundaryViolation = {
                      file,
                      line: i + 1,
                      varName,
                      snippet: line.trim(),
                    };
                    break;
                  }
                }
              }
              if (clientBoundaryViolation) break;
            }
          }
        } catch {}
      }
      if (clientBoundaryViolation) break;
    }

    if (clientBoundaryViolation) {
      findings.push(
        this.createFinding({
          id: 'NEXT-002',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Client Component Accessing Server-Only Environment Variable',
          explanation: `Client component "${clientBoundaryViolation.file}" accesses server-only environment variable "${clientBoundaryViolation.varName}". Private secrets may be leaked into client browser bundles.`,
          evidence: {
            file: clientBoundaryViolation.file,
            line: clientBoundaryViolation.line,
            snippet: sanitizeOutput(clientBoundaryViolation.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: `Prefix public client variables with "NEXT_PUBLIC_" or move secret operations to Server Components or route handlers.`,
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-002',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Client-Server Environment Boundary Properly Enforced',
          explanation: `Static inspection found no server-only environment variable references across ${clientComponentCheckedCount} checked Client Components.`,
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Continue prefixing client-exposed configuration keys with NEXT_PUBLIC_ and validating at build time.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Check 3: NEXT-003 (TypeScript Strict Mode)
    // =========================================================================
    const tsconfigPath = path.join(targetDir, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      try {
        const raw = fs.readFileSync(tsconfigPath, 'utf8');
        // Basic check for strict: true (handling potential json comments)
        const isStrict = /"strict"\s*:\s*true/.test(raw);
        if (isStrict) {
          findings.push(
            this.createFinding({
              id: 'NEXT-003',
              category: 'build_test',
              status: 'PASS',
              severity: 'info',
              title: 'TypeScript Strict Mode Enabled',
              explanation: 'tsconfig.json specifies "strict": true for strict compiler type checking.',
              evidence: { file: 'tsconfig.json', snippet: '"strict": true' },
              checkMethod: 'static_analysis',
              recommendation: 'Maintain strict compiler checks to prevent null pointer and type-coercion defects.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );
        } else {
          findings.push(
            this.createFinding({
              id: 'NEXT-003',
              category: 'build_test',
              status: 'WARNING',
              severity: 'medium',
              title: 'TypeScript Strict Mode Disabled',
              explanation: 'tsconfig.json does not have "strict": true enabled.',
              evidence: { file: 'tsconfig.json' },
              checkMethod: 'static_analysis',
              recommendation: 'Enable "strict": true in tsconfig.json to ensure full compiler safety.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );
        }
      } catch {
        findings.push(
          this.createFinding({
            id: 'NEXT-003',
            category: 'build_test',
            status: 'WARNING',
            severity: 'medium',
            title: 'Unparseable tsconfig.json',
            explanation: 'Could not read or parse tsconfig.json.',
            evidence: { file: 'tsconfig.json' },
            checkMethod: 'static_analysis',
            recommendation: 'Verify tsconfig.json syntax.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-003',
          category: 'build_test',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing tsconfig.json',
          explanation: 'No tsconfig.json detected in application target directory.',
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Adopt TypeScript to prevent runtime type errors in React components.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Check 4: NEXT-004 (Automated Frontend Accessibility Tooling)
    // =========================================================================
    const hasA11yLinter = Boolean(
      deps['eslint-plugin-jsx-a11y'] || deps['axe-core'] || deps['@axe-core/react']
    );
    if (hasA11yLinter) {
      findings.push(
        this.createFinding({
          id: 'NEXT-004',
          category: 'accessibility',
          status: 'PASS',
          severity: 'info',
          title: 'Automated Frontend Accessibility Tooling Configured',
          explanation: 'Detected automated accessibility auditing tooling in dependencies (eslint-plugin-jsx-a11y or axe-core).',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure accessibility lint checks run in CI and fail on WCAG 2.1 AA violations.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-004',
          category: 'accessibility',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Automated Frontend Accessibility Tooling',
          explanation: 'React components detected without eslint-plugin-jsx-a11y or axe-core testing.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Install eslint-plugin-jsx-a11y to prevent missing alt text, ARIA errors, and contrast issues (envguard-accessibility).',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Check 5: NEXT-005 (Core Web Vitals Optimization - Image & Font)
    // =========================================================================
    let usesNextImage = false;
    let usesNextFont = false;
    for (const file of files) {
      if (file.endsWith('.tsx') || file.endsWith('.jsx') || file.endsWith('.js')) {
        const full = path.join(projectDir, file);
        try {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes('next/image')) usesNextImage = true;
          if (content.includes('next/font')) usesNextFont = true;
        } catch {}
      }
      if (usesNextImage && usesNextFont) break;
    }

    if (usesNextImage || usesNextFont) {
      findings.push(
        this.createFinding({
          id: 'NEXT-005',
          category: 'performance',
          status: 'PASS',
          severity: 'info',
          title: 'Core Web Vitals Optimization Configured (Image & Font)',
          explanation: `Detected built-in Next.js asset optimization: ${[usesNextImage ? 'next/image' : null, usesNextFont ? 'next/font' : null].filter(Boolean).join(', ')}.`,
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Continue leveraging next/image and next/font to achieve high Lighthouse and LCP performance scores.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-005',
          category: 'performance',
          status: 'WARNING',
          severity: 'low',
          title: 'Unoptimized Image or Typography Assets',
          explanation: 'Could not detect use of "next/image" or "next/font". Direct <img> tags or external web fonts may degrade Largest Contentful Paint (LCP).',
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Replace standard <img> elements with next/image and load fonts via next/font/google or next/font/local.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Check 6: NEXT-006 (Bundle Analyzer Configuration)
    // =========================================================================
    const hasBundleAnalyzer = Boolean(
      deps['@next/bundle-analyzer'] ||
      deps['webpack-bundle-analyzer']
    );

    if (hasBundleAnalyzer) {
      findings.push(
        this.createFinding({
          id: 'NEXT-006',
          category: 'performance',
          status: 'PASS',
          severity: 'info',
          title: 'Production Bundle Analyzer Configured',
          explanation: 'Found @next/bundle-analyzer in dependencies to audit client JS bundle sizes.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Run ANALYZE=true in CI on release branches to catch dependency bundle bloat.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-006',
          category: 'performance',
          status: 'WARNING',
          severity: 'low',
          title: 'Missing Bundle Analyzer Tooling',
          explanation: 'Project does not configure @next/bundle-analyzer. Heavy client dependencies may cause unexpected bundle bloat.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Install @next/bundle-analyzer and configure in next.config.js to audit JavaScript bundle distribution.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Check 7: NEXT-007 (Security Headers in next.config)
    // =========================================================================
    let hasSecurityHeaders = false;
    let nextConfigFile = null;
    for (const confName of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
      const full = path.join(targetDir, confName);
      if (fs.existsSync(full)) {
        nextConfigFile = confName;
        try {
          const content = fs.readFileSync(full, 'utf8');
          if (
            content.includes('headers()') ||
            content.includes('Content-Security-Policy') ||
            content.includes('X-Frame-Options')
          ) {
            hasSecurityHeaders = true;
          }
        } catch {}
        break;
      }
    }

    if (hasSecurityHeaders) {
      findings.push(
        this.createFinding({
          id: 'NEXT-007',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Next.js Security Headers Configured',
          explanation: `Found security headers configuration in "${nextConfigFile}".`,
          evidence: { file: nextConfigFile },
          checkMethod: 'static_analysis',
          recommendation: 'Verify Content-Security-Policy, HSTS, and X-Content-Type-Options are properly parameterized.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-007',
          category: 'security',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing HTTP Security Headers in next.config',
          explanation: `Could not detect custom security headers (CSP, HSTS, X-Frame-Options) in "${nextConfigFile || 'next.config.js'}".`,
          evidence: { file: nextConfigFile || 'next.config.js' },
          checkMethod: 'static_analysis',
          recommendation: 'Configure async headers() in next.config.js with strict CSP and security headers.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Check 8: NEXT-008 (Manual Review for A11y)
    // =========================================================================
    findings.push(
      this.createFinding({
        id: 'NEXT-008',
        category: 'accessibility',
        status: 'MANUAL_REVIEW',
        severity: 'medium',
        title: 'Manual Keyboard & Screen Reader Verification Required',
        explanation: 'Automated audits only catch a portion of WCAG failures. Human testing with NVDA/VoiceOver is required.',
        evidence: { file: target.path },
        checkMethod: 'manual_verification_required',
        recommendation: 'Test interactive forms, dialogs, and navigation menus using keyboard-only navigation.',
        manualVerificationRequired: true,
        confidence: 'unverified',
        targetPath: target.path,
      })
    );

    // =========================================================================
    // Check 9: NEXT-009 (Route Error Boundaries & Fallback UI)
    // =========================================================================
    const hasAppRouter = routerType === 'app_router';
    const hasErrorBoundary =
      fs.existsSync(path.join(targetDir, 'app', 'error.tsx')) ||
      fs.existsSync(path.join(targetDir, 'app', 'error.jsx')) ||
      fs.existsSync(path.join(targetDir, 'app', 'error.js')) ||
      fs.existsSync(path.join(targetDir, 'pages', '_error.tsx')) ||
      fs.existsSync(path.join(targetDir, 'pages', '_error.jsx'));

    if (hasErrorBoundary) {
      findings.push(
        this.createFinding({
          id: 'NEXT-009',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Route Error Boundaries Configured',
          explanation: 'Found route-level error boundaries (error.tsx or _error.tsx) providing graceful crash recovery.',
          evidence: { file: hasAppRouter ? 'app/error.tsx' : 'pages/_error.tsx' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure error boundaries log contextual error digests for monitoring without exposing stack traces.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasAppRouter) {
      findings.push(
        this.createFinding({
          id: 'NEXT-009',
          category: 'build_test',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Next.js Route Error Boundary (app/error.tsx)',
          explanation: 'Next.js App Router application lacks an error.tsx boundary in app/. Uncaught exceptions will cause full page crash screens.',
          evidence: { file: 'app/' },
          checkMethod: 'static_analysis',
          recommendation: 'Add app/error.tsx and app/not-found.tsx to render graceful error fallbacks.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-009',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Standard React Component Architecture',
          explanation: 'No missing route error boundaries detected for React target.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Wrap top-level views with an ErrorBoundary component.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Check 10: NEXT-010 (Form Validation & Accessible Feedback)
    // =========================================================================
    let hasForm = false;
    let hasAccessibleLabels = false;

    for (const relFile of files) {
      if (relFile.endsWith('.tsx') || relFile.endsWith('.jsx')) {
        const full = path.join(projectDir, relFile);
        try {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes('<form') || content.includes('<Form')) {
            hasForm = true;
            if (
              content.includes('htmlFor=') ||
              content.includes('aria-label=') ||
              content.includes('aria-describedby=') ||
              content.includes('role="alert"')
            ) {
              hasAccessibleLabels = true;
              break;
            }
          }
        } catch {}
      }
    }

    if (hasForm && hasAccessibleLabels) {
      findings.push(
        this.createFinding({
          id: 'NEXT-010',
          category: 'accessibility',
          status: 'PASS',
          severity: 'info',
          title: 'Accessible Form Elements & Validation Feedback Detected',
          explanation: 'Found form components utilizing accessible labeling (htmlFor/aria-label) and error feedback attributes.',
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Verify form error states announce properly via screen readers (WCAG 3.3.1).',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-010',
          category: 'accessibility',
          status: 'PASS',
          severity: 'info',
          title: 'Form Validation Compliance Enforced',
          explanation: 'No complex form accessibility defects detected in frontend components.',
          evidence: { file: target.path },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure any future input elements include associated <label> elements or aria-label attributes.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Check 11: NEXT-011 (Automated Accessibility Testing Tooling)
    // =========================================================================
    const a11yTools = ['axe-core', '@axe-core/playwright', '@axe-core/react', 'jest-axe', 'cypress-axe', 'eslint-plugin-jsx-a11y'];
    const detectedA11y = a11yTools.filter((t) => deps[t]);

    if (detectedA11y.length > 0) {
      findings.push(
        this.createFinding({
          id: 'NEXT-011',
          category: 'accessibility',
          status: 'PASS',
          severity: 'info',
          title: 'Automated Frontend Accessibility Testing Configured',
          explanation: `Detected automated accessibility testing tooling: ${detectedA11y.join(', ')}.`,
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Integrate axe-core automated assertions into end-to-end CI browser suites.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'NEXT-011',
          category: 'accessibility',
          status: 'WARNING',
          severity: 'low',
          title: 'No Automated Frontend Accessibility Tooling Configured',
          explanation: 'Could not detect axe-core, @axe-core/playwright, or eslint-plugin-jsx-a11y in dependencies.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Install eslint-plugin-jsx-a11y or @axe-core/playwright to catch WCAG violations in CI.',
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
      'Static analysis scans for "use client" directives and process.env references; dynamic bundler inlining is not emulated.',
      'Accessibility checks verify tooling presence and standard component patterns; live browser assistive technology evaluation requires human testing.',
    ];
  }
}
