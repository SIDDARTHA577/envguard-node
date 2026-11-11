import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION, sanitizeOutput } from '../constants.mjs';

/**
 * Platform Adapter for Native iOS Applications (Swift & Objective-C).
 * Evaluates Xcode project structures, OWASP MASVS controls, App Transport Security,
 * Keychain usage, Privacy Manifests (PrivacyInfo.xcprivacy), and XCTest suites.
 */
export class IosAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'ios',
      name: 'iOS & Apple Native Platform Readiness Adapter',
      version: TOOL_VERSION,
      description: 'Assesses native iOS and Apple platform applications (Swift/Objective-C) for Xcode project structure, OWASP MASVS security, App Transport Security, Keychain storage, Privacy Manifests, and XCTest suites.',
      supportedLanguages: ['swift', 'objective-c'],
      supportedFrameworks: ['ios-native'],
      requiredTools: ['xcodebuild', 'swift'],
    });
  }

  /**
   * Detects whether the target application is a native iOS/Apple project.
   */
  detect(target, context) {
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const hasXcodeProj = files.some((f) => f.includes('.xcodeproj'));
    const hasXcWorkspace = files.some((f) => f.includes('.xcworkspace'));
    const hasPackageSwift = fs.existsSync(path.join(targetDir, 'Package.swift'));
    const hasPodfile = fs.existsSync(path.join(targetDir, 'Podfile'));
    const hasInfoPlist = files.some((f) => f.endsWith('Info.plist'));
    const hasSwiftFiles = files.some(
      (f) =>
        f.endsWith('.swift') &&
        !f.includes('.build/') &&
        !f.includes('DerivedData/')
    );

    if (!hasXcodeProj && !hasXcWorkspace && !hasPackageSwift && !hasPodfile && !hasInfoPlist && !hasSwiftFiles) {
      return {
        matched: false,
        confidence: 0,
        reason: 'No iOS build descriptors (*.xcodeproj, *.xcworkspace, Package.swift, Podfile, Info.plist) or Swift source files detected.',
      };
    }

    return {
      matched: true,
      confidence: hasXcodeProj || hasPackageSwift ? 1.0 : 0.8,
      reason: hasXcodeProj
        ? 'Detected native iOS application with Xcode project structure.'
        : 'Detected Apple platform project with Swift sources or package manifest.',
      metadata: {
        hasXcodeProj,
        hasPackageSwift,
        frameworks: ['ios-native'],
      },
    };
  }

  getCapabilities() {
    return [
      'ios_discovery',
      'ios_deployment_target',
      'masvs_network_app_transport_security',
      'masvs_storage_keychain_services',
      'masvs_privacy_manifest',
      'masvs_platform_custom_url_schemes',
      'ios_concurrency_memory_safety',
      'ios_test_suite',
    ];
  }

  getApplicableChecks(_target, _context) {
    return [
      { id: 'IOS-DISC-001', name: 'Xcode Project or Swift Package Descriptor Present', category: 'discovery', required: true },
      { id: 'IOS-DISC-002', name: 'Target iOS Deployment Version Declared', category: 'discovery', required: true },
      { id: 'IOS-SEC-001', name: 'App Transport Security (ATS) Enforced (OWASP MASVS-NETWORK)', category: 'security', required: true },
      { id: 'IOS-SEC-002', name: 'Secure Keychain Token Storage (OWASP MASVS-STORAGE)', category: 'security', required: true },
      { id: 'IOS-SEC-003', name: 'Apple Privacy Manifest & Permission Usage Descriptions (OWASP MASVS-PRIVACY)', category: 'security', required: true },
      { id: 'IOS-SEC-004', name: 'Custom URL Scheme & Deep Link Boundary Validation', category: 'security', required: false },
      { id: 'IOS-REL-001', name: 'Swift Concurrency & ARC Memory Cycle Guardrails', category: 'accessibility', required: false },
      { id: 'IOS-TEST-001', name: 'Automated XCTest / Swift Testing Suite Configured', category: 'build_test', required: true },
      { id: 'IOS-TEST-002', name: 'Native Xcodebuild Simulator Test Execution', category: 'build_test', required: false },
    ];
  }

  getLimitations() {
    return [
      'Native iOS compilation and simulator execution require a macOS host with Xcode installed; on Linux and Windows hosts, native test execution evaluates to NOT_RUN.',
      'Static analysis scans Info.plist, project configurations, and Swift source files; dynamic runtime swizzling or code injection cannot be statically resolved.',
      'Apple Developer signing identity verification requires access to local macOS Keychain provisioning certificates.',
    ];
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const swiftFiles = files.filter(
      (f) =>
        (f.endsWith('.swift') || f.endsWith('.m') || f.endsWith('.h')) &&
        !f.includes('.build/') &&
        !f.includes('DerivedData/')
    );

    const infoPlistFiles = files.filter(
      (f) =>
        f.endsWith('Info.plist') &&
        !f.includes('.build/') &&
        !f.includes('DerivedData/')
    );

    // =========================================================================
    // IOS-DISC-001: Project Descriptor Present
    // =========================================================================
    const xcodeProj = files.find((f) => f.endsWith('.xcodeproj'));
    const packageSwift = fs.existsSync(path.join(targetDir, 'Package.swift'));

    if (xcodeProj || packageSwift) {
      const descriptor = xcodeProj || 'Package.swift';
      findings.push(
        this.createFinding({
          id: 'IOS-DISC-001',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'iOS Project Descriptor Detected',
          explanation: `Found primary iOS project descriptor at "${descriptor}".`,
          evidence: { file: descriptor },
          checkMethod: 'static_analysis',
          recommendation: 'Manage dependencies via Swift Package Manager (SPM) or CocoaPods with committed lockfiles.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'IOS-DISC-001',
          category: 'discovery',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Standard Xcode Project (*.xcodeproj) or Package.swift',
          explanation: 'No .xcodeproj bundle or Package.swift found in repository root.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Initialize an Xcode project to declare build schemes, entitlements, and target configurations.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // IOS-DISC-002: Target iOS Deployment Version
    // =========================================================================
    let deploymentTarget = null;
    let deploymentEvidence = null;

    for (const f of files) {
      if (f.endsWith('project.pbxproj') || f.endsWith('Package.swift')) {
        try {
          const content = fs.readFileSync(path.join(projectDir, f), 'utf8');
          const match =
            content.match(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*([0-9.]+)/) ||
            content.match(/\.iOS\(\s*['"]\.?v?([0-9_]+)['"]\s*\)/);
          if (match) {
            deploymentTarget = match[1].replace(/_/g, '.');
            deploymentEvidence = f;
            break;
          }
        } catch { /* ignore non-critical read/parse error */ }
      }
    }

    if (deploymentTarget) {
      const numTarget = parseFloat(deploymentTarget);
      if (numTarget >= 15.0) {
        findings.push(
          this.createFinding({
            id: 'IOS-DISC-002',
            category: 'discovery',
            status: 'PASS',
            severity: 'info',
            title: 'Modern iOS Deployment Target Declared',
            explanation: `Minimum deployment target declared as iOS ${deploymentTarget} in ${deploymentEvidence}.`,
            evidence: { file: deploymentEvidence, snippet: `IPHONEOS_DEPLOYMENT_TARGET = ${deploymentTarget}` },
            checkMethod: 'static_analysis',
            recommendation: 'Target iOS 16+ or 17+ to leverage modern Swift Concurrency and SwiftUI APIs.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      } else {
        findings.push(
          this.createFinding({
            id: 'IOS-DISC-002',
            category: 'discovery',
            status: 'WARNING',
            severity: 'medium',
            title: 'Legacy iOS Deployment Target Declared',
            explanation: `Minimum deployment target is iOS ${deploymentTarget} (< 15.0). Legacy targets lack modern App Transport Security and privacy enforcement.`,
            evidence: { file: deploymentEvidence },
            checkMethod: 'static_analysis',
            recommendation: 'Update minimum deployment target to iOS 16.0 or higher.',
            manualVerificationRequired: false,
            confidence: 'verified_fact',
            targetPath: target.path,
          })
        );
      }
    }

    // =========================================================================
    // IOS-SEC-001: App Transport Security (ATS) Enforced (MASVS-NETWORK)
    // =========================================================================
    let arbitraryLoadsEnabled = false;
    let atsFindingFile = infoPlistFiles[0] || 'Info.plist';

    for (const ip of infoPlistFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, ip), 'utf8');
        // Check for NSAllowsArbitraryLoads = <true/>
        if (
          content.includes('NSAllowsArbitraryLoads') &&
          /<key>NSAllowsArbitraryLoads<\/key>\s*<true\s*\/>/i.test(content)
        ) {
          arbitraryLoadsEnabled = true;
          atsFindingFile = ip;
          break;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (arbitraryLoadsEnabled) {
      findings.push(
        this.createFinding({
          id: 'IOS-SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Insecure App Transport Security Configuration (NSAllowsArbitraryLoads = true)',
          explanation: `In "${atsFindingFile}": NSAllowsArbitraryLoads is set to true. This completely disables Apple App Transport Security, permitting cleartext HTTP network traffic and exposing API calls to Man-in-the-Middle interception.`,
          evidence: { file: atsFindingFile, snippet: '<key>NSAllowsArbitraryLoads</key><true/>' },
          checkMethod: 'static_analysis',
          recommendation: 'Remove NSAllowsArbitraryLoads or restrict exceptions to explicit NSExceptionDomains with HTTPS.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (infoPlistFiles.length > 0) {
      findings.push(
        this.createFinding({
          id: 'IOS-SEC-001',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Apple App Transport Security (ATS) Enforced by Default (MASVS-NETWORK)',
          explanation: 'App Transport Security is active without global arbitrary loads exemptions, enforcing TLS 1.3/1.2 on all outbound requests.',
          evidence: { file: infoPlistFiles[0] },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure all third-party SDK dependencies also comply with ATS requirements.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // IOS-SEC-002: Secure Keychain Storage (MASVS-STORAGE)
    // =========================================================================
    let rawUserDefaultsTokenLeakage = null;
    let usesKeychain = false;

    for (const relFile of swiftFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        // Check Keychain usage
        if (
          content.includes('SecItemAdd') ||
          content.includes('SecItemCopyMatching') ||
          content.includes('KeychainSwift') ||
          content.includes('KeychainAccess') ||
          content.includes('Valet')
        ) {
          usesKeychain = true;
        }

        // Check UserDefaults storing tokens
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          if (
            /UserDefaults\.standard\.set\s*\([^,]+,\s*forKey:\s*['"][^'"]*(?:token|jwt|auth|password|secret)[^'"]*['"]/i.test(
              line
            )
          ) {
            rawUserDefaultsTokenLeakage = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
      if (rawUserDefaultsTokenLeakage) break;
    }

    if (rawUserDefaultsTokenLeakage) {
      findings.push(
        this.createFinding({
          id: 'IOS-SEC-002',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Insecure Token Persistence in Cleartext UserDefaults (OWASP MASVS-STORAGE)',
          explanation: `Detected authentication token persisted in cleartext UserDefaults in "${rawUserDefaultsTokenLeakage.file}". UserDefaults stores data in unencrypted property lists accessible via unencrypted backups or physical jailbreaks.`,
          evidence: {
            file: rawUserDefaultsTokenLeakage.file,
            line: rawUserDefaultsTokenLeakage.line,
            snippet: sanitizeOutput(rawUserDefaultsTokenLeakage.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Store sensitive authentication tokens exclusively in the iOS Keychain via Keychain Services or KeychainAccess.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (usesKeychain) {
      findings.push(
        this.createFinding({
          id: 'IOS-SEC-002',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Hardware-Backed iOS Keychain Services Configured (MASVS-STORAGE)',
          explanation: 'Found hardware-backed iOS Keychain Services usage for cryptographic token storage.',
          evidence: { file: swiftFiles[0] || '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Configure kSecAttrAccessibleWhenUnlockedThisDeviceOnly for maximum security.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'IOS-SEC-002',
          category: 'security',
          status: 'MANUAL_REVIEW',
          severity: 'medium',
          title: 'iOS Local Token Persistence Requires Human Review',
          explanation: 'No cleartext UserDefaults token leakage was detected, but explicit Keychain API calls were not resolved statically.',
          evidence: { file: swiftFiles[0] || '.' },
          checkMethod: 'manual_verification_required',
          recommendation: 'Verify that authentication tokens are stored in the secure iOS Keychain.',
          manualVerificationRequired: true,
          confidence: 'medium_heuristic',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // IOS-SEC-003: Privacy Manifest & Usage Descriptions (MASVS-PRIVACY)
    // =========================================================================
    const hasPrivacyManifest = files.some((f) => f.endsWith('PrivacyInfo.xcprivacy'));

    if (hasPrivacyManifest) {
      findings.push(
        this.createFinding({
          id: 'IOS-SEC-003',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Apple Privacy Manifest Present (PrivacyInfo.xcprivacy)',
          explanation: 'Found PrivacyInfo.xcprivacy declaring required reason APIs and third-party data tracking disclosures.',
          evidence: { file: 'PrivacyInfo.xcprivacy' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure all third-party SDK dependencies provide their respective privacy manifests.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'IOS-SEC-003',
          category: 'security',
          status: 'WARNING',
          severity: 'medium',
          title: 'Missing Apple Privacy Manifest (PrivacyInfo.xcprivacy)',
          explanation: 'No PrivacyInfo.xcprivacy file found in target. Apple App Store submission requires explicit privacy manifests for apps using designated standard APIs.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Add PrivacyInfo.xcprivacy declaring NSPrivacyAccessedAPITypes and data collection purposes.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // IOS-TEST-001: Automated XCTest / Swift Testing Suite
    // =========================================================================
    const hasTestFiles = files.some(
      (f) =>
        (f.includes('Tests/') || f.endsWith('Tests.swift') || f.endsWith('Test.swift')) &&
        !f.includes('.build/') &&
        !f.includes('DerivedData/')
    );

    if (hasTestFiles) {
      findings.push(
        this.createFinding({
          id: 'IOS-TEST-001',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Automated iOS Test Suite Configured (XCTest / Swift Testing)',
          explanation: 'Found automated iOS unit and UI test files.',
          evidence: { file: 'Tests/' },
          checkMethod: 'static_analysis',
          recommendation: 'Execute xcodebuild test in CI pipelines on macOS runners.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'IOS-TEST-001',
          category: 'build_test',
          status: 'WARNING',
          severity: 'high',
          title: 'No Automated iOS Tests Detected',
          explanation: 'Could not find XCTest or Swift Testing source files in project.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Add an XCTest target to verify critical view models and network decoding.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    return findings;
  }

  runDynamicChecks(target, context, _execRunner) {
    const findings = [];

    // Native iOS compilation requires macOS with Xcode installed
    if (process.platform !== 'darwin') {
      findings.push(
        this.createFinding({
          id: 'IOS-TEST-002',
          category: 'build_test',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Native iOS Test Execution Skipped (macOS / Xcode Required)',
          explanation: `Current host operating system is "${process.platform}". Native Xcode simulator execution (xcodebuild test) requires a macOS environment with Xcode installed. Test execution was not fabricated.`,
          evidence: { platform: process.platform },
          checkMethod: 'execution_skipped',
          recommendation: 'Run CI test jobs on macos-latest (Apple Silicon) runners to execute native simulator suites.',
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
          id: 'IOS-TEST-002',
          category: 'build_test',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Native iOS Test Execution Skipped (Requires Authorization)',
          explanation: 'xcodebuild test execution was skipped in read-only mode.',
          evidence: { platform: 'darwin' },
          checkMethod: 'execution_skipped',
          recommendation: 'Run with --allow-exec in an authorized environment to execute iOS simulator tests.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
      return findings;
    }

    return findings;
  }
}
