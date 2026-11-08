---
name: envguard-mobile-readiness
description: Guides comprehensive, evidence-based mobile application readiness assessments for React Native, Expo, Flutter, Native Android (Kotlin/Java), and Native iOS (Swift) aligned with OWASP MASVS v2.0 standards.
---

# `envguard-mobile-readiness` Skill

Guides engineers and AI coding agents through rigorous, evidence-based mobile application readiness audits. Inspects mobile client architecture, security boundaries, storage encryption, permissions, privacy declarations, network configurations, release hardening, and automated testing across React Native/Expo, Flutter/Dart, Native Android, and Native iOS projects. Maps all security findings to OWASP Mobile Application Security Verification Standard (MASVS v2.0) controls and enforces transparent, non-fabricated verification.

## When to Trigger
- Auditing a mobile application (React Native, Expo, Flutter, Android Native, iOS Native) prior to App Store or Google Play release.
- Verifying mobile security posture against OWASP MASVS v2.0 (Storage, Network, Platform, Code, Privacy).
- Assessing full-stack monorepos containing mobile clients, backend APIs, and shared packages.
- Running the standalone EnvGuard Readiness Auditor with dedicated mobile adapters on mobile targets.
- Evaluating deep link security, WebView origin restrictions, keystore credentials, and iOS privacy manifests.

## When NOT to Trigger
- Auditing web-only applications or backend microservices with no mobile clients (use `envguard-production-readiness` or `envguard-backend`).
- Auditing pure database migration scripts or relational schema designs (use `envguard-database`).
- Designing cloud system architectures before mobile client code exists (use `envguard-system-design`).
- Setting up initial Node.js environment variable schemas (use `envguard-setup`).

## Supported Projects & Environments
- **React Native & Expo**: React Native (>=0.70), Expo SDK (>=48), JavaScript, TypeScript.
- **Flutter & Dart**: Flutter SDK (>=3.0), Dart SDK (sound null safety >=3.0 <4.0).
- **Native Android**: Kotlin, Java, Gradle build system (`build.gradle`, `build.gradle.kts`), Android SDK (targetSdk >= 33 recommended).
- **Native iOS**: Swift, Objective-C, Xcode projects (`.xcodeproj`, `.xcworkspace`), Swift Package Manager (`Package.swift`), iOS deployment targets (>= 15.0).
- **Host Platforms**: Linux, macOS, Windows (native macOS builds/tests transparently evaluated as `NOT_RUN` with prerequisite guidance when running on non-macOS hosts).

## Required Tools & Permissions
- **Tools**: `read_file`, `write_file`, `run_command`.
- **Permissions**:
  - Workspace read-only permissions by default for static analysis and architecture discovery.
  - Workspace write permissions when generating markdown/JSON audit reports or creating remediation pull requests.
  - Explicit execution authorization (`--allow-exec --trust-project`) required before running any mobile build or test tool (`npm test`, `flutter test`, `./gradlew test`).
- **Safety Boundaries**: Native release keystores, signing certificates, and private provisioning profiles must never be read, decrypted, or exported.

## Expected Inputs
- `projectDir`: Path to the mobile project root or monorepo root.
- `allowExec`: Boolean flag to permit running local tests or linters (default `false`).
- `trustProject`: Explicit acknowledgment to execute project scripts (default `false`).
- `format`: Report output format: `markdown`, `json`, or `both` (default `both`).
- `outputDir`: Directory to write generated reports (e.g., `.envguard/reports/`).

## Step-by-Step Workflow

### Stage 1: Identify Mobile Platform & Inventory
1. Scan project roots and monorepo workspaces using `tools/readiness-auditor.mjs` discovery engine.
2. Detect mobile signals:
   - React Native / Expo: `package.json` with `react-native` or `expo`, `app.json`, `eas.json`.
   - Flutter: `pubspec.yaml`, `pubspec.lock`, `lib/main.dart`.
   - Android Native: `AndroidManifest.xml`, `build.gradle`, `build.gradle.kts`, `src/main/`.
   - iOS Native: `Package.swift`, `*.xcodeproj`, `*.xcworkspace`, `Info.plist`.
3. In monorepos, classify mobile client apps as `type: 'mobile'` and distinguish them from backend APIs or shared libraries.

