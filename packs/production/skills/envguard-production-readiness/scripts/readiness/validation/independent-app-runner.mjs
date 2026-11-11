import fs from 'node:fs';
import path from 'node:path';
import { buildInventoryGraph, runReadinessAudit } from '../engine/index.mjs';
import { createDefaultRegistry } from '../adapters/registry.mjs';
import { formulateAssessmentPlan } from '../engine/planner.mjs';
import { collectProjectFiles, TEST_VERIFICATION_STATES } from '../constants.mjs';
import { validateReportSchema } from '../reporters/comparator.mjs';
import { discoverTestFramework } from '../remediation/patch-generator.mjs';
import { REMEDIATION_STATUSES, executeRemediationWorkflow } from '../remediation/remediation-runner.mjs';
import { restoreCheckpoint } from '../remediation/checkpoint-manager.mjs';

/**
 * 13 representative application archetypes verified against independent projects outside envguard-node.
 */
export const INDEPENDENT_APP_MATRIX = [
  {
    id: 'react-vite',
    name: 'React + Vite Web SPA',
    category: 'frontend',
    expectedAdapter: 'nextjs-react',
    supportsNodeDynamicExec: true,
    expectedSeededDefects: ['ENV-001', 'ENV-002'],
  },
  {
    id: 'nextjs',
    name: 'Next.js App Router Full-Stack Web App',
    category: 'fullstack',
    expectedAdapter: 'nextjs-react',
    supportsNodeDynamicExec: true,
    expectedSeededDefects: ['ENV-001', 'ENV-002'],
  },
  {
    id: 'node-express',
    name: 'Node.js Express REST API',
    category: 'backend',
    expectedAdapter: 'node-typescript',
    supportsNodeDynamicExec: true,
    expectedSeededDefects: ['ENV-001', 'ENV-002'],
  },
  {
    id: 'node-mongodb',
    name: 'Node.js API with MongoDB & Mongoose',
    category: 'backend',
    expectedAdapter: 'node-typescript',
    supportsNodeDynamicExec: true,
    expectedSeededDefects: ['ENV-001', 'ENV-002', 'DB-002'],
  },
  {
    id: 'node-postgresql',
    name: 'Node.js API with PostgreSQL & Migrations',
    category: 'backend',
    expectedAdapter: 'node-typescript',
    supportsNodeDynamicExec: true,
    expectedSeededDefects: ['ENV-001', 'ENV-002', 'DB-002'],
  },
  {
    id: 'django',
    name: 'Python Django Web Application',
    category: 'backend',
    expectedAdapter: 'python',
    supportsNodeDynamicExec: false,
    expectedSeededDefects: ['ENV-002'],
  },
  {
    id: 'fastapi',
    name: 'Python FastAPI Microservice',
    category: 'backend',
    expectedAdapter: 'python',
    supportsNodeDynamicExec: false,
    expectedSeededDefects: ['ENV-002'],
  },
  {
    id: 'spring-boot',
    name: 'Java Spring Boot Service (Maven)',
    category: 'backend',
    expectedAdapter: 'java-spring',
    supportsNodeDynamicExec: false,
    expectedSeededDefects: ['ENV-002'],
  },
  {
    id: 'react-native-expo',
    name: 'React Native + Expo Mobile Application',
    category: 'mobile',
    expectedAdapter: 'react-native',
    supportsNodeDynamicExec: true,
    expectedSeededDefects: ['ENV-002'],
  },
  {
    id: 'flutter',
    name: 'Flutter & Dart Mobile Application',
    category: 'mobile',
    expectedAdapter: 'flutter',
    supportsNodeDynamicExec: false,
    expectedSeededDefects: ['ENV-002'],
  },
  {
    id: 'android-kotlin',
    name: 'Native Android Kotlin Application',
    category: 'mobile',
    expectedAdapter: 'android',
    supportsNodeDynamicExec: false,
    expectedSeededDefects: ['ENV-002'],
  },
  {
    id: 'ios-swift',
    name: 'Native iOS Swift Application',
    category: 'mobile',
    expectedAdapter: 'ios',
    supportsNodeDynamicExec: false,
    expectedSeededDefects: ['ENV-002'],
  },
  {
    id: 'fullstack-monorepo',
    name: 'Multi-Service Full-Stack Monorepo',
    category: 'monorepo',
    expectedAdapter: 'node-typescript',
    supportsNodeDynamicExec: true,
    expectedSeededDefects: ['ENV-001', 'ENV-002'],
  },
];

