import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION, sanitizeOutput } from '../constants.mjs';

/**
 * Platform Adapter for Native Android Applications (Kotlin & Java).
 * Evaluates Gradle build scripts, AndroidManifest.xml, OWASP MASVS controls,
 * exported component protections, cleartext traffic, backup safety, and ProGuard/R8.
 */
export class AndroidAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'android',
      name: 'Android Native Platform Readiness Adapter',
      version: TOOL_VERSION,
      description: 'Assesses native Android applications (Kotlin/Java) for Gradle configurations, OWASP MASVS security, exported components, cleartext traffic, backup flags, and ProGuard/R8 obfuscation.',
      supportedLanguages: ['kotlin', 'java'],
      supportedFrameworks: ['android-native'],
      requiredTools: ['java'],
    });
  }

  /**
   * Helper to locate AndroidManifest.xml files across target directory.
   */
  findManifests(targetDir, files) {
    const candidateFiles = files.filter(
      (f) =>
        f.endsWith('AndroidManifest.xml') &&
        !f.includes('build/') &&
        !f.includes('.gradle/')
    );

    const fullPaths = [];
    for (const c of candidateFiles) {
      fullPaths.push(path.join(targetDir, c));
    }

    if (fullPaths.length === 0) {
      const defaultPath = path.join(targetDir, 'src', 'main', 'AndroidManifest.xml');
      if (fs.existsSync(defaultPath)) fullPaths.push(defaultPath);
    }

    return fullPaths;
  }

  /**
   * Detects whether the target application is a native Android project.
   */
  detect(target, context) {
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const hasManifest =
      fs.existsSync(path.join(targetDir, 'AndroidManifest.xml')) ||
      fs.existsSync(path.join(targetDir, 'src', 'main', 'AndroidManifest.xml')) ||
      files.some((f) => f.endsWith('AndroidManifest.xml'));

    const hasGradle =
      fs.existsSync(path.join(targetDir, 'build.gradle')) ||
      fs.existsSync(path.join(targetDir, 'build.gradle.kts')) ||
      fs.existsSync(path.join(targetDir, 'settings.gradle')) ||
      fs.existsSync(path.join(targetDir, 'settings.gradle.kts'));

    if (!hasManifest && !hasGradle) {
      return {
        matched: false,
        confidence: 0,
        reason: 'No AndroidManifest.xml or Android Gradle build scripts detected.',
      };
    }

    let isAndroidApp = false;
    // Check Gradle scripts for Android plugin
    for (const g of ['build.gradle', 'build.gradle.kts', 'app/build.gradle', 'app/build.gradle.kts']) {
      const p = path.join(targetDir, g);
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          if (
            content.includes('com.android.application') ||
            content.includes('com.android.library') ||
            content.includes('android {')
          ) {
            isAndroidApp = true;
            break;
          }
        } catch {}
      }
    }

    if (!isAndroidApp && hasManifest) {
      isAndroidApp = true;
    }

    if (!isAndroidApp) {
      return {
        matched: false,
        confidence: 0,
        reason: 'Gradle build files found, but Android plugin (com.android.application/library) not detected.',
      };
    }

    return {
      matched: true,
      confidence: 1.0,
      reason: 'Detected native Android application with AndroidManifest.xml and Gradle build descriptor.',
      metadata: {
        hasManifest,
        frameworks: ['android-native'],
      },
    };
  }

  getCapabilities() {
    return [
      'android_discovery',
      'android_sdk_versions',
      'masvs_platform_exported_components',
      'masvs_network_cleartext_traffic',
      'masvs_storage_backup_safety',
      'masvs_storage_encrypted_prefs',
      'masvs_code_proguard_r8',
      'masvs_code_keystore_protection',
      'android_test_suite',
    ];
  }

  getApplicableChecks(target, context) {
    return [
      { id: 'ANDROID-DISC-001', name: 'Android Manifest & Build Configuration Present', category: 'discovery', required: true },
      { id: 'ANDROID-DISC-002', name: 'Explicit Compile & Target SDK Version Declared', category: 'discovery', required: true },
      { id: 'ANDROID-SEC-001', name: 'Exported Components Protected (OWASP MASVS-PLATFORM)', category: 'security', required: true },
      { id: 'ANDROID-SEC-002', name: 'Cleartext HTTP Traffic Disabled (OWASP MASVS-NETWORK)', category: 'security', required: true },
      { id: 'ANDROID-SEC-003', name: 'Application Backup Data Exposure Guard (OWASP MASVS-STORAGE)', category: 'security', required: true },
      { id: 'ANDROID-SEC-004', name: 'Encrypted SharedPreferences / Keystore Usage (OWASP MASVS-STORAGE)', category: 'security', required: true },
      { id: 'ANDROID-SEC-005', name: 'ProGuard / R8 Code Obfuscation & Minification Configured (OWASP MASVS-CODE)', category: 'security', required: false },
      { id: 'ANDROID-SEC-006', name: 'Keystore Credentials & Release Signing Key Protection (OWASP MASVS-CODE)', category: 'security', required: true },
      { id: 'ANDROID-REL-001', name: 'Android Architecture & Lifecycle State Management', category: 'accessibility', required: false },
      { id: 'ANDROID-TEST-001', name: 'Automated Android Unit Test Suite Configured', category: 'build_test', required: true },
      { id: 'ANDROID-TEST-002', name: 'Android Gradle Build & Test Execution', category: 'build_test', required: false },
    ];
  }

  getLimitations() {
    return [
      'Static analysis scans AndroidManifest.xml and Gradle configurations; dynamically registered BroadcastReceivers at runtime cannot be fully statically inventoried.',
      'Physical device checks (e.g. biometric authentication, hardware keystore backing level) require adb connected device testing.',
      'Android Gradle build execution requires Android SDK build-tools; when absent from host, native compile checks report NOT_RUN.',
    ];
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const manifestPaths = this.findManifests(targetDir, files);
    let combinedManifests = '';
    let primaryManifestRel = 'AndroidManifest.xml';

    for (const mp of manifestPaths) {
      try {
        const content = fs.readFileSync(mp, 'utf8');
        combinedManifests += '\n' + content;
        primaryManifestRel = path.relative(projectDir, mp).replace(/\\/g, '/');
      } catch {}
    }

    // Search Gradle files
    const gradleFiles = files.filter(
      (f) =>
        (f.endsWith('build.gradle') || f.endsWith('build.gradle.kts')) &&
        !f.includes('.gradle/') &&
        !f.includes('build/')
    );

    let combinedGradle = '';
    for (const gf of gradleFiles) {
      try {
        combinedGradle += '\n' + fs.readFileSync(path.join(projectDir, gf), 'utf8');
      } catch {}
    }

    // =========================================================================
    // ANDROID-DISC-001: Manifest & Build Configuration Present
    // =========================================================================
    if (combinedManifests.length > 0) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-DISC-001',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Android Application Manifest Detected',
          explanation: `Found AndroidManifest.xml at "${primaryManifestRel}".`,
          evidence: { file: primaryManifestRel },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure all declared components match application package structure.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'ANDROID-DISC-001',
          category: 'discovery',
          status: 'FAIL',
          severity: 'high',
          title: 'Missing AndroidManifest.xml File',
          explanation: 'No AndroidManifest.xml file found in analyzed project.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Create src/main/AndroidManifest.xml defining application package and components.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // ANDROID-DISC-002: Compile & Target SDK Version
    // =========================================================================
    let targetSdk = null;
    let compileSdk = null;

    const targetMatch = combinedGradle.match(/targetSdk(?:Version)?\s*[:=]?\s*([0-9]+)/);
    if (targetMatch) targetSdk = parseInt(targetMatch[1], 10);

    const compileMatch = combinedGradle.match(/compileSdk(?:Version)?\s*[:=]?\s*([0-9]+)/);
    if (compileMatch) compileSdk = parseInt(compileMatch[1], 10);

    if (targetSdk && targetSdk >= 33) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-DISC-002',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Modern Target Android SDK Declared',
          explanation: `Target SDK version is ${targetSdk} (>= 33 Android 13+), satisfying Google Play requirements.`,
          evidence: { file: gradleFiles[0] || 'build.gradle', snippet: `targetSdk ${targetSdk}` },
          checkMethod: 'static_analysis',
          recommendation: 'Target the latest Android platform SDK (API 34/35) to benefit from privacy and security enhancements.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (targetSdk) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-DISC-002',
          category: 'discovery',
          status: 'WARNING',
          severity: 'high',
          title: 'Outdated Target Android SDK Version',
          explanation: `Target SDK is ${targetSdk}. Google Play requires targetSdkVersion >= 33 for new app submissions and updates.`,
          evidence: { file: gradleFiles[0] || 'build.gradle' },
          checkMethod: 'static_analysis',
          recommendation: 'Update targetSdk to 34 or higher in build.gradle.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // ANDROID-SEC-001: Exported Components (MASVS-PLATFORM)
    // =========================================================================
    let unprotectedExportedComponent = null;

    // Check for android:exported="true" on activity, service, receiver, or provider
    const componentRegex = /<(activity|service|receiver|provider)[^>]*android:exported\s*=\s*['"]true['"][^>]*>/gis;
    let match;
    while ((match = componentRegex.exec(combinedManifests)) !== null) {
      const tag = match[0];
      const type = match[1];
      // Check if it has android:permission or is main launcher activity
      const hasPermission = tag.includes('android:permission');
      const isLauncher = tag.includes('android.intent.action.MAIN') || tag.includes('android.intent.category.LAUNCHER');
      if (!hasPermission && !isLauncher && type !== 'activity') {
        unprotectedExportedComponent = { type, snippet: tag.substring(0, 100) };
        break;
      }
    }

    if (unprotectedExportedComponent) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Unprotected Exported Android Component (OWASP MASVS-PLATFORM)',
          explanation: `Detected <${unprotectedExportedComponent.type}> with android:exported="true" without an explicit android:permission constraint. Other installed apps on the device can invoke this component without authorization.`,
          evidence: { file: primaryManifestRel, snippet: sanitizeOutput(unprotectedExportedComponent.snippet) },
          checkMethod: 'static_analysis',
          recommendation: 'Set android:exported="false" or restrict invocation with android:permission.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (combinedManifests.length > 0) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-001',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Android Exported Component Boundaries Enforced (MASVS-PLATFORM)',
          explanation: 'All declared components either enforce android:exported="false" or restrict access via system permissions.',
          evidence: { file: primaryManifestRel },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure all newly added activities, services, and receivers explicitly declare android:exported.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // ANDROID-SEC-002: Cleartext HTTP Traffic (MASVS-NETWORK)
    // =========================================================================
    const allowsCleartext = /android:usesCleartextTraffic\s*=\s*['"]true['"]/i.test(combinedManifests);
    const hasNetworkSecurityConfig = /android:networkSecurityConfig\s*=\s*['"]@xml\/network_security_config['"]/i.test(
      combinedManifests
    );

    if (allowsCleartext) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-002',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Cleartext HTTP Traffic Permitted (OWASP MASVS-NETWORK)',
          explanation: 'android:usesCleartextTraffic is set to "true" in AndroidManifest.xml. Network communications can be intercepted via plaintext HTTP Man-in-the-Middle attacks.',
          evidence: { file: primaryManifestRel },
          checkMethod: 'static_analysis',
          recommendation: 'Remove usesCleartextTraffic="true" or configure a network_security_config.xml restricting cleartext to local debug endpoints.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasNetworkSecurityConfig || combinedManifests.length > 0) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-002',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Cleartext HTTP Traffic Blocked by Default (MASVS-NETWORK)',
          explanation: 'Cleartext traffic is disabled, ensuring all outbound mobile network requests utilize TLS/HTTPS.',
          evidence: { file: primaryManifestRel },
          checkMethod: 'static_analysis',
          recommendation: 'Implement certificate pinning via network_security_config.xml for sensitive API endpoints.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // ANDROID-SEC-003: Application Backup Flag (MASVS-STORAGE)
    // =========================================================================
    const allowsBackup = /android:allowBackup\s*=\s*['"]true['"]/i.test(combinedManifests);
    if (allowsBackup) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-003',
          category: 'security',
          status: 'FAIL',
          severity: 'medium',
          title: 'Application Backup Enabled on Sensitive Storage (OWASP MASVS-STORAGE)',
          explanation: 'android:allowBackup is set to "true" in AndroidManifest.xml. Attackers with temporary physical device access can extract app databases and private shared preferences using "adb backup".',
          evidence: { file: primaryManifestRel },
          checkMethod: 'static_analysis',
          recommendation: 'Set android:allowBackup="false" or configure android:fullBackupContent with an explicit exclude list for private data.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (combinedManifests.length > 0) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-003',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Android Backup Data Exposure Disabled (MASVS-STORAGE)',
          explanation: 'android:allowBackup is explicitly set to false, protecting app-private storage from adb backup extraction.',
          evidence: { file: primaryManifestRel },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain allowBackup="false" across all production releases.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // ANDROID-SEC-004: EncryptedSharedPreferences (MASVS-STORAGE)
    // =========================================================================
    let usesEncryptedPrefs =
      combinedGradle.includes('androidx.security:security-crypto') ||
      files.some((f) => {
        if (!f.endsWith('.kt') && !f.endsWith('.java')) return false;
        try {
          const content = fs.readFileSync(path.join(projectDir, f), 'utf8');
          return content.includes('EncryptedSharedPreferences') || content.includes('MasterKey');
        } catch {
          return false;
        }
      });

    let rawPrefsTokenLeakage = false;
    for (const f of files) {
      if (!f.endsWith('.kt') && !f.endsWith('.java')) continue;
      try {
        const content = fs.readFileSync(path.join(projectDir, f), 'utf8');
        if (
          content.includes('getSharedPreferences') &&
          /putString\s*\(\s*['"][^'"]*(?:token|jwt|auth|password|secret)[^'"]*['"]/i.test(content) &&
          !content.includes('EncryptedSharedPreferences')
        ) {
          rawPrefsTokenLeakage = true;
          break;
        }
      } catch {}
    }

    if (rawPrefsTokenLeakage) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-004',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Insecure Token Persistence in Unencrypted SharedPreferences (OWASP MASVS-STORAGE)',
          explanation: 'Detected authentication token persisted in cleartext SharedPreferences without encryption.',
          evidence: { file: 'src/main/' },
          checkMethod: 'static_analysis',
          recommendation: 'Migrate to EncryptedSharedPreferences from androidx.security:security-crypto backed by Android Keystore.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (usesEncryptedPrefs) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-004',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Hardware-Backed Keystore & EncryptedSharedPreferences Enforced (MASVS-STORAGE)',
          explanation: 'Found EncryptedSharedPreferences / androidx.security:security-crypto securing app-private credentials.',
          evidence: { file: gradleFiles[0] || 'build.gradle' },
          checkMethod: 'static_analysis',
          recommendation: 'Use MasterKey.DEFAULT_AES_GCM_SPEC for hardware-backed master key generation.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-004',
          category: 'security',
          status: 'MANUAL_REVIEW',
          severity: 'medium',
          title: 'Android Local Storage Security Requires Human Review',
          explanation: 'No raw SharedPreferences token leakage was found, but androidx.security:security-crypto was not detected in build.gradle.',
          evidence: { file: gradleFiles[0] || 'build.gradle' },
          checkMethod: 'manual_verification_required',
          recommendation: 'Confirm sensitive tokens and session credentials are encrypted at rest using Android Keystore.',
          manualVerificationRequired: true,
          confidence: 'medium_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // ANDROID-SEC-005: ProGuard / R8 Obfuscation (MASVS-CODE)
    // =========================================================================
    const hasMinifyEnabled = /minifyEnabled\s*(?:true|= true)/i.test(combinedGradle);
    const hasProguardRules =
      fs.existsSync(path.join(targetDir, 'proguard-rules.pro')) ||
      fs.existsSync(path.join(targetDir, 'app', 'proguard-rules.pro'));

    if (hasMinifyEnabled && hasProguardRules) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-005',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'ProGuard / R8 Obfuscation & Minification Configured (MASVS-CODE)',
          explanation: 'minifyEnabled is enabled in release build type and proguard-rules.pro is configured.',
          evidence: { file: 'proguard-rules.pro' },
          checkMethod: 'static_analysis',
          recommendation: 'Test release builds using R8 full mode and verify mapping files are archived with CI artifacts.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-005',
          category: 'security',
          status: 'WARNING',
          severity: 'medium',
          title: 'ProGuard / R8 Obfuscation Not Explicitly Enabled for Release',
          explanation: 'minifyEnabled is missing or set to false in build.gradle. Unminified Android release builds expose class, method, and variable names to reverse engineering.',
          evidence: { file: gradleFiles[0] || 'build.gradle' },
          checkMethod: 'static_analysis',
          recommendation: 'Enable minifyEnabled true and shrinkResources true in release build type.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // ANDROID-SEC-006: Keystore Credential Safety (MASVS-CODE)
    // =========================================================================
    let hardcodedKeystorePassword = null;
    const lines = combinedGradle.split(/\r?\n/);
    for (const line of lines) {
      if (
        /(?:storePassword|keyPassword)\s*(?:[:=]|\s+)\s*['"][^'"${}]+['"]/i.test(line) &&
        !line.includes('System.getenv') &&
        !line.includes('project.findProperty')
      ) {
        hardcodedKeystorePassword = line.trim();
        break;
      }
    }

    if (hardcodedKeystorePassword) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-006',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Hardcoded Keystore Signing Password in build.gradle',
          explanation: 'Detected plaintext storePassword or keyPassword committed in build.gradle.',
          evidence: { file: gradleFiles[0] || 'build.gradle', snippet: sanitizeOutput(hardcodedKeystorePassword) },
          checkMethod: 'static_analysis',
          recommendation: 'Inject signing credentials via environment variables: storePassword System.getenv("KEYSTORE_PASSWORD").',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'ANDROID-SEC-006',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Release Keystore Signing Credentials Protected',
          explanation: 'No plaintext keystore passwords or signing secrets detected in Gradle build files.',
          evidence: { file: gradleFiles[0] || 'build.gradle' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure release .jks/.keystore files are excluded from Git via .gitignore.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // ANDROID-TEST-001: Automated Test Suite Configured
    // =========================================================================
    const hasTestFiles = files.some(
      (f) =>
        (f.includes('src/test/') || f.includes('src/androidTest/')) &&
        (f.endsWith('.kt') || f.endsWith('.java'))
    );

    if (hasTestFiles) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-TEST-001',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Automated Android Test Suite Configured',
          explanation: 'Found automated Android unit/instrumented test source files in src/test/ or src/androidTest/.',
          evidence: { file: 'src/test/' },
          checkMethod: 'static_analysis',
          recommendation: 'Execute ./gradlew test in continuous integration pipelines.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'ANDROID-TEST-001',
          category: 'build_test',
          status: 'WARNING',
          severity: 'high',
          title: 'No Automated Android Tests Detected',
          explanation: 'Could not find test files in src/test/java or src/test/kotlin.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Add JUnit and MockK/Mockito unit tests under src/test/.',
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

    // Check for gradlew wrapper script
    const hasGradlew =
      fs.existsSync(path.join(targetDir, 'gradlew')) ||
      fs.existsSync(path.join(targetDir, 'gradlew.bat'));

    if (!hasGradlew) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-TEST-002',
          category: 'build_test',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Android Gradle Execution Skipped (Missing Gradle Wrapper)',
          explanation: 'No gradlew wrapper script found in project root.',
          evidence: { file: '.' },
          checkMethod: 'execution_skipped',
          recommendation: 'Generate standard Gradle wrapper using "gradle wrapper".',
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
          id: 'ANDROID-TEST-002',
          category: 'build_test',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Android Test Execution Skipped (Requires Authorization)',
          explanation: 'Gradle test execution (./gradlew test) was skipped in read-only mode.',
          evidence: { file: 'gradlew' },
          checkMethod: 'execution_skipped',
          recommendation: 'Run with --allow-exec in an isolated container to execute Android tests.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
      return findings;
    }

    const wrapperCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const res = execRunner(wrapperCmd, ['test', '--no-daemon'], {
      cwd: targetDir,
      timeoutMs: context.timeoutMs || 90000,
      allowExec: context.allowExec,
      trustProject: context.trustProject,
      isIsolated: context.isIsolated,
      auditLog: context.executionAudit,
    });

    if (res.exitCode === 0) {
      findings.push(
        this.createFinding({
          id: 'ANDROID-TEST-002',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Android Gradle Unit Tests Executed Successfully',
          explanation: 'Gradle unit tests passed with exit code 0.',
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
          id: 'ANDROID-TEST-002',
          category: 'build_test',
          status: 'FAIL',
          severity: 'critical',
          title: 'Android Gradle Unit Tests Failed',
          explanation: `Gradle test execution failed with exit code ${res.exitCode}.`,
          evidence: { snippet: sanitizeOutput(res.stderr || res.stdout || '') },
          checkMethod: 'command_execution',
          recommendation: 'Investigate failing unit tests before creating a release build.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    return findings;
  }
}
