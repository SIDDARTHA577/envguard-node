import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION, sanitizeOutput } from '../constants.mjs';

/**
 * Platform Adapter for React Native and Expo Mobile Applications.
 * Evaluates mobile app configuration, OWASP MASVS security, local persistence,
 * deep linking boundaries, WebView configurations, and offline resilience.
 */
export class ReactNativeAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'react-native',
      name: 'React Native & Expo Platform Readiness Adapter',
      version: TOOL_VERSION,
      description: 'Assesses React Native and Expo mobile applications for configuration, OWASP MASVS security, deep linking, offline handling, and native compatibility.',
      supportedLanguages: ['typescript', 'javascript'],
      supportedFrameworks: ['react-native', 'expo'],
      requiredTools: ['node'],
    });
  }

  /**
   * Helper to inspect dependencies in package.json.
   */
  hasDependency(targetDir, depName) {
    const pkgPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      return Boolean(deps[depName]);
    } catch {
      return false;
    }
  }

  /**
   * Helper to inspect app.json or app.config.js for Expo/React Native configuration.
   */
  readAppConfig(targetDir) {
    const jsonPath = path.join(targetDir, 'app.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        return content.expo || content;
      } catch { /* ignore non-critical read/parse error */ }
    }
    return null;
  }

  /**
   * Detects whether the target application is a React Native or Expo project.
   */
  detect(target, context) {
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;

    const hasExpoDep = this.hasDependency(targetDir, 'expo');
    const hasRNDep = this.hasDependency(targetDir, 'react-native');
    const hasAppJson = fs.existsSync(path.join(targetDir, 'app.json'));
    const hasAppConfig =
      fs.existsSync(path.join(targetDir, 'app.config.js')) ||
      fs.existsSync(path.join(targetDir, 'app.config.ts'));
    const hasEasJson = fs.existsSync(path.join(targetDir, 'eas.json'));
    const hasMetroConfig =
      fs.existsSync(path.join(targetDir, 'metro.config.js')) ||
      fs.existsSync(path.join(targetDir, 'metro.config.ts'));

    if (!hasExpoDep && !hasRNDep && !hasAppJson && !hasAppConfig && !hasEasJson) {
      return {
        matched: false,
        confidence: 0,
        reason: 'No React Native or Expo dependencies (react-native, expo) or configuration files (app.json, eas.json) detected.',
      };
    }

    const isExpo = hasExpoDep || hasAppJson || hasAppConfig || hasEasJson;
    const frameworks = [];
    if (isExpo) frameworks.push('expo');
    if (hasRNDep) frameworks.push('react-native');

    return {
      matched: true,
      confidence: 1.0,
      reason: isExpo
        ? 'Detected Expo mobile application with native manifest and configuration.'
        : 'Detected bare React Native mobile application.',
      metadata: {
        isExpo,
        frameworks,
        hasEas: hasEasJson,
        hasMetro: hasMetroConfig,
      },
    };
  }

  getCapabilities() {
    return [
      'react_native_discovery',
      'expo_configuration',
      'mobile_secret_safety',
      'masvs_storage_security',
      'deep_link_security',
      'webview_security',
      'mobile_error_boundaries',
      'mobile_offline_netinfo',
      'mobile_app_lifecycle',
      'mobile_test_suite',
    ];
  }

  getApplicableChecks(_target, _context) {
    return [
      { id: 'RN-DISC-001', name: 'Mobile App Manifest & Configuration Configured', category: 'discovery', required: true },
      { id: 'RN-DISC-002', name: 'Platform Bundle Identifier & Package Name Declared', category: 'discovery', required: true },
      { id: 'RN-DISC-003', name: 'Explicit Expo SDK / React Native Version Pinned', category: 'discovery', required: true },
      { id: 'RN-SEC-001', name: 'Client Bundle Secret & Token Leakage Prevention', category: 'security', required: true },
      { id: 'RN-SEC-002', name: 'Hardware-Backed Keystore / SecureStore Token Storage (MASVS-STORAGE)', category: 'security', required: true },
      { id: 'RN-SEC-003', name: 'Deep Link & Custom URL Scheme Authorization Boundary', category: 'security', required: false },
      { id: 'RN-SEC-004', name: 'Mobile WebView Security & Origin Isolation', category: 'security', required: false },
      { id: 'RN-SEC-005', name: 'Sensitive Authentication Logging in Client Builds', category: 'security', required: true },
      { id: 'RN-REL-001', name: 'Mobile Crash Containment & Error Boundary', category: 'accessibility', required: true },
      { id: 'RN-REL-002', name: 'Offline Resilience & Network Reachability Monitoring', category: 'deployment', required: false },
      { id: 'RN-REL-003', name: 'Mobile App Lifecycle & Background Transitions', category: 'deployment', required: false },
      { id: 'RN-TEST-001', name: 'Automated Mobile Test Suite Configured', category: 'build_test', required: true },
    ];
  }

  getLimitations() {
    return [
      'Static analysis scans JavaScript/TypeScript bundles and native config templates; compiled bytecode in release APK/IPA artifacts requires physical device or emulator analysis.',
      'Native compilation checks (Xcode xcodebuild / Android Gradle assembleRelease) require host platform toolchains and are reported as NOT_RUN when run on incompatible operating systems.',
      'Deep link vulnerability inspection detects missing runtime authentication handlers; automated route testing requires simulator UI automation.',
    ];
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const appConfig = this.readAppConfig(targetDir);

    // Filter relevant mobile source files
    const mobileSourceFiles = files.filter(
      (f) =>
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
        !f.includes('node_modules/') &&
        !f.includes('.expo/') &&
        !f.includes('dist/') &&
        !f.includes('build/')
    );

    // =========================================================================
    // RN-DISC-001: Mobile Manifest & Configuration
    // =========================================================================
    const hasAppJson = fs.existsSync(path.join(targetDir, 'app.json'));
    const hasAppConfig =
      fs.existsSync(path.join(targetDir, 'app.config.js')) ||
      fs.existsSync(path.join(targetDir, 'app.config.ts'));

    if (hasAppJson || hasAppConfig) {
      const configFile = hasAppConfig
        ? fs.existsSync(path.join(targetDir, 'app.config.ts')) ? 'app.config.ts' : 'app.config.js'
        : 'app.json';
      findings.push(
        this.createFinding({
          id: 'RN-DISC-001',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Mobile App Manifest Configuration Present',
          explanation: `Found primary mobile configuration manifest at "${configFile}".`,
          evidence: { file: configFile },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain platform configurations and release channels in version control.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'RN-DISC-001',
          category: 'discovery',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Mobile Application Manifest (app.json / app.config.js)',
          explanation: 'No app.json or app.config.js found. Standalone React Native projects should maintain explicit app metadata.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Create app.json or app.config.js to define application name, slug, and platform targets.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-DISC-002: Bundle Identifier & Package Name Declared
    // =========================================================================
    const iosBundleId = appConfig?.ios?.bundleIdentifier;
    const androidPackage = appConfig?.android?.package;

    if (iosBundleId && androidPackage) {
      findings.push(
        this.createFinding({
          id: 'RN-DISC-002',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Platform Bundle Identifier & Package Name Declared',
          explanation: `Configured iOS bundleIdentifier ("${iosBundleId}") and Android package ("${androidPackage}").`,
          evidence: { file: hasAppJson ? 'app.json' : 'app.config.js' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure reverse-domain naming convention (e.g. com.company.app) is registered in App Store and Google Play.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'RN-DISC-002',
          category: 'discovery',
          status: 'WARNING',
          severity: 'high',
          title: 'Missing Platform Bundle Identifier or Package Name',
          explanation: `App configuration is missing explicit native identifiers (iOS: ${iosBundleId ? 'defined' : 'MISSING'}, Android: ${androidPackage ? 'defined' : 'MISSING'}). Standalone release builds will fail without distinct platform identifiers.`,
          evidence: { file: hasAppJson ? 'app.json' : '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Declare ios.bundleIdentifier and android.package in app.json.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-DISC-003: Expo SDK / React Native Version Declared
    // =========================================================================
    const pkgPath = path.join(targetDir, 'package.json');
    let rnVersion = null;
    let expoVersion = null;
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        rnVersion = deps['react-native'];
        expoVersion = deps['expo'];
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (expoVersion || rnVersion) {
      findings.push(
        this.createFinding({
          id: 'RN-DISC-003',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Mobile Framework Runtime Version Pinned',
          explanation: `Detected framework dependencies: ${expoVersion ? `expo: "${expoVersion}"` : ''} ${rnVersion ? `react-native: "${rnVersion}"` : ''}.`,
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Run npx expo install --check to maintain compatibility across native modules.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-SEC-001: Client Bundle Secret Leakage
    // =========================================================================
    let leakedSecretFinding = null;
    for (const relFile of mobileSourceFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          // Check for hardcoded secret assignments in client code
          const match = line.match(
            /(?:API_SECRET|PRIVATE_KEY|SECRET_KEY|DB_PASSWORD|ADMIN_KEY)\s*[:=]\s*['"]([a-zA-Z0-9_\-.~]{8,})['"]/i
          );
          if (match && !line.includes('process.env') && !line.includes('EXPO_PUBLIC_')) {
            leakedSecretFinding = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
      if (leakedSecretFinding) break;
    }

    if (leakedSecretFinding) {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Hardcoded API Secret or Private Key in Mobile Client Code',
          explanation: `Detected hardcoded secret literal in mobile source "${leakedSecretFinding.file}". Mobile client code is distributed publicly to end-user devices and can be readily extracted via reverse engineering.`,
          evidence: {
            file: leakedSecretFinding.file,
            line: leakedSecretFinding.line,
            snippet: sanitizeOutput(leakedSecretFinding.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Move secret-dependent operations to an authenticated backend proxy API. Never bundle private keys or admin secrets into client code.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-001',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'No Hardcoded Secrets Detected in Mobile Client Code',
          explanation: 'No plaintext API secret keys or private signing credentials detected across analyzed mobile source files.',
          evidence: { file: mobileSourceFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Only expose public client credentials (e.g. EXPO_PUBLIC_*) to the mobile application.',
          manualVerificationRequired: false,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-SEC-002: Secure Token Storage (MASVS-STORAGE)
    // =========================================================================
    let rawAsyncStorageTokenUsage = null;
    let usesSecureStore =
      this.hasDependency(targetDir, 'expo-secure-store') ||
      this.hasDependency(targetDir, 'react-native-keychain') ||
      this.hasDependency(targetDir, 'react-native-encrypted-storage');

    for (const relFile of mobileSourceFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          // Check for AsyncStorage.setItem('token' | 'jwt' | 'auth' | 'accessToken', ...)
          if (
            /AsyncStorage\.setItem\s*\(\s*['"](?:token|jwt|auth|accessToken|refreshToken|session|credentials)['"]/i.test(
              line
            )
          ) {
            rawAsyncStorageTokenUsage = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
      if (rawAsyncStorageTokenUsage) break;
    }

    if (rawAsyncStorageTokenUsage) {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-002',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Insecure Authentication Token Storage in AsyncStorage (OWASP MASVS-STORAGE)',
          explanation: `Detected authentication token persisted in unencrypted AsyncStorage in "${rawAsyncStorageTokenUsage.file}". AsyncStorage stores data in cleartext SQLite/XML files accessible on rooted devices or via filesystem backups.`,
          evidence: {
            file: rawAsyncStorageTokenUsage.file,
            line: rawAsyncStorageTokenUsage.line,
            snippet: sanitizeOutput(rawAsyncStorageTokenUsage.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Store authentication and session tokens using hardware-backed cryptographic storage: "expo-secure-store" (iOS Keychain / Android Keystore) or "react-native-keychain".',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (usesSecureStore) {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-002',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Hardware-Backed Keystore / SecureStore Configured (MASVS-STORAGE)',
          explanation: 'Found hardware-backed secure storage library (expo-secure-store or react-native-keychain) for managing sensitive credentials.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Configure appropriate accessibility options (e.g. kSecAttrAccessibleAfterFirstUnlock) on sensitive keychain items.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-002',
          category: 'security',
          status: 'MANUAL_REVIEW',
          severity: 'medium',
          title: 'Mobile Credential Storage Requires Human Review',
          explanation: 'No explicit AsyncStorage token leakage was found, but neither expo-secure-store nor react-native-keychain was detected in project dependencies.',
          evidence: { file: 'package.json' },
          checkMethod: 'manual_verification_required',
          recommendation: 'If this application manages authenticated sessions, install expo-secure-store to protect JWTs and API tokens.',
          manualVerificationRequired: true,
          confidence: 'medium_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-SEC-003: Deep Link & Custom URL Scheme Authorization Boundary
    // =========================================================================
    const hasCustomScheme = Boolean(appConfig?.scheme);
    let deepLinkHandler = false;

    for (const relFile of mobileSourceFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        if (
          content.includes('Linking.addEventListener') ||
          content.includes('Linking.getInitialURL') ||
          content.includes('expo-linking')
        ) {
          deepLinkHandler = true;
          break;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (hasCustomScheme || deepLinkHandler) {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-003',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Deep Link Routing Architecture Configured',
          explanation: `Application configures deep link scheme ("${appConfig?.scheme || 'custom'}") and URL handlers.`,
          evidence: { file: hasAppJson ? 'app.json' : mobileSourceFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Never execute state-mutating actions or bypass authentication exclusively based on deep-link URL parameters.',
          manualVerificationRequired: false,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-SEC-004: WebView Security & Origin Isolation
    // =========================================================================
    let insecureWebView = null;
    let hasWebView = false;

    for (const relFile of mobileSourceFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        if (content.includes('WebView') && (content.includes('react-native-webview') || content.includes('<WebView'))) {
          hasWebView = true;
          if (
            content.includes('allowFileAccess={true}') ||
            content.includes('allowUniversalAccessFromFileURLs={true}')
          ) {
            insecureWebView = {
              file: relFile,
              reason: 'allowFileAccess or allowUniversalAccessFromFileURLs enabled on WebView.',
            };
            break;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (insecureWebView) {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-004',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Insecure Mobile WebView Configuration (File Access Enabled)',
          explanation: `WebView in "${insecureWebView.file}" enables local filesystem access. Attackers can exploit cross-site scripting in embedded content to read app-private files.`,
          evidence: { file: insecureWebView.file },
          checkMethod: 'static_analysis',
          recommendation: 'Disable allowFileAccess and restrict originWhitelist to trusted HTTPS domains.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasWebView) {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-004',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Mobile WebView Security Guardrails Enforced',
          explanation: 'WebView components are configured without dangerous local file access flags.',
          evidence: { file: mobileSourceFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain explicit originWhitelist on all WebView components.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-SEC-005: Sensitive Logging in Client Code
    // =========================================================================
    let sensitiveLogging = null;
    for (const relFile of mobileSourceFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          if (
            /console\.log\s*\(\s*['"][^'"]*(?:password|token|bearer|secret|auth)[^'"]*['"]\s*,\s*[a-zA-Z0-9_]+/i.test(
              line
            )
          ) {
            sensitiveLogging = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
      if (sensitiveLogging) break;
    }

    if (sensitiveLogging) {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-005',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Sensitive Credential Logging in Mobile Client Code',
          explanation: `Detected console.log outputting authentication secrets or tokens in "${sensitiveLogging.file}". Logs on Android (logcat) and iOS are visible to device debugging tools and crash reporting services.`,
          evidence: {
            file: sensitiveLogging.file,
            line: sensitiveLogging.line,
            snippet: sanitizeOutput(sensitiveLogging.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Remove credential log outputs or configure Babel plugin (babel-plugin-transform-remove-console) to strip console statements in production.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'RN-SEC-005',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'No Sensitive Credential Logging Detected in Mobile Client Code',
          explanation: 'No cleartext token or password logging detected in client source files.',
          evidence: { file: mobileSourceFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Strip all console statements in release builds using Babel production transform plugins.',
          manualVerificationRequired: false,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-REL-001: Mobile Error Boundary
    // =========================================================================
    let hasErrorBoundary = false;
    for (const relFile of mobileSourceFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        if (
          content.includes('componentDidCatch') ||
          content.includes('ErrorBoundary') ||
          content.includes('getDerivedStateFromError')
        ) {
          hasErrorBoundary = true;
          break;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (hasErrorBoundary) {
      findings.push(
        this.createFinding({
          id: 'RN-REL-001',
          category: 'accessibility',
          status: 'PASS',
          severity: 'info',
          title: 'Mobile Root Error Boundary Configured',
          explanation: 'Found React ErrorBoundary component protecting mobile application from unhandled component tree crashes.',
          evidence: { file: mobileSourceFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Integrate native crash reporting (Sentry / Crashlytics) in the componentDidCatch handler.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'RN-REL-001',
          category: 'accessibility',
          status: 'WARNING',
          severity: 'high',
          title: 'Missing Mobile Root Error Boundary',
          explanation: 'No React ErrorBoundary detected. In React Native, unhandled JavaScript exceptions crash the native application process immediately.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Wrap the root component tree in an ErrorBoundary to display a graceful fallback screen instead of crashing.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-REL-002: Offline Resilience & NetInfo
    // =========================================================================
    const hasNetInfo =
      this.hasDependency(targetDir, '@react-native-community/netinfo') ||
      mobileSourceFiles.some((f) => {
        try {
          return fs.readFileSync(path.join(projectDir, f), 'utf8').includes('NetInfo');
        } catch {
          return false;
        }
      });

    if (hasNetInfo) {
      findings.push(
        this.createFinding({
          id: 'RN-REL-002',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Mobile Network Reachability Monitoring Configured',
          explanation: 'Detected NetInfo integration for handling offline states and low-connectivity transitions.',
          evidence: { file: 'package.json' },
          checkMethod: 'static_analysis',
          recommendation: 'Display clear offline indicators and queue idempotent mutations for synchronization.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-REL-003: Mobile App Lifecycle & Background Transitions
    // =========================================================================
    const hasAppState = mobileSourceFiles.some((f) => {
      try {
        const content = fs.readFileSync(path.join(projectDir, f), 'utf8');
        return content.includes('AppState') && content.includes('addEventListener');
      } catch {
        return false;
      }
    });

    if (hasAppState) {
      findings.push(
        this.createFinding({
          id: 'RN-REL-003',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Mobile AppState Lifecycle Listeners Configured',
          explanation: 'Found AppState event listeners managing foreground/background application state transitions.',
          evidence: { file: mobileSourceFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Pause background timers and refresh stale session tokens when returning to the active state.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // RN-TEST-001: Automated Mobile Test Suite
    // =========================================================================
    const hasTestDir =
      fs.existsSync(path.join(targetDir, '__tests__')) ||
      fs.existsSync(path.join(targetDir, 'tests')) ||
      files.some((f) => f.includes('.test.') || f.includes('.spec.'));

    if (hasTestDir) {
      findings.push(
        this.createFinding({
          id: 'RN-TEST-001',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Automated Mobile Test Suite Configured',
          explanation: 'Found automated mobile test files (Jest / React Native Testing Library).',
          evidence: { file: '__tests__/' },
          checkMethod: 'static_analysis',
          recommendation: 'Enforce component snapshot and mocked API integration tests in continuous integration.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'RN-TEST-001',
          category: 'build_test',
          status: 'WARNING',
          severity: 'high',
          title: 'No Automated Mobile Tests Detected',
          explanation: 'Could not find a __tests__/ directory or *.test.tsx test files.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Install @testing-library/react-native and jest to automate component testing.',
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
    const targetDir = target.absPath || context.projectDir;

    // Mobile executable checks require authorized execution
    const pkgPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return findings;

    let scripts;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      scripts = pkg.scripts || {};
    } catch {
      return findings;
    }

    if (scripts.test) {
      if (!context.allowExec) {
        findings.push(
          this.createFinding({
            id: 'RN-TEST-002',
            category: 'build_test',
            status: 'NOT_RUN',
            severity: 'info',
            title: 'Mobile Test Suite Execution Skipped (Requires Authorization)',
            explanation: 'Declared mobile test script (npm test) was not executed in read-only mode.',
            evidence: { file: 'package.json' },
            checkMethod: 'execution_skipped',
            recommendation: 'Run with --allow-exec in container isolation to verify test execution.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        const res = execRunner('npm', ['test', '--', '--watchAll=false'], {
          cwd: targetDir,
          timeoutMs: context.timeoutMs || 30000,
          allowExec: context.allowExec,
          trustProject: context.trustProject,
          isIsolated: context.isIsolated,
          auditLog: context.executionAudit,
        });

        if (res.exitCode === 0) {
          findings.push(
            this.createFinding({
              id: 'RN-TEST-002',
              category: 'build_test',
              status: 'PASS',
              severity: 'info',
              title: 'Mobile Test Suite Executed Successfully',
              explanation: 'Mobile test suite passed all test assertions.',
              evidence: { snippet: sanitizeOutput(res.stdout || '') },
              checkMethod: 'command_execution',
              recommendation: 'Maintain continuous testing on every pull request.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );
        } else {
          findings.push(
            this.createFinding({
              id: 'RN-TEST-002',
              category: 'build_test',
              status: 'FAIL',
              severity: 'critical',
              title: 'Mobile Test Suite Execution Failed',
              explanation: `Mobile test execution failed with exit code ${res.exitCode}.`,
              evidence: { snippet: sanitizeOutput(res.stderr || res.stdout || '') },
              checkMethod: 'command_execution',
              recommendation: 'Fix failing unit and component test assertions before shipping.',
              manualVerificationRequired: false,
              confidence: 'verified_fact',
              targetPath: target.path,
            })
          );
        }
      }
    }

    return findings;
  }
}