function writeFileEnsureDir(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createRealNodeTestFile(targetDir, moduleRelPath, assertionCode) {
  writeFileEnsureDir(
    path.join(targetDir, 'tests', 'app.test.mjs'),
    `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${assertionCode.exportName} } from '../${moduleRelPath}';\n\ntest('${assertionCode.title}', () => {\n  ${assertionCode.body}\n});\n`
  );
}

/**
 * Generates an independent, self-contained application project outside envguard-node
 * with real source modules, runnable tests (where Node runtime executes natively),
 * and controllable seeded defects for verifying false-positive/false-negative accuracy.
 *
 * @param {string} appId - One of INDEPENDENT_APP_MATRIX[].id
 * @param {string} targetDir - Clean destination directory
 * @param {object} [options={}]
 * @param {boolean} [options.seededDefects=true] - Include realistic defects (missing .gitignore / .env.example)
 */
export function buildIndependentAppFixture(appId, targetDir, { seededDefects = true } = {}) {
  fs.mkdirSync(targetDir, { recursive: true });

  switch (appId) {
    case 'react-vite': {
      writeFileEnsureDir(
        path.join(targetDir, 'package.json'),
        JSON.stringify(
          {
            name: 'independent-react-vite-spa',
            version: '1.0.0',
            type: 'module',
            engines: { node: '>=22.0.0' },
            scripts: {
              build: 'node --check src/App.mjs',
              test: 'node --test',
            },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: { vite: '^5.4.0' },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(path.join(targetDir, 'vite.config.js'), 'export default { build: { outDir: "dist" } };\n');
      writeFileEnsureDir(
        path.join(targetDir, 'src', 'App.mjs'),
        'export function formatGreeting(name) {\n  return `Hello, ${name}`;\n}\n'
      );
      writeFileEnsureDir(
        path.join(targetDir, 'src', 'App.tsx'),
        'export function App() { return <main aria-label="Home"><h1>App</h1></main>; }\n'
      );
      createRealNodeTestFile(targetDir, 'src/App.mjs', {
        exportName: 'formatGreeting',
        title: 'formats SPA greeting safely',
        body: 'assert.equal(formatGreeting("Engineer"), "Hello, Engineer");',
      });
      break;
    }

    case 'nextjs': {
      writeFileEnsureDir(
        path.join(targetDir, 'package.json'),
        JSON.stringify(
          {
            name: 'independent-nextjs-app',
            version: '1.0.0',
            type: 'module',
            engines: { node: '>=22.0.0' },
            scripts: {
              build: 'node --check lib/config.mjs',
              test: 'node --test',
            },
            dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1' },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(path.join(targetDir, 'next.config.js'), 'module.exports = { reactStrictMode: true };\n');
      writeFileEnsureDir(path.join(targetDir, 'app', 'page.tsx'), 'export default function Page() { return <main><h1>Next</h1></main>; }\n');
      writeFileEnsureDir(
        path.join(targetDir, 'lib', 'config.mjs'),
        'export function getPublicEndpoint() {\n  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";\n}\n'
      );
      createRealNodeTestFile(targetDir, 'lib/config.mjs', {
        exportName: 'getPublicEndpoint',
        title: 'resolves fallback public API endpoint safely',
        body: 'assert.equal(getPublicEndpoint(), "http://localhost:3000");',
      });
      break;
    }

    case 'node-express': {
      writeFileEnsureDir(
        path.join(targetDir, 'package.json'),
        JSON.stringify(
          {
            name: 'independent-express-api',
            version: '1.0.0',
            type: 'module',
            engines: { node: '>=22.0.0' },
            scripts: {
              build: 'node --check src/server.mjs',
              test: 'node --test',
            },
            dependencies: { express: '^4.21.0', helmet: '^8.0.0' },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(
        path.join(targetDir, 'src', 'server.mjs'),
        [
          'export function createHealthPayload() {',
          '  return { status: "ok", port: Number(process.env.PORT || 3000) };',
          '}',
          'process.on("SIGTERM", () => process.exit(0));',
          '',
        ].join('\n')
      );
      createRealNodeTestFile(targetDir, 'src/server.mjs', {
        exportName: 'createHealthPayload',
        title: 'returns healthy API payload structure',
        body: 'const res = createHealthPayload();\n  assert.equal(res.status, "ok");\n  assert.equal(res.port, 3000);',
      });
      break;
    }

    case 'node-mongodb': {
      writeFileEnsureDir(
        path.join(targetDir, 'package.json'),
        JSON.stringify(
          {
            name: 'independent-node-mongodb-api',
            version: '1.0.0',
            type: 'module',
            engines: { node: '>=22.0.0' },
            scripts: {
              build: 'node --check src/repo.mjs',
              test: 'node --test',
            },
            dependencies: { express: '^4.21.0', mongoose: '^8.4.0' },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(
        path.join(targetDir, 'src', 'repo.mjs'),
        [
          'const mongoUri = process.env.MONGODB_URI;',
          'export function clampPagination(limit) {',
          '  return Math.min(Math.max(Number(limit) || 20, 1), 100);',
          '}',
          'export function buildUserSchemaDefinition() {',
          '  return { uriConfigured: Boolean(mongoUri), email: { type: String, index: true, unique: true } };',
          '}',
          '',
        ].join('\n')
      );
      createRealNodeTestFile(targetDir, 'src/repo.mjs', {
        exportName: 'clampPagination',
        title: 'enforces strict pagination cap on MongoDB queries',
        body: 'assert.equal(clampPagination(5000), 100);\n  assert.equal(clampPagination(-5), 1);',
      });
      break;
    }

    case 'node-postgresql': {
      writeFileEnsureDir(
        path.join(targetDir, 'package.json'),
        JSON.stringify(
          {
            name: 'independent-node-postgres-api',
            version: '1.0.0',
            type: 'module',
            engines: { node: '>=22.0.0' },
            scripts: {
              build: 'node --check src/db.mjs',
              test: 'node --test',
            },
            dependencies: { express: '^4.21.0', pg: '^8.12.0' },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(
        path.join(targetDir, 'migrations', '001_init.sql'),
        '-- UP\nCREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE);\n'
      );
      if (!seededDefects) {
        writeFileEnsureDir(
          path.join(targetDir, 'migrations', '001_init.down.sql'),
          '-- DOWN\nDROP TABLE IF EXISTS users;\n'
        );
      }
      writeFileEnsureDir(
        path.join(targetDir, 'src', 'db.mjs'),
        [
          'export function buildParameterizedLookup(email) {',
          '  const dbUrl = process.env.DATABASE_URL;',
          '  return { configured: Boolean(dbUrl), text: "SELECT id, email FROM users WHERE email = $1 LIMIT 1", values: [email] };',
          '}',
          '',
        ].join('\n')
      );
      createRealNodeTestFile(targetDir, 'src/db.mjs', {
        exportName: 'buildParameterizedLookup',
        title: 'uses parameterized $1 PostgreSQL placeholders safely',
        body: 'const q = buildParameterizedLookup("dev@example.com");\n  assert.ok(q.text.includes("$1"));\n  assert.deepEqual(q.values, ["dev@example.com"]);',
      });
      break;
    }

    case 'django': {
      writeFileEnsureDir(path.join(targetDir, 'manage.py'), 'import os, sys\nprint(os.environ.get("DJANGO_SETTINGS_MODULE", "app.settings"))\n');
      writeFileEnsureDir(path.join(targetDir, 'requirements.txt'), 'Django==5.0.6\npsycopg[binary]==3.1.18\ngunicorn==22.0.0\n');
      writeFileEnsureDir(
        path.join(targetDir, 'mysite', 'settings.py'),
        [
          'import os',
          'DEBUG = os.environ.get("DEBUG", "False") == "True"',
          'SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")',
          'ALLOWED_HOSTS = ["localhost", "127.0.0.1"]',
          "MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.middleware.csrf.CsrfViewMiddleware']",
          '',
        ].join('\n')
      );
      writeFileEnsureDir(
        path.join(targetDir, 'tests', 'test_views.py'),
        'def test_health_status():\n    assert 200 == 200\n'
      );
      break;
    }

    case 'fastapi': {
      writeFileEnsureDir(path.join(targetDir, 'requirements.txt'), 'fastapi==0.111.0\nuvicorn==0.30.0\npydantic==2.7.0\n');
      writeFileEnsureDir(
        path.join(targetDir, 'main.py'),
        'import os\nfrom fastapi import FastAPI\napp = FastAPI()\n@app.get("/health")\ndef health():\n    return {"status": "ok", "env": os.environ.get("APP_ENV", "dev")}\n'
      );
      writeFileEnsureDir(
        path.join(targetDir, 'tests', 'test_api.py'),
        'def test_fastapi_contract():\n    assert True\n'
      );
      break;
    }

    case 'spring-boot': {
      writeFileEnsureDir(
        path.join(targetDir, 'pom.xml'),
        '<project><modelVersion>4.0.0</modelVersion><groupId>com.example</groupId><artifactId>demo</artifactId><version>0.0.1</version><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.2.5</version></parent></project>\n'
      );
      writeFileEnsureDir(
        path.join(targetDir, 'src', 'main', 'resources', 'application.yml'),
        'spring:\n  datasource:\n    url: ${DATABASE_URL}\n'
      );
      writeFileEnsureDir(
        path.join(targetDir, 'src', 'test', 'java', 'AppTests.java'),
        'class AppTests { void contextLoads() {} }\n'
      );
      break;
    }

    case 'react-native-expo': {
      writeFileEnsureDir(
        path.join(targetDir, 'package.json'),
        JSON.stringify(
          {
            name: 'independent-expo-app',
            version: '1.0.0',
            type: 'module',
            engines: { node: '>=22.0.0' },
            scripts: {
              build: 'node --check src/session.mjs',
              test: 'node --test',
            },
            dependencies: { expo: '^51.0.0', react: '^18.2.0', 'react-native': '^0.74.0', 'expo-secure-store': '^13.0.0' },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(
        path.join(targetDir, 'app.json'),
        JSON.stringify({ expo: { name: 'IndependentExpo', slug: 'ind-expo', scheme: 'indexpo' } }, null, 2)
      );
      writeFileEnsureDir(
        path.join(targetDir, 'src', 'session.mjs'),
        'export function getApiEndpoint() {\n  return process.env.EXPO_PUBLIC_API_URL || "https://api.example.com";\n}\n'
      );
      createRealNodeTestFile(targetDir, 'src/session.mjs', {
        exportName: 'getApiEndpoint',
        title: 'resolves HTTPS mobile endpoint cleanly',
        body: 'assert.ok(getApiEndpoint().startsWith("https://"));',
      });
      break;
    }

    case 'flutter': {
      writeFileEnsureDir(
        path.join(targetDir, 'pubspec.yaml'),
        'name: independent_flutter_app\ndependencies:\n  flutter:\n    sdk: flutter\n  flutter_secure_storage: ^9.0.0\n'
      );
      writeFileEnsureDir(path.join(targetDir, 'lib', 'main.dart'), 'void main() {}\n');
      writeFileEnsureDir(path.join(targetDir, 'test', 'widget_test.dart'), 'void main() {}\n');
      break;
    }

    case 'android-kotlin': {
      writeFileEnsureDir(
        path.join(targetDir, 'build.gradle.kts'),
        'plugins { id("com.android.application") }\nandroid { compileSdk = 34\n defaultConfig { minSdk = 24\n targetSdk = 34 } }\n'
      );
      writeFileEnsureDir(
        path.join(targetDir, 'app', 'src', 'main', 'AndroidManifest.xml'),
        '<manifest package="com.example.independent"><application android:allowBackup="false"></application></manifest>\n'
      );
      writeFileEnsureDir(path.join(targetDir, 'app', 'src', 'main', 'kotlin', 'MainActivity.kt'), 'package com.example.independent\nclass MainActivity {}\n');
      break;
    }

    case 'ios-swift': {
      writeFileEnsureDir(
        path.join(targetDir, 'Package.swift'),
        '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "IndependentIosApp", targets: [.target(name: "App"), .testTarget(name: "AppTests")])\n'
      );
      writeFileEnsureDir(path.join(targetDir, 'Info.plist'), '<plist><dict><key>CFBundleName</key><string>IndependentIos</string></dict></plist>\n');
      writeFileEnsureDir(path.join(targetDir, 'PrivacyInfo.xcprivacy'), '<plist><dict><key>NSPrivacyTracking</key><false/></dict></plist>\n');
      writeFileEnsureDir(path.join(targetDir, 'Tests', 'AppTests.swift'), 'import XCTest\nfinal class AppTests: XCTestCase {}\n');
      break;
    }

    case 'fullstack-monorepo': {
      writeFileEnsureDir(
        path.join(targetDir, 'package.json'),
        JSON.stringify(
          {
            name: 'independent-monorepo',
            private: true,
            version: '1.0.0',
            type: 'module',
            engines: { node: '>=22.0.0' },
            scripts: {
              build: 'node --check apps/api/index.mjs',
              test: 'node --test',
            },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(path.join(targetDir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
      writeFileEnsureDir(
        path.join(targetDir, 'apps', 'web', 'package.json'),
        JSON.stringify(
          {
            name: '@mono/web',
            type: 'module',
            scripts: {
              build: 'node --check src/index.mjs',
              test: 'node --test',
            },
            dependencies: { react: '^18.3.1' },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(
        path.join(targetDir, 'apps', 'web', 'src', 'index.mjs'),
        'export function getWebTitle() { return "MonoWeb"; }\n'
      );
      createRealNodeTestFile(path.join(targetDir, 'apps', 'web'), 'src/index.mjs', {
        exportName: 'getWebTitle',
        title: 'renders monorepo web title',
        body: 'assert.equal(getWebTitle(), "MonoWeb");',
      });
      writeFileEnsureDir(
        path.join(targetDir, 'apps', 'api', 'package.json'),
        JSON.stringify(
          {
            name: '@mono/api',
            type: 'module',
            scripts: {
              build: 'node --check index.mjs',
              test: 'node --test',
            },
            dependencies: { express: '^4.21.0' },
          },
          null,
          2
        )
      );
      writeFileEnsureDir(
        path.join(targetDir, 'apps', 'api', 'index.mjs'),
        'export function getServiceName() { return process.env.SERVICE_NAME || "api-gateway"; }\n'
      );
      createRealNodeTestFile(path.join(targetDir, 'apps', 'api'), 'index.mjs', {
        exportName: 'getServiceName',
        title: 'resolves monorepo API service name',
        body: 'assert.equal(getServiceName(), "api-gateway");',
      });
      break;
    }

    default:
      throw new Error(`Unknown independent app matrix ID: "${appId}".`);
  }

  if (!seededDefects) {
    writeFileEnsureDir(path.join(targetDir, '.env.example'), 'PORT=3000\nNODE_ENV=development\n');
    writeFileEnsureDir(
      path.join(targetDir, '.gitignore'),
      '.env\n.env.*\n!.env.example\nnode_modules/\ndist/\n.envguard/backups/\n.envguard/checkpoints/\n.envguard/reports/\n.envguard/cache/\n'
    );
  }
}

/**
 * Executes the complete end-to-end verification lifecycle on an independent disposable project.
 * Captures discovery accuracy, true positives, false negatives on seeded defects,
 * dynamic test execution evidence, remediation proposals, comparative verification,
 * rollback validation, and clean skill installation/uninstallation.
 *
 * @param {object} appSpec - Entry from INDEPENDENT_APP_MATRIX
 * @param {string} workDir - Ephemeral isolated workspace directory
 * @param {object} [options={}]
 * @param {object|null} [options.skillManager=null] - Optional { installSkills, uninstallSkills } hooks
 * @param {string|null} [options.repoRoot=null] - Canonical EnvGuard repo root for skill manager
 * @returns {object} Detailed empirical measurement record
 */
export function runIndependentAppVerification(appSpec, workDir, { skillManager = null, repoRoot = null } = {}) {
  const projectDir = path.join(workDir, appSpec.id);
  const reportsDir = path.join(workDir, `${appSpec.id}-reports`);

  buildIndependentAppFixture(appSpec.id, projectDir, { seededDefects: true });

  // 1. Optional Skill Installation & Verification
  let skillInstallVerified = null;
  let skillUninstallVerified = null;

  if (skillManager && typeof skillManager.installSkills === 'function') {
    const installRes = skillManager.installSkills({
      packName: 'core',
      destDir: projectDir,
      targetHost: 'codex',
      repoRoot: repoRoot || undefined,
    });
    const metadataExists = fs.existsSync(path.join(projectDir, '.envguard-skills.json'));
    skillInstallVerified = Boolean(installRes?.success && metadataExists);
  }

  // 2. Architecture Discovery & Adapter Resolution
  const inventory = buildInventoryGraph(projectDir);
  const files = collectProjectFiles(projectDir);
  const registry = createDefaultRegistry();
  const rootApp = inventory.applications[0] || { path: '.', absPath: projectDir, manifest: null };
  const resolvedAdapters = registry.resolveAdaptersForTarget(rootApp, { projectDir, files, inventory });
  const detectedAdapterIds = inventory.applications.flatMap((a) =>
    registry.resolveAdaptersForTarget(a, { projectDir, files, inventory }).map((m) => m.adapter.id)
  );
  const expectedAdapterMatched = detectedAdapterIds.includes(appSpec.expectedAdapter);

  // 3. Assessment Plan Formulation
  const plan = formulateAssessmentPlan({
    projectDir,
    inventory,
    files,
    allowExec: false,
  });

  // 4. Read-Only Initial Audit
  const readOnlyReport = runReadinessAudit({
    projectDir,
    allowExec: false,
    outputDir: reportsDir,
    format: 'both',
  });
  const schemaValid = validateReportSchema(readOnlyReport);
  const reportsWritten =
    fs.existsSync(path.join(reportsDir, 'readiness-report.json')) &&
    fs.existsSync(path.join(reportsDir, 'readiness-report.md'));

  // 5. Framework Discovery & Authorized Dynamic Test Execution
  let pkg = {};
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      /* ignore */
    }
  }
  const testDiscovery = discoverTestFramework(projectDir, pkg, files);

  const dynamicReport = runReadinessAudit({
    projectDir,
    allowExec: true,
    trustProject: true,
  });

  const buildTestFindings = dynamicReport.findings.filter((f) => f.id === 'BUILD-002');
  const iosDynamicFinding = dynamicReport.findings.find((f) => f.id === 'IOS-TEST-002');
  const dbDriverPassed = dynamicReport.findings.some((f) => f.id === 'DB-001' && f.status === 'PASS');
  const dynamicTestsExecutedAndPassed = Boolean(
    buildTestFindings.length > 0 &&
      buildTestFindings.every(
        (f) =>
          f.status === 'PASS' &&
          f.evidence?.verificationState === TEST_VERIFICATION_STATES.TESTS_PASSED &&
          f.evidence?.testExecuted === true
      )
  );

  // 6. Seeded Defect Sensitivity (True Positives & False Negatives)
  const failedOrWarnIds = new Set(
    readOnlyReport.findings.filter((f) => f.status === 'FAIL' || f.status === 'WARNING').map((f) => f.id)
  );
  const detectedSeeded = appSpec.expectedSeededDefects.filter((id) => failedOrWarnIds.has(id));
  const missedSeeded = appSpec.expectedSeededDefects.filter((id) => !failedOrWarnIds.has(id));

  // 7. Reviewable Remediation -> Apply -> Retest -> Rollback Verification
  const dryRun = executeRemediationWorkflow({ projectDir, applyFix: false });
  const preRemediateEnvExisted = fs.existsSync(path.join(projectDir, '.env.example'));
  const preRemediateGitignoreExisted = fs.existsSync(path.join(projectDir, '.gitignore'));

  let remediationApplied = false;
  let comparisonImproved = false;
  let rollbackVerified = false;

  if (dryRun.status === REMEDIATION_STATUSES.PROPOSED_PENDING_APPROVAL) {
    const applied = executeRemediationWorkflow({
      projectDir,
      applyFix: true,
      allowExec: appSpec.supportsNodeDynamicExec,
      trustProject: appSpec.supportsNodeDynamicExec,
    });

    remediationApplied = applied.status === REMEDIATION_STATUSES.REMEDIATED_AND_VERIFIED;
    comparisonImproved = Boolean(applied.comparison?.statusTransition?.improved);

    if (applied.checkpoint) {
      const rollbackRes = restoreCheckpoint(applied.checkpoint, { projectDir });
      rollbackVerified =
        rollbackRes.restored === true &&
        fs.existsSync(path.join(projectDir, '.env.example')) === preRemediateEnvExisted &&
        fs.existsSync(path.join(projectDir, '.gitignore')) === preRemediateGitignoreExisted;
    }
  }

  // 8. Uninstall Skills Cleanly
  if (skillManager && typeof skillManager.uninstallSkills === 'function' && skillInstallVerified) {
    const unRes = skillManager.uninstallSkills({
      packName: 'core',
      destDir: projectDir,
      repoRoot: repoRoot || undefined,
    });
    skillUninstallVerified = Boolean(unRes?.success);
  }

  return {
    appId: appSpec.id,
    name: appSpec.name,
    category: appSpec.category,
    detectedArchitecture: inventory.repository.isMonorepo
      ? 'monorepo'
      : inventory.applications[0]?.type || 'unknown',
    detectedAdapterIds: Array.from(new Set(detectedAdapterIds)),
    primaryAdapterResolvedCount: resolvedAdapters.length,
    expectedAdapterMatched,
    planPhaseCount:
      plan?.phases && typeof plan.phases === 'object' && !Array.isArray(plan.phases)
        ? Object.keys(plan.phases).length
        : Array.isArray(plan?.phases)
          ? plan.phases.length
          : 0,
    schemaValid,
    reportsWritten,
    testDiscovery,
    dbDriverPassed,
    supportsNodeDynamicExec: appSpec.supportsNodeDynamicExec,
    dynamicTestsExecutedAndPassed,
    iosDynamicStatusOnCurrentHost: iosDynamicFinding?.status || null,
    seededDefectsExpected: appSpec.expectedSeededDefects.length,
    truePositives: detectedSeeded.length,
    falseNegatives: missedSeeded.length,
    missedDefectIds: missedSeeded,
    dryRunPatchCount: dryRun.patches?.length || 0,
    remediationApplied,
    comparisonImproved,
    rollbackVerified,
    skillInstallVerified,
    skillUninstallVerified,
    readOnlySummary: readOnlyReport.summary,
  };
}
