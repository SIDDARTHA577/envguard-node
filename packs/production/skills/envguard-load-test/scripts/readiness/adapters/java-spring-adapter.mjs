import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base-adapter.mjs';
import { TOOL_VERSION, sanitizeOutput } from '../constants.mjs';

/**
 * Platform Adapter for Java & Spring Boot Applications (Maven & Gradle).
 * Performs evidence-based static and executable production readiness assessments.
 */
export class JavaSpringBootAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'java-spring',
      name: 'Java & Spring Boot Readiness Adapter',
      version: TOOL_VERSION,
      description: 'Assesses Java applications using Spring Boot, Maven, Gradle, Spring Security, and JPA/Hibernate.',
      supportedLanguages: ['java', 'kotlin'],
      supportedFrameworks: ['spring-boot', 'spring-web', 'spring-data-jpa', 'spring-security'],
      requiredTools: ['java', 'mvn', 'gradle'],
    });
  }

  /**
   * Detects whether the target application is a Java or Spring Boot project.
   */
  detect(target, context) {
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const hasPomXml = fs.existsSync(path.join(targetDir, 'pom.xml'));
    const hasBuildGradle =
      fs.existsSync(path.join(targetDir, 'build.gradle')) ||
      fs.existsSync(path.join(targetDir, 'build.gradle.kts'));
    const hasSettingsGradle =
      fs.existsSync(path.join(targetDir, 'settings.gradle')) ||
      fs.existsSync(path.join(targetDir, 'settings.gradle.kts'));

    const hasJavaFiles = files.some(
      (f) =>
        (f.endsWith('.java') || f.endsWith('.kt')) &&
        !f.includes('.gradle/') &&
        !f.includes('build/') &&
        !f.includes('target/')
    );

    if (!hasPomXml && !hasBuildGradle && !hasSettingsGradle && !hasJavaFiles) {
      return {
        matched: false,
        confidence: 0,
        reason: 'No Java build descriptors (pom.xml, build.gradle) or Java source files detected.',
      };
    }

    // Determine if Spring Boot is in use
    let isSpringBoot = false;
    let buildTool = 'unknown';

    if (hasPomXml) {
      buildTool = 'maven';
      try {
        const pomContent = fs.readFileSync(path.join(targetDir, 'pom.xml'), 'utf8');
        if (pomContent.includes('spring-boot')) {
          isSpringBoot = true;
        }
      } catch { /* ignore non-critical read/parse error */ }
    } else if (hasBuildGradle) {
      buildTool = 'gradle';
      try {
        const gradlePath = fs.existsSync(path.join(targetDir, 'build.gradle.kts'))
          ? path.join(targetDir, 'build.gradle.kts')
          : path.join(targetDir, 'build.gradle');
        const gradleContent = fs.readFileSync(gradlePath, 'utf8');
        if (gradleContent.includes('spring-boot') || gradleContent.includes('org.springframework.boot')) {
          isSpringBoot = true;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    // Also check for @SpringBootApplication annotation in Java source files
    if (!isSpringBoot) {
      for (const relFile of files) {
        if (relFile.endsWith('.java') || relFile.endsWith('.kt')) {
          try {
            const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
            if (content.includes('@SpringBootApplication')) {
              isSpringBoot = true;
              break;
            }
          } catch { /* ignore non-critical read/parse error */ }
        }
      }
    }

    return {
      matched: true,
      confidence: isSpringBoot ? 1.0 : 0.8,
      reason: isSpringBoot
        ? `Detected Spring Boot application using ${buildTool}.`
        : `Detected Java application using ${buildTool}.`,
      metadata: {
        buildTool,
        isSpringBoot,
      },
    };
  }

  getCapabilities() {
    return [
      'java_discovery',
      'spring_actuator_security',
      'spring_security_rules',
      'password_encoding',
      'jpa_ddl_auto_safety',
      'database_migrations_flyway_liquibase',
      'java_sql_injection',
      'java_test_suite',
      'java_packaging',
    ];
  }

  getApplicableChecks(_target, _context) {
    return [
      { id: 'JAVA-DISC-001', name: 'Java Build Tool & Descriptor Present', category: 'discovery', required: true },
      { id: 'JAVA-DISC-002', name: 'Explicit Java Version Target Declared', category: 'discovery', required: true },
      { id: 'JAVA-DISC-003', name: 'Build Wrapper Script Present (mvnw or gradlew)', category: 'discovery', required: false },
      { id: 'SPRING-SEC-001', name: 'Spring Actuator Exposure & Endpoint Security', category: 'security', required: true },
      { id: 'SPRING-SEC-002', name: 'Spring Security Authentication & Route Guardrails', category: 'security', required: true },
      { id: 'SPRING-SEC-003', name: 'Secure Password Encoder Configuration', category: 'security', required: true },
      { id: 'SPRING-SEC-004', name: 'Sensitive Configuration Properties & Secret Safety', category: 'env', required: true },
      { id: 'SPRING-DB-001', name: 'JPA/Hibernate DDL Auto Production Guard', category: 'database', required: true },
      { id: 'SPRING-DB-002', name: 'Database Migration Framework Configured (Flyway/Liquibase)', category: 'database', required: false },
      { id: 'SPRING-DB-003', name: 'SQL Injection Defenses & Typed JPA Queries', category: 'database', required: true },
      { id: 'JAVA-TEST-001', name: 'Automated Java Test Suite Configured', category: 'build_test', required: true },
      { id: 'JAVA-DEPLOY-001', name: 'Executable JAR Packaging or Containerfile Configured', category: 'deployment', required: false },
    ];
  }

  getLimitations() {
    return [
      'Static analysis scans declared application properties and configuration classes; runtime profiles (spring.profiles.active) in external config servers cannot be statically resolved.',
      'JPA DDL auto validation inspects declared default and profile property files; command-line JVM overrides (-Dspring.jpa.hibernate.ddl-auto) take precedence at launch.',
      'Spring Security authorization check parses SecurityFilterChain beans; method-level @PreAuthorize expressions require comprehensive AST inspection.',
    ];
  }

  runStaticChecks(target, context) {
    const findings = [];
    const projectDir = context.projectDir;
    const targetDir = target.absPath || projectDir;
    const files = context.files || [];

    const javaFiles = files.filter(
      (f) =>
        (f.endsWith('.java') || f.endsWith('.kt')) &&
        !f.includes('build/') &&
        !f.includes('target/') &&
        !f.includes('.gradle/')
    );

    // =========================================================================
    // JAVA-DISC-001: Build Tool & Descriptor Present
    // =========================================================================
    const hasPom = fs.existsSync(path.join(targetDir, 'pom.xml'));
    const hasGradle =
      fs.existsSync(path.join(targetDir, 'build.gradle')) ||
      fs.existsSync(path.join(targetDir, 'build.gradle.kts'));

    if (hasPom || hasGradle) {
      const buildFile = hasPom ? 'pom.xml' : 'build.gradle';
      findings.push(
        this.createFinding({
          id: 'JAVA-DISC-001',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Java Build Descriptor Detected',
          explanation: `Found build descriptor "${buildFile}" (${hasPom ? 'Maven' : 'Gradle'}).`,
          evidence: { file: buildFile },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure all dependencies declare explicit versions or rely on managed dependency management.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'JAVA-DISC-001',
          category: 'discovery',
          status: 'FAIL',
          severity: 'high',
          title: 'Missing Java Build Descriptor (pom.xml or build.gradle)',
          explanation: 'Java source files exist, but neither pom.xml nor build.gradle build descriptor was detected.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Add pom.xml or build.gradle to standardize build and dependency resolution.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // JAVA-DISC-002: Explicit Java Version Target Declared
    // =========================================================================
    let declaredJavaVersion = null;
    let javaVersionEvidence = null;

    if (hasPom) {
      try {
        const pom = fs.readFileSync(path.join(targetDir, 'pom.xml'), 'utf8');
        const match =
          pom.match(/<java\.version>([^<]+)<\/java\.version>/) ||
          pom.match(/<maven\.compiler\.target>([^<]+)<\/maven\.compiler\.target>/) ||
          pom.match(/<maven\.compiler\.release>([^<]+)<\/maven\.compiler\.release>/);
        if (match) {
          declaredJavaVersion = match[1].trim();
          javaVersionEvidence = 'pom.xml';
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (!declaredJavaVersion && hasGradle) {
      try {
        const gradlePath = fs.existsSync(path.join(targetDir, 'build.gradle.kts'))
          ? path.join(targetDir, 'build.gradle.kts')
          : path.join(targetDir, 'build.gradle');
        const gradle = fs.readFileSync(gradlePath, 'utf8');
        const match =
          gradle.match(/sourceCompatibility\s*=\s*['"]?([0-9.]+)['"]?/) ||
          gradle.match(/targetCompatibility\s*=\s*['"]?([0-9.]+)['"]?/) ||
          gradle.match(/languageVersion\.set\(JavaLanguageVersion\.of\(([0-9]+)\)\)/);
        if (match) {
          declaredJavaVersion = match[1].trim();
          javaVersionEvidence = path.basename(gradlePath);
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (declaredJavaVersion) {
      findings.push(
        this.createFinding({
          id: 'JAVA-DISC-002',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Explicit Java Version Target Declared',
          explanation: `Target Java version declared as "${declaredJavaVersion}" in ${javaVersionEvidence}.`,
          evidence: { file: javaVersionEvidence },
          checkMethod: 'static_analysis',
          recommendation: 'Target modern LTS runtimes (Java 21 or 25) for performance and long-term support.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'JAVA-DISC-002',
          category: 'discovery',
          status: 'WARNING',
          severity: 'medium',
          title: 'Undeclared Java Version Target',
          explanation: 'Build descriptor does not declare an explicit Java compiler version target.',
          evidence: { file: hasPom ? 'pom.xml' : 'build.gradle' },
          checkMethod: 'static_analysis',
          recommendation: 'Specify <java.version>21</java.version> in pom.xml to prevent builds on incompatible JDKs.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // JAVA-DISC-003: Build Wrapper Script Present
    // =========================================================================
    const hasMvnw =
      fs.existsSync(path.join(targetDir, 'mvnw')) ||
      fs.existsSync(path.join(targetDir, 'mvnw.cmd'));
    const hasGradlew =
      fs.existsSync(path.join(targetDir, 'gradlew')) ||
      fs.existsSync(path.join(targetDir, 'gradlew.bat'));

    if (hasMvnw || hasGradlew) {
      const wrapperScript = hasMvnw ? 'mvnw' : 'gradlew';
      findings.push(
        this.createFinding({
          id: 'JAVA-DISC-003',
          category: 'discovery',
          status: 'PASS',
          severity: 'info',
          title: 'Build Tool Wrapper Script Present',
          explanation: `Found "${wrapperScript}" ensuring identical build tool versions across developer machines and CI.`,
          evidence: { file: wrapperScript },
          checkMethod: 'static_analysis',
          recommendation: 'Execute builds via wrapper script (./mvnw or ./gradlew) in continuous integration.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'JAVA-DISC-003',
          category: 'discovery',
          status: 'WARNING',
          severity: 'low',
          title: 'Missing Build Tool Wrapper Script (mvnw or gradlew)',
          explanation: 'No build wrapper (mvnw or gradlew) found in project root.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Run "mvn wrapper:wrapper" or "gradle wrapper" to commit standard wrapper scripts.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // Search application properties and configuration files
    // =========================================================================
    const propertyFiles = files.filter(
      (f) =>
        (f.endsWith('application.properties') ||
          f.endsWith('application.yml') ||
          f.endsWith('application.yaml') ||
          f.includes('application-prod.') ||
          f.includes('application-production.')) &&
        !f.includes('target/') &&
        !f.includes('build/')
    );

    let combinedProperties = '';
    for (const propFile of propertyFiles) {
      try {
        combinedProperties += '\n' + fs.readFileSync(path.join(projectDir, propFile), 'utf8');
      } catch { /* ignore non-critical read/parse error */ }
    }

    // =========================================================================
    // SPRING-SEC-001: Spring Actuator Exposure & Endpoint Security
    // =========================================================================
    let wildcardActuator = null;
    let safeActuatorConfig = false;

    for (const propFile of propertyFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, propFile), 'utf8');
        if (
          /management\.endpoints\.web\.exposure\.include\s*[:=]\s*['"]?\*['"]?/.test(content) ||
          /exposure:\s*\n\s*include:\s*['"]?\*['"]?/.test(content)
        ) {
          wildcardActuator = { file: propFile };
          break;
        }
        if (
          /management\.endpoints\.web\.exposure\.include\s*[:=]\s*['"]?(?:health|info|metrics)(?:,\s*(?:health|info|metrics))*['"]?/.test(content) ||
          /exposure:\s*\n\s*include:\s*['"]?(?:health|info|metrics)['"]?/.test(content)
        ) {
          safeActuatorConfig = true;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (wildcardActuator) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-001',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Wildcard Spring Actuator Exposure Detected (include: *)',
          explanation: `Actuator endpoints are configured with wildcard exposure (include: "*") in "${wildcardActuator.file}". This exposes sensitive diagnostic endpoints (/actuator/env, /actuator/heapdump, /actuator/beans) containing environment secrets and memory dumps.`,
          evidence: { file: wildcardActuator.file },
          checkMethod: 'static_analysis',
          recommendation: 'Restrict Actuator exposure to essential endpoints: management.endpoints.web.exposure.include=health,info.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (safeActuatorConfig) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-001',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Spring Actuator Endpoints Appropriately Restricted',
          explanation: 'Actuator web exposure is restricted to non-sensitive endpoints (health, info).',
          evidence: { file: propertyFiles[0] || 'application.properties' },
          checkMethod: 'static_analysis',
          recommendation: 'Ensure actuator health details (show-details) are restricted to authenticated roles in production.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (propertyFiles.length > 0) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-001',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Default Actuator Exposure Enforced (Health & Info Only)',
          explanation: 'No wildcard actuator exposure configured. Spring Boot default exposes only health endpoint over HTTP.',
          evidence: { file: propertyFiles[0] },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain default endpoint exposure or configure explicit authentication for administrative endpoints.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // SPRING-SEC-002: Spring Security Authentication & Route Guardrails
    // =========================================================================
    let hasSpringSecurity = false;
    let hasSecurityFilterChain = false;
    let hasPermissiveAllFilter = false;

    if (hasPom) {
      try {
        const pom = fs.readFileSync(path.join(targetDir, 'pom.xml'), 'utf8');
        if (pom.includes('spring-boot-starter-security')) hasSpringSecurity = true;
      } catch { /* ignore non-critical read/parse error */ }
    } else if (hasGradle) {
      try {
        const gradlePath = fs.existsSync(path.join(targetDir, 'build.gradle.kts'))
          ? path.join(targetDir, 'build.gradle.kts')
          : path.join(targetDir, 'build.gradle');
        const gradle = fs.readFileSync(gradlePath, 'utf8');
        if (gradle.includes('spring-boot-starter-security')) hasSpringSecurity = true;
      } catch { /* ignore non-critical read/parse error */ }
    }

    for (const relFile of javaFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        if (content.includes('SecurityFilterChain')) {
          hasSecurityFilterChain = true;
          // Check for anyRequest().permitAll()
          if (/anyRequest\s*\(\s*\)\s*\.permitAll\s*\(\s*\)/.test(content)) {
            hasPermissiveAllFilter = true;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (hasPermissiveAllFilter) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-002',
          category: 'security',
          status: 'FAIL',
          severity: 'high',
          title: 'Permissive Spring Security FilterChain (anyRequest.permitAll)',
          explanation: 'SecurityFilterChain is configured with anyRequest().permitAll(), completely bypassing authentication for all application endpoints.',
          evidence: { file: 'src/main/java/' },
          checkMethod: 'static_analysis',
          recommendation: 'Enforce authentication by default: http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated()).',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasSecurityFilterChain) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-002',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Spring Security FilterChain Configured',
          explanation: 'Found SecurityFilterChain bean enforcing authentication rules and CSRF protection.',
          evidence: { file: 'src/main/java/' },
          checkMethod: 'static_analysis',
          recommendation: 'Verify role-based authorization (@PreAuthorize) covers all mutating operations.',
          manualVerificationRequired: false,
          confidence: 'high_heuristic',
          targetPath: target.path,
        })
      );
    } else if (hasSpringSecurity) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-002',
          category: 'security',
          status: 'WARNING',
          severity: 'medium',
          title: 'Spring Security Declared but Custom FilterChain Missing',
          explanation: 'spring-boot-starter-security is declared, but no custom SecurityFilterChain bean was detected. Default HTTP basic auth with generated password will apply.',
          evidence: { file: hasPom ? 'pom.xml' : 'build.gradle' },
          checkMethod: 'static_analysis',
          recommendation: 'Declare a SecurityFilterChain bean to define explicit route authorization rules.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // SPRING-SEC-003: Password Encoding Security
    // =========================================================================
    let noOpPasswordEncoderFinding = null;
    let securePasswordEncoderConfigured = false;

    for (const relFile of javaFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        if (
          content.includes('NoOpPasswordEncoder') ||
          content.includes('NoOpPasswordEncoder.getInstance()')
        ) {
          noOpPasswordEncoderFinding = { file: relFile };
          break;
        }
        if (
          content.includes('BCryptPasswordEncoder') ||
          content.includes('Argon2PasswordEncoder') ||
          content.includes('createDelegatingPasswordEncoder')
        ) {
          securePasswordEncoderConfigured = true;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (noOpPasswordEncoderFinding) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-003',
          category: 'security',
          status: 'FAIL',
          severity: 'critical',
          title: 'Insecure Plaintext Password Encoder (NoOpPasswordEncoder)',
          explanation: `Detected deprecated NoOpPasswordEncoder in "${noOpPasswordEncoderFinding.file}". Passwords will be stored in plaintext without cryptographic hashing.`,
          evidence: { file: noOpPasswordEncoderFinding.file },
          checkMethod: 'static_analysis',
          recommendation: 'Use BCryptPasswordEncoder (strength >= 10) or Argon2PasswordEncoder.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (securePasswordEncoderConfigured) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-003',
          category: 'security',
          status: 'PASS',
          severity: 'info',
          title: 'Cryptographic Password Encoder Configured (BCrypt/Argon2)',
          explanation: 'Application configures adaptive cryptographic password hashing (BCrypt or Argon2).',
          evidence: { file: javaFiles[0] || 'src/main/java/' },
          checkMethod: 'static_analysis',
          recommendation: 'Configure appropriate cost factors (BCrypt 10-12) to resist offline brute force.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // SPRING-SEC-004: Sensitive Configuration Properties & Secret Safety
    // =========================================================================
    let hardcodedDatasourcePassword = null;
    for (const propFile of propertyFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, propFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          // Check spring.datasource.password = plaintext_literal without ${...}
          const match = line.match(/^\s*spring\.datasource\.password\s*[:=]\s*([^${}\s]+)\s*$/);
          if (match && match[1] && match[1] !== '' && !match[1].startsWith('$')) {
            hardcodedDatasourcePassword = {
              file: propFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
      if (hardcodedDatasourcePassword) break;
    }

    if (hardcodedDatasourcePassword) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-004',
          category: 'env',
          status: 'FAIL',
          severity: 'critical',
          title: 'Hardcoded Database Password in Spring Properties',
          explanation: `Detected hardcoded plaintext database password in "${hardcodedDatasourcePassword.file}".`,
          evidence: {
            file: hardcodedDatasourcePassword.file,
            line: hardcodedDatasourcePassword.line,
            snippet: sanitizeOutput(hardcodedDatasourcePassword.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Load datasource credentials from environment variables: spring.datasource.password=${DB_PASSWORD}.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (propertyFiles.length > 0) {
      findings.push(
        this.createFinding({
          id: 'SPRING-SEC-004',
          category: 'env',
          status: 'PASS',
          severity: 'info',
          title: 'Spring Secrets Externalized via Environment Variables',
          explanation: 'No plaintext datasource passwords detected in Spring configuration files.',
          evidence: { file: propertyFiles[0] },
          checkMethod: 'static_analysis',
          recommendation: 'Inject production secrets using Kubernetes secrets or cloud secret managers.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // SPRING-DB-001: JPA / Hibernate DDL Auto Production Guard
    // =========================================================================
    let dangerousDdlAuto = null;
    let safeDdlAuto = false;

    for (const propFile of propertyFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, propFile), 'utf8');
        // Match create, create-drop, update
        const ddlMatch = content.match(
          /(?:spring\.jpa\.hibernate\.ddl-auto|hibernate\.hbm2ddl\.auto|ddl-auto)\s*[:=]\s*['"]?(create|create-drop|update)['"]?/i
        );
        if (ddlMatch) {
          dangerousDdlAuto = { file: propFile, mode: ddlMatch[1] };
          break;
        }
        if (
          /(?:spring\.jpa\.hibernate\.ddl-auto|hibernate\.hbm2ddl\.auto|ddl-auto)\s*[:=]\s*['"]?(validate|none)['"]?/i.test(
            content
          )
        ) {
          safeDdlAuto = true;
        }
      } catch { /* ignore non-critical read/parse error */ }
    }

    if (dangerousDdlAuto) {
      findings.push(
        this.createFinding({
          id: 'SPRING-DB-001',
          category: 'database',
          status: 'FAIL',
          severity: 'critical',
          title: `Dangerous JPA ddl-auto Mode (${dangerousDdlAuto.mode}) in Configuration`,
          explanation: `Hibernate ddl-auto is set to "${dangerousDdlAuto.mode}" in "${dangerousDdlAuto.file}". In production, "create" and "create-drop" destroy existing tables on boot, and "update" can perform non-reversible schema alterations.`,
          evidence: { file: dangerousDdlAuto.file },
          checkMethod: 'static_analysis',
          recommendation: 'Set spring.jpa.hibernate.ddl-auto=validate (or none) in production and manage schema via Flyway or Liquibase.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (safeDdlAuto) {
      findings.push(
        this.createFinding({
          id: 'SPRING-DB-001',
          category: 'database',
          status: 'PASS',
          severity: 'info',
          title: 'Safe JPA ddl-auto Mode Configured (validate/none)',
          explanation: 'Hibernate schema auto-generation is set to validate or none, preventing automated table destruction.',
          evidence: { file: propertyFiles[0] || 'application.properties' },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain ddl-auto=validate across all production deployments.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // SPRING-DB-002: Database Migrations (Flyway / Liquibase)
    // =========================================================================
    const hasFlyway =
      files.some((f) => f.includes('db/migration') && f.endsWith('.sql')) ||
      combinedProperties.includes('spring.flyway') ||
      (hasPom && fs.readFileSync(path.join(targetDir, 'pom.xml'), 'utf8').includes('flyway'));

    const hasLiquibase =
      files.some((f) => f.includes('db/changelog')) ||
      combinedProperties.includes('spring.liquibase') ||
      (hasPom && fs.readFileSync(path.join(targetDir, 'pom.xml'), 'utf8').includes('liquibase'));

    if (hasFlyway) {
      findings.push(
        this.createFinding({
          id: 'SPRING-DB-002',
          category: 'database',
          status: 'PASS',
          severity: 'info',
          title: 'Flyway Database Migrations Configured',
          explanation: 'Found Flyway migration scripts in db/migration or Flyway dependency configuration.',
          evidence: { file: 'src/main/resources/db/migration' },
          checkMethod: 'static_analysis',
          recommendation: 'Validate migration checksums and test upgrade/rollback scripts in staging.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasLiquibase) {
      findings.push(
        this.createFinding({
          id: 'SPRING-DB-002',
          category: 'database',
          status: 'PASS',
          severity: 'info',
          title: 'Liquibase Database Change Logs Configured',
          explanation: 'Found Liquibase change logs in db/changelog or Liquibase dependency configuration.',
          evidence: { file: 'src/main/resources/db/changelog' },
          checkMethod: 'static_analysis',
          recommendation: 'Use formatted SQL or YAML changeSets with preconditions.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // SPRING-DB-003: SQL Injection Defenses & Typed JPA Queries
    // =========================================================================
    let rawSqlInjectionFinding = null;
    let hasJpaQueries = false;

    for (const relFile of javaFiles) {
      try {
        const content = fs.readFileSync(path.join(projectDir, relFile), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          // Check raw string concatenation in createNativeQuery or createQuery
          if (
            /(?:createNativeQuery|createQuery|jdbcTemplate\.query)\s*\(\s*["'].*?["']\s*\+/.test(
              line
            )
          ) {
            rawSqlInjectionFinding = {
              file: relFile,
              line: lineIdx + 1,
              snippet: line.trim(),
            };
            break;
          }
          if (
            content.includes('JpaRepository') ||
            content.includes('CrudRepository') ||
            content.includes('@Query')
          ) {
            hasJpaQueries = true;
          }
        }
      } catch { /* ignore non-critical read/parse error */ }
      if (rawSqlInjectionFinding) break;
    }

    if (rawSqlInjectionFinding) {
      findings.push(
        this.createFinding({
          id: 'SPRING-DB-003',
          category: 'database',
          status: 'FAIL',
          severity: 'critical',
          title: 'Potential SQL Injection via Java String Concatenation',
          explanation: `Detected raw database query constructed using string concatenation in "${rawSqlInjectionFinding.file}". Client-supplied input can alter query semantics.`,
          evidence: {
            file: rawSqlInjectionFinding.file,
            line: rawSqlInjectionFinding.line,
            snippet: sanitizeOutput(rawSqlInjectionFinding.snippet),
          },
          checkMethod: 'static_analysis',
          recommendation: 'Use named parameters (:param) or positional parameters (?1) with setParameter().',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else if (hasJpaQueries) {
      findings.push(
        this.createFinding({
          id: 'SPRING-DB-003',
          category: 'database',
          status: 'PASS',
          severity: 'info',
          title: 'Parameterized Spring Data JPA Queries Enforced',
          explanation: 'Data access operations utilize type-safe Spring Data JPA repository methods and parameterized queries.',
          evidence: { file: javaFiles[0] || 'src/main/java/' },
          checkMethod: 'static_analysis',
          recommendation: 'Maintain code reviews to prevent string concatenation in custom @Query annotations.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // JAVA-TEST-001: Automated Test Suite Configured
    // =========================================================================
    const hasTestDir =
      fs.existsSync(path.join(targetDir, 'src', 'test', 'java')) ||
      files.some((f) => f.includes('src/test/') && (f.endsWith('.java') || f.endsWith('.kt')));

    if (hasTestDir) {
      findings.push(
        this.createFinding({
          id: 'JAVA-TEST-001',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: 'Automated Java Test Suite Configured (JUnit 5)',
          explanation: 'Found automated Java test files in src/test/java/.',
          evidence: { file: 'src/test/java/' },
          checkMethod: 'static_analysis',
          recommendation: 'Enforce Jacoco code coverage thresholds (>= 80%) in CI.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'JAVA-TEST-001',
          category: 'build_test',
          status: 'WARNING',
          severity: 'high',
          title: 'No Automated Java Tests Detected',
          explanation: 'Could not find a src/test/java directory or automated test files.',
          evidence: { file: '.' },
          checkMethod: 'static_analysis',
          recommendation: 'Add unit tests using JUnit 5 and Spring Boot Test (@SpringBootTest).',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    // =========================================================================
    // JAVA-DEPLOY-001: Packaging & Executable JAR Configuration
    // =========================================================================
    const hasSpringBootPlugin =
      (hasPom && fs.readFileSync(path.join(targetDir, 'pom.xml'), 'utf8').includes('spring-boot-maven-plugin')) ||
      (hasGradle && fs.existsSync(path.join(targetDir, 'build.gradle')) && fs.readFileSync(path.join(targetDir, 'build.gradle'), 'utf8').includes('org.springframework.boot'));

    if (hasSpringBootPlugin) {
      findings.push(
        this.createFinding({
          id: 'JAVA-DEPLOY-001',
          category: 'deployment',
          status: 'PASS',
          severity: 'info',
          title: 'Executable Spring Boot Fat-JAR Packaging Configured',
          explanation: 'Found spring-boot-maven-plugin producing self-contained executable JARs with embedded servlet containers.',
          evidence: { file: hasPom ? 'pom.xml' : 'build.gradle' },
          checkMethod: 'static_analysis',
          recommendation: 'Use multi-stage Dockerfiles with eclipse-temurin or Amazon Corretto base images.',
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

    if (!context.allowExec) {
      findings.push(
        this.createFinding({
          id: 'JAVA-EXEC-001',
          category: 'build_test',
          status: 'NOT_RUN',
          severity: 'info',
          title: 'Java Test Suite Execution Skipped (Read-Only Mode)',
          explanation: 'Executable verification requires explicit execution authorization (--allow-exec).',
          evidence: { file: '.' },
          checkMethod: 'command_execution',
          recommendation: 'Run assessment with --allow-exec to execute build and test goals.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
      return findings;
    }

    // Run Maven or Gradle test if authorized
    const hasPom = fs.existsSync(path.join(targetDir, 'pom.xml'));
    const command = hasPom ? 'mvn' : 'gradle';
    const args = hasPom ? ['test', '-B'] : ['test'];

    const result = execRunner({
      command,
      args,
      cwd: targetDir,
      context,
    });

    if (result.exitCode === 0) {
      findings.push(
        this.createFinding({
          id: 'JAVA-EXEC-002',
          category: 'build_test',
          status: 'PASS',
          severity: 'info',
          title: `Java Test Suite Passed (${command})`,
          explanation: `Automated test execution completed successfully with exit code 0.`,
          evidence: {
            command: `${command} ${args.join(' ')}`,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
          },
          checkMethod: 'command_execution',
          recommendation: 'Maintain continuous integration testing on every pull request.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    } else {
      findings.push(
        this.createFinding({
          id: 'JAVA-EXEC-002',
          category: 'build_test',
          status: 'FAIL',
          severity: 'high',
          title: `Java Test Suite Failed (${command})`,
          explanation: `Java test execution failed with exit code ${result.exitCode}. Output: ${sanitizeOutput(result.stderr || result.stdout)}`,
          evidence: {
            command: `${command} ${args.join(' ')}`,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
          },
          checkMethod: 'command_execution',
          recommendation: 'Investigate and resolve test failures before production deployment.',
          manualVerificationRequired: false,
          confidence: 'verified_fact',
          targetPath: target.path,
        })
      );
    }

    return findings;
  }
}

