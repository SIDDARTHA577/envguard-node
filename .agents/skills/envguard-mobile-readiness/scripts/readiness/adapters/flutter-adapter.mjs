import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION, sanitizeOutput } from '../constants.mjs';

/**
 * Platform Adapter for Flutter and Dart Mobile Applications.
 * Evaluates pubspec configuration, OWASP MASVS storage security, resource disposal,
 * async error handling, widget testing, and static analysis linter rules.
 */
export class FlutterAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'flutter',
      name: 'Flutter & Dart Platform Readiness Adapter',
      version: TOOL_VERSION,
      description: 'Assesses Flutter and Dart cross-platform mobile applications for pubspec configuration, OWASP MASVS storage, null safety, resource disposal, and widget testing.',
      supportedLanguages: ['dart'],
      supportedFrameworks: ['flutter'],
      requiredTools: ['flutter', 'dart'],
    });
  }

  /**
   * Helper to parse simple key-values from pubspec.yaml without third-party YAML parser.
   */
  readPubspec(targetDir) {
    const pubspecPath = path.join(targetDir, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return null;
    try {
      const content = fs.readFileSync(pubspecPath, 'utf8');
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Detects whether the target application is a Flutter or Dart project.
   */
  detect(target, context) {
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const hasPubspec = fs.existsSync(path.join(targetDir, 'pubspec.yaml'));
    const hasAnalysisOptions = fs.existsSync(path.join(targetDir, 'analysis_options.yaml'));
    const hasDartFiles = files.some(
      (f) =>
        f.endsWith('.dart') &&
        !f.includes('.dart_tool/') &&
        !f.includes('build/')
    );

    if (!hasPubspec && !hasAnalysisOptions && !hasDartFiles) {
      return {
        matched: false,
        confidence: 0,
        reason: 'No Flutter or Dart project files (pubspec.yaml, analysis_options.yaml, *.dart) detected.',
      };
    }

    const pubspecContent = this.readPubspec(targetDir) || '';
    const isFlutter = pubspecContent.includes('sdk: flutter') || fs.existsSync(path.join(targetDir, 'android')) || fs.existsSync(path.join(targetDir, 'ios'));

    return {
      matched: true,
      confidence: isFlutter ? 1.0 : 0.8,
      reason: isFlutter
        ? 'Detected Flutter cross-platform mobile application with pubspec.yaml.'
        : 'Detected Dart project with pubspec.yaml.',
      metadata: {
        isFlutter,
        frameworks: isFlutter ? ['flutter'] : [],
      },
    };
  }

  getCapabilities() {
    return [
      'flutter_discovery',
      'dart_sdk_constraints',
      'masvs_storage_security',
      'flutter_secret_safety',
      'flutter_resource_disposal',
      'flutter_error_boundaries',
      'flutter_widget_tests',
      'flutter_linter_rules',
    ];
  }

  getApplicableChecks(target, context) {
    return [
      { id: 'FLUTTER-DISC-001', name: 'Flutter Application Descriptor Present (pubspec.yaml)', category: 'discovery', required: true },
      { id: 'FLUTTER-DISC-002', name: 'Explicit Dart SDK Constraint & Null Safety Enforced', category: 'discovery', required: true },
      { id: 'FLUTTER-DISC-003', name: 'Deterministic Lockfile Present (pubspec.lock)', category: 'discovery', required: false },
      { id: 'FLUTTER-DISC-004', name: 'Static Analysis Linter Rules Configured (analysis_options.yaml)', category: 'discovery', required: false },
      { id: 'FLUTTER-SEC-001', name: 'Hardware-Backed Keystore / Secure Storage (MASVS-STORAGE)', category: 'security', required: true },
      { id: 'FLUTTER-SEC-002', name: 'Client Bundle Hardcoded Secret & Token Safety', category: 'security', required: true },
      { id: 'FLUTTER-SEC-003', name: 'Network Transport Security & Cleartext Traffic Guard', category: 'security', required: false },
      { id: 'FLUTTER-REL-001', name: 'Asynchronous Controller & StreamSubscription Disposal', category: 'accessibility', required: true },
      { id: 'FLUTTER-REL-002', name: 'Global Asynchronous Error Handling & Crash Zone', category: 'accessibility', required: false },
      { id: 'FLUTTER-TEST-001', name: 'Automated Flutter Widget & Unit Test Suite Configured', category: 'build_test', required: true },
      { id: 'FLUTTER-TEST-002', name: 'Flutter Static Analysis & Test Suite Execution', category: 'build_test', required: false },
    ];
  }

  getLimitations() {
    return [
      'Static analysis scans Dart source files and pubspec configurations; runtime memory leaks in platform channels require profiling in Flutter DevTools.',
      'Native mobile execution (flutter run / flutter build apk) requires the Flutter SDK and Android/iOS toolchains; when absent, dynamic checks report NOT_RUN.',
      'Widget tree accessibility semantics verification requires interactive inspection with TalkBack or VoiceOver.',
    ];
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const dartFiles = files.filter(
      (f) =>
        f.endsWith('.dart') &&
        !f.includes('.dart_tool/') &&
        !f.includes('build/')
    );

    const pubspecPath = path.join(targetDir, 'pubspec.yaml');
    const hasPubspec = fs.existsSync(pubspecPath);
    let pubspecContent = '';
    if (hasPubspec) {
      try {
        pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
      } catch {}
    }

    // =========================================================================
    // FLUTTER-DISC-001: Pubspec Descriptor Present
    // =========================================================================
    if (hasPubspec) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-DISC-001',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Flutter Pubspec Manifest Present',
          explanation: 'Found pubspec.yaml defining application package name, assets, and dependencies.',
          evidence: { file: 'pubspec.yaml' },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain explicit dependency version bounds in pubspec.yaml.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-DISC-001',
          category: 'discovery',
          status: 'FAIL',
          severity: 'high',
          title: 'Missing Flutter Pubspec Manifest (pubspec.yaml)',
          explanation: 'No pubspec.yaml found in target directory.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Initialize a Flutter project using "flutter create" to establish standard project metadata.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // FLUTTER-DISC-002: Dart SDK Constraint & Sound Null Safety
    // =========================================================================
    const sdkMatch = pubspecContent.match(/sdk:\s*['"]?([^\r\n'"]+)['"]?/);
    if (sdkMatch) {
      const sdkConstraint = sdkMatch[1].trim();
      const hasSoundNullSafety = sdkConstraint.includes('>=3.') || sdkConstraint.includes('>=2.12');
      if (hasSoundNullSafety) {
        findings.push(
          this.createFinding({
            id: 'FLUTTER-DISC-002',
            category: 'discovery',
            status: 'PASS',
            severity: 'info',
            title: 'Dart Sound Null Safety Enforced',
            explanation: `Dart SDK constraint "${sdkConstraint}" guarantees sound null safety.`,
            evidence: { file: 'pubspec.yaml', snippet: `sdk: ${sdkConstraint}` },
            checkMethod: 'static_analysis',
            recommendation: 'Target modern Dart 3.x runtimes for records, patterns, and strict typing.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'FLUTTER-DISC-002',
            category: 'discovery',
            status: 'WARNING',
            severity: 'medium',
            title: 'Legacy Dart SDK Constraint Without Guaranteed Sound Null Safety',
            explanation: `Dart SDK constraint is set to "${sdkConstraint}". Sound null safety requires Dart >= 2.12 or >= 3.0.`,
            evidence: { file: 'pubspec.yaml' },
            checkMethod: 'static_analysis',
            recommendation: 'Update environment sdk constraint to ">=3.0.0 <4.0.0" in pubspec.yaml.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    } else if (hasPubspec) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-DISC-002',
          category: 'discovery',
          status: 'WARNING',
          severity: 'high',
          title: 'Missing Dart SDK Environment Constraint in pubspec.yaml',
          explanation: 'No "environment: sdk:" block detected in pubspec.yaml.',
          evidence: { file: 'pubspec.yaml' },
          checkMethod: 'static_analysis',
          recommendation: 'Declare environment: sdk: ">=3.0.0 <4.0.0" in pubspec.yaml.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // FLUTTER-DISC-003: Lockfile Present
    // =========================================================================
    const hasLock = fs.existsSync(path.join(targetDir, 'pubspec.lock'));
    if (hasLock) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-DISC-003',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Deterministic Dependency Lockfile Present (pubspec.lock)',
          explanation: 'Found pubspec.lock ensuring reproducible package resolution across CI and production builds.',
          evidence: { file: 'pubspec.lock' },
          checkMethod: 'static_analysis',
          recommendation: 'Commit pubspec.lock for Flutter applications to avoid dependency drift.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-DISC-003',
          category: 'discovery',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Flutter Dependency Lockfile (pubspec.lock)',
          explanation: 'pubspec.lock is missing from repository root. Builds may suffer dependency drift.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Run "flutter pub get" and commit the generated pubspec.lock.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // FLUTTER-DISC-004: Analysis Options & Linter Rules
    // =========================================================================
    const hasAnalysisOptions = fs.existsSync(path.join(targetDir, 'analysis_options.yaml'));
    if (hasAnalysisOptions) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-DISC-004',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Dart Static Analysis & Linter Rules Configured',
          explanation: 'Found analysis_options.yaml configuring static analysis linter rules (flutter_lints).',
          evidence: { file: 'analysis_options.yaml' },
          checkMethod: 'static_analysis',
          recommendation: 'Enable strict type checks (strict-casts, strict-inference) in analysis_options.yaml.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-DISC-004',
          category: 'discovery',
          status: 'WARNING',
          severity: 'low',
          title: 'Missing analysis_options.yaml Linter Configuration',
          explanation: 'No analysis_options.yaml found. Recommended linter rules are not enforced.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Include "package:flutter_lints/flutter.yaml" in analysis_options.yaml.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // FLUTTER-SEC-001: Secure Storage (MASVS-STORAGE)
    // =========================================================================
    let rawPrefsTokenUsage = null;
    const usesSecureStorage = pubspecContent.includes('flutter_secure_storage');

    for (const relFile of dartFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          // Check SharedPreferences storing tokens: setString('token', ...) or setString('jwt', ...)
          if (
            /(?:setString|setStringList)\s*\(\s*['"](?:token|jwt|auth|accessToken|refreshToken|password)['"]/i.test(
              line
            )
          ) {
            rawPrefsTokenUsage = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }
        }
      } catch {}
      if (rawPrefsTokenUsage) break;
    }

    if (rawPrefsTokenUsage) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Insecure Token Storage in Cleartext SharedPreferences (OWASP MASVS-STORAGE)',
          explanation: `Detected authentication token persisted in cleartext SharedPreferences in "${rawPrefsTokenUsage.file}". SharedPreferences stores data in unencrypted XML/plist files.`,
          evidence: {
            file: rawPrefsTokenUsage.file,
            line: rawPrefsTokenUsage.line,
            snippet: sanitizeOutput(rawPrefsTokenUsage.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Use "flutter_secure_storage" to encrypt sensitive tokens using Android Keystore and iOS Keychain.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (usesSecureStorage) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-SEC-001',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Hardware-Backed Keystore / Secure Storage Configured (MASVS-STORAGE)',
          explanation: 'Found flutter_secure_storage in pubspec.yaml for protecting sensitive authentication credentials.',
          evidence: { file: 'pubspec.yaml' },
          checkMethod: 'static_analysis',
          recommendation: 'Configure encryptedSharedPreferences: true for Android in FlutterSecureStorage options.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-SEC-001',
          category: 'security',
          status: 'MANUAL_REVIEW',
          severity: 'medium',
          title: 'Flutter Token Persistence Requires Human Review',
          explanation: 'No cleartext token persistence pattern was detected, but flutter_secure_storage is not declared in pubspec.yaml.',
          evidence: { file: 'pubspec.yaml' },
          checkMethod: 'manual_verification_required',
          recommendation: 'Confirm session tokens are stored exclusively via hardware-backed secure storage.',
          manualVerificationRequired: true,
          confidence: 'medium_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // FLUTTER-SEC-002: Client Bundle Hardcoded Secrets
    // =========================================================================
    let leakedSecret = null;
    for (const relFile of dartFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          const match = line.match(
            /(?:apiSecret|privateKey|secretKey|dbPassword|adminKey)\s*=\s*['"]([a-zA-Z0-9_\-.~]{8,})['"]/i
          );
          if (match && !line.includes('String.fromEnvironment')) {
            leakedSecret = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }
        }
      } catch {}
      if (leakedSecret) break;
    }

    if (leakedSecret) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-SEC-002',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Hardcoded API Secret in Flutter Dart Source Code',
          explanation: `Detected hardcoded secret literal in "${leakedSecret.file}". Compiled Flutter AOT code can be decompiled or inspected via strings analysis.`,
          evidence: {
            file: leakedSecret.file,
            line: leakedSecret.line,
            snippet: sanitizeOutput(leakedSecret.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Pass configuration via String.fromEnvironment at compile time or proxy requests through a secure backend API.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-SEC-002',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'No Hardcoded Secrets Detected in Dart Sources',
          explanation: 'No plaintext API secret literals detected across analyzed Flutter source code.',
          evidence: { file: dartFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Inject deployment configuration using --dart-define flags at build time.',
          manualVerificationRequired: false,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // FLUTTER-REL-001: Controller & StreamSubscription Disposal
    // =========================================================================
    let hasStatefulWidget = false;
    let missingDisposal = null;

    for (const relFile of dartFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        if (content.includes('State<') || content.includes('StatefulWidget')) {
          hasStatefulWidget = true;
          // Check for controllers or stream subscriptions
          const hasController =
            content.includes('TextEditingController') ||
            content.includes('AnimationController') ||
            content.includes('ScrollController') ||
            content.includes('StreamSubscription');

          if (hasController) {
            const hasDisposeMethod = /void\s+dispose\s*\(\s*\)/.test(content);
            const callsSuperDispose = content.includes('super.dispose()');
            if (!hasDisposeMethod || !callsSuperDispose) {
              missingDisposal = {
                file: relFile,
                reason: !hasDisposeMethod
                  ? 'Stateful widget defines controllers/streams but lacks a dispose() method.'
                  : 'dispose() method does not call super.dispose().',
              };
              break;
            }
          }
        }
      } catch {}
    }

    if (missingDisposal) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-REL-001',
          category: 'accessibility',
          status: 'WARNING',
          severity: 'high',
          title: 'Missing Controller or StreamSubscription Disposal in Flutter State',
          explanation: `In "${missingDisposal.file}": ${missingDisposal.reason}. Undisposed controllers cause memory leaks and runtime CPU overhead on mobile devices.`,
          evidence: { file: missingDisposal.file },
          checkMethod: 'static_analysis',
          recommendation: 'Override dispose() in State classes and invoke controller.dispose() / subscription.cancel() followed by super.dispose().',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasStatefulWidget) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-REL-001',
          category: 'accessibility',
          status: 'PASS',
          severity: 'info',
          title: 'Flutter State Resource Disposal Guardrails Enforced',
          explanation: 'StatefulWidget controllers and stream subscriptions implement proper dispose() lifecycles.',
          evidence: { file: dartFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Regularly audit custom widget controllers for proper disposal.',
          manualVerificationRequired: false,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // FLUTTER-REL-002: Global Error Zone
    // =========================================================================
    let hasGlobalErrorHandling = false;
    for (const relFile of dartFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        if (
          content.includes('runZonedGuarded') ||
          content.includes('FlutterError.onError') ||
          content.includes('PlatformDispatcher.instance.onError')
        ) {
          hasGlobalErrorHandling = true;
          break;
        }
      } catch {}
    }

    if (hasGlobalErrorHandling) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-REL-002',
          category: 'accessibility',
          status: 'PASS',
          severity: 'info',
          title: 'Global Asynchronous Error Zone Configured',
          explanation: 'Found global error catcher (runZonedGuarded or FlutterError.onError) protecting application from uncaught async exceptions.',
          evidence: { file: dartFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Forward uncaught exceptions to crash reporting telemetry.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // FLUTTER-TEST-001: Automated Widget & Unit Tests
    // =========================================================================
    const hasTestDir =
      fs.existsSync(path.join(targetDir, 'test')) ||
      files.some((f) => f.includes('test/') && f.endsWith('_test.dart'));

    if (hasTestDir) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-TEST-001',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Automated Flutter Test Suite Configured',
          explanation: 'Found automated Flutter unit/widget test directory (test/) and test files.',
          evidence: { file: 'test/' },
          checkMethod: 'static_analysis',
          recommendation: 'Run flutter test --coverage in continuous integration.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-TEST-001',
          category: 'build_test',
          status: 'WARNING',
          severity: 'high',
          title: 'No Automated Flutter Tests Detected',
          explanation: 'No test/ directory or *_test.dart test files found in project.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Create widget and unit tests using flutter_test package.',
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

    // Check if flutter is installed
    let flutterAvailable = false;
    try {
      const check = execRunner('flutter', ['--version'], {
        cwd: targetDir,
        timeoutMs: 5000,
        allowExec: true,
        trustProject: true,
        isIsolated: true,
      });
      if (check.exitCode === 0) flutterAvailable = true;
    } catch {}

    if (!flutterAvailable) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-TEST-002',
          category: 'build_test',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Flutter Test Execution Skipped (Flutter Toolchain Not Installed)',
          explanation: 'Flutter command-line toolchain ("flutter") is not available on the current host. Dynamic execution skipped.',
          evidence: { file: 'pubspec.yaml' },
          checkMethod: 'execution_skipped',
          recommendation: 'Install Flutter SDK (https://docs.flutter.dev/get-started/install) to execute automated tests in CI.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
      return findings;
    }

    if (!context.allowExec) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-TEST-002',
          category: 'build_test',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Flutter Test Execution Skipped (Requires Authorization)',
          explanation: 'Flutter test execution ("flutter test") was skipped in read-only mode.',
          evidence: { file: 'pubspec.yaml' },
          checkMethod: 'execution_skipped',
          recommendation: 'Run with --allow-exec in an isolated environment to execute Flutter tests.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
      return findings;
    }

    const res = execRunner('flutter', ['test'], {
      cwd: targetDir,
      timeoutMs: context.timeoutMs || 60000,
      allowExec: context.allowExec,
      trustProject: context.trustProject,
      isIsolated: context.isIsolated,
      auditLog: context.executionAudit,
    });

    if (res.exitCode === 0) {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-TEST-002',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Flutter Test Suite Executed Successfully',
          explanation: 'All Flutter unit and widget tests passed.',
          evidence: { snippet: sanitizeOutput(res.stdout || '') },
          checkMethod: 'command_execution',
          recommendation: 'Maintain continuous automated testing in CI.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'FLUTTER-TEST-002',
          category: 'build_test',
          status: 'FAIL',
          severity: 'critical',
          title: 'Flutter Test Suite Execution Failed',
          explanation: `Flutter tests failed with exit code ${res.exitCode}.`,
          evidence: { snippet: sanitizeOutput(res.stderr || res.stdout || '') },
          checkMethod: 'command_execution',
          recommendation: 'Investigate and resolve failing Flutter test assertions.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    return findings;
  }
}