### Stage 2: Select Applicable Adapters & Standardized Checks
1. Activate matching adapters: `ReactNativeAdapter`, `FlutterAdapter`, `AndroidAdapter`, `IosAdapter`.
2. Map applicable checks aligned with OWASP MASVS v2.0:
   - **MASVS-STORAGE**: Secure credential storage (EncryptedSharedPreferences, iOS Keychain, `expo-secure-store`, `flutter_secure_storage`) vs cleartext storage (raw `AsyncStorage`, `UserDefaults`, `SharedPreferences`).
   - **MASVS-NETWORK**: Transport security, cleartext traffic guards (`android:usesCleartextTraffic="false"`, ATS `NSAllowsArbitraryLoads = false`), SSL pinning.
   - **MASVS-PLATFORM**: Unprotected exported Android components (`android:exported="true"` without permission), deep link intent-filters, custom URL schemes.
   - **MASVS-CODE**: Code shrinking & minification (R8/ProGuard `minifyEnabled true`), hardcoded signing credentials in build files, sensitive logging in production.
   - **MASVS-PRIVACY**: Apple Privacy Manifest (`PrivacyInfo.xcprivacy`), Android runtime permissions, iOS privacy usage descriptions.

### Stage 3: Perform Static Evidence Assessment
1. Parse manifest and configuration files without executing code.
2. Read source code for token persistence patterns, deep link handlers, and WebView configurations.
3. Check for presence of required test suites and linting configurations.

### Stage 4: Native Tooling Discovery & Guarded Execution
1. Inspect host environment for native tool availability (`adb`, `java`, `flutter`, `dart`, `gradle`, `xcodebuild`).
2. If tool is absent or platform is unsupported (e.g., `xcodebuild` on Windows/Linux), report test status as `NOT_RUN` with clear prerequisite guidance. Never fabricate execution outcomes.
3. If `--allow-exec` and `--trust-project` are provided and tools exist, execute mobile tests under strict subprocess timeouts (10s default).

### Stage 5: Compile Report & Remediation Plan
1. Generate machine-readable JSON and human-readable Markdown reports.
2. Evaluate release policy gates (blockers on any critical failure).
3. If cross-platform, backend, or database issues are identified in full-stack monorepos, hand off to complementary EnvGuard skills (`envguard-backend`, `envguard-database`, `envguard-api-design`).

## Validation Steps
1. Verify mobile project discovery correctly identifies all mobile targets.
2. Verify adapter evaluation produces deterministic findings matching evidence.
3. Verify release policy gates correctly identify critical MASVS blockers.
4. Verify non-macOS hosts report iOS compilation/tests as `NOT_RUN` rather than false errors or fabricated passes.
5. Verify test outputs and findings redact all sensitive secrets and tokens.

## Expected Outputs
1. **JSON Report** (`readiness-report.json`): Structured report conforming to `catalog/readiness-report.schema.json` v1.1.0 with findings, platform adapters, policy evaluation, and summary counts.
2. **Markdown Report** (`readiness-report.md`): Executive summary, mobile stack breakdown, OWASP MASVS compliance matrix, prioritized remediation actions (P0/P1/P2), and scope boundaries.
3. **Actionable Remediation Guidance**: Concrete code patches for insecure storage, manifest hardening, and privacy manifest generation.

## Failure Handling
- **Missing Build Tools**: Report dynamic check as `NOT_RUN` with actionable installation instructions; never fail static verification due to missing external compilers.
- **Corrupted Manifests**: Emit syntax parsing error finding with file line reference; continue auditing remaining modules.
- **Critical Policy Blockers**: Halt automated release promotion, output all blocking findings with high/critical severity, and provide exact remediation diffs.

## Safety & Privacy Boundaries
- **No Keystore Extraction**: The skill must never access, dump, or copy keystores (`.jks`, `.keystore`, `.p12`) or export signing private keys.
- **No Untrusted Dynamic Execution**: Never execute arbitrary Gradle or CocoaPods hooks without user authorization.
- **Secret Redaction**: All tokens, API keys, and sensitive URLs in findings evidence are automatically redacted using `sanitizeOutput()`.

## Example User Prompts
- "Audit our React Native Expo application for mobile production readiness and check for OWASP MASVS compliance."
- "Review our Flutter repository to ensure secure local token storage and proper state controller resource disposal."
- "Perform an Android native readiness audit on our Gradle app and check for unprotected exported components and cleartext traffic."
- "Check our iOS codebase for App Transport Security compliance, Keychain usage, and Apple Privacy Manifest completeness."
- "Run a complete readiness audit on our full-stack mobile monorepo (Expo client + Express API) with envguard-mobile-readiness."
