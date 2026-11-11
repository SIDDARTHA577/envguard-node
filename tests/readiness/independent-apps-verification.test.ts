import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INDEPENDENT_APP_MATRIX,
  buildIndependentAppFixture,
  runIndependentAppVerification,
} from '../../tools/readiness/validation/index.mjs';
import { runReadinessAudit } from '../../tools/readiness/engine/index.mjs';
import { TEST_VERIFICATION_STATES } from '../../tools/readiness/constants.mjs';
import { installSkills, uninstallSkills } from '../../tools/skill-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

interface FindingLike {
  id: string;
  status: string;
  severity?: string;
  title?: string;
  evidence?: {
    verificationState?: string;
    testExecuted?: boolean;
  };
}

interface VerificationSummary {
  totalChecks?: number;
  pass?: number;
  fail?: number;
  warning?: number;
  notRun?: number;
  error?: number;
}

interface IndependentVerificationResult {
  appId: string;
  name: string;
  category: string;
  detectedArchitecture: string;
  detectedAdapterIds: string[];
  expectedAdapterMatched: boolean;
  planPhaseCount: number;
  schemaValid: boolean;
  reportsWritten: boolean;
  dbDriverPassed: boolean;
  supportsNodeDynamicExec: boolean;
  dynamicTestsExecutedAndPassed: boolean;
  iosDynamicStatusOnCurrentHost: string | null;
  seededDefectsExpected: number;
  truePositives: number;
  falseNegatives: number;
  missedDefectIds: string[];
  dryRunPatchCount: number;
  remediationApplied: boolean;
  comparisonImproved: boolean;
  rollbackVerified: boolean;
  skillInstallVerified: boolean | null;
  skillUninstallVerified: boolean | null;
  readOnlySummary: VerificationSummary;
}

describe('Phase 15: Independent Full-Stack, API, DB & Mobile App Verification', () => {
  const tempDirs: string[] = [];

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('defines all 13 required representative application archetypes', () => {
    expect(INDEPENDENT_APP_MATRIX).toHaveLength(13);
    const ids = new Set(INDEPENDENT_APP_MATRIX.map((app) => app.id));
    expect(ids).toEqual(
      new Set([
        'react-vite',
        'nextjs',
        'node-express',
        'node-mongodb',
        'node-postgresql',
        'django',
        'fastapi',
        'spring-boot',
        'react-native-expo',
        'flutter',
        'android-kotlin',
        'ios-swift',
        'fullstack-monorepo',
      ])
    );
  });

  it.each(INDEPENDENT_APP_MATRIX)(
    'verifies end-to-end audit, skill lifecycle, test execution, remediation, and rollback on $id',
    (appSpec) => {
      const workDir = createTempDir(`envguard-p15-${appSpec.id}-`);
      const result = runIndependentAppVerification(appSpec, workDir, {
        skillManager: { installSkills, uninstallSkills },
        repoRoot: REPO_ROOT,
      }) as IndependentVerificationResult;

      expect(result.skillInstallVerified).toBe(true);
      expect(result.skillUninstallVerified).toBe(true);
      expect(result.expectedAdapterMatched).toBe(true);
      expect(result.planPhaseCount).toBe(5);
      expect(result.schemaValid).toBe(true);
      expect(result.reportsWritten).toBe(true);
      expect(result.readOnlySummary.error).toBe(0);

      expect(result.falseNegatives).toBe(0);
      expect(result.missedDefectIds).toEqual([]);
      expect(result.truePositives).toBe(appSpec.expectedSeededDefects.length);

      if (appSpec.supportsNodeDynamicExec) {
        expect(result.dynamicTestsExecutedAndPassed).toBe(true);
      } else {
        expect(result.dynamicTestsExecutedAndPassed).toBe(false);
      }

      if (appSpec.id === 'node-mongodb' || appSpec.id === 'node-postgresql') {
        expect(result.dbDriverPassed).toBe(true);
      }

      if (appSpec.id === 'ios-swift' && process.platform !== 'darwin') {
        expect(result.iosDynamicStatusOnCurrentHost).toBe('NOT_RUN');
      }

      expect(result.dryRunPatchCount).toBeGreaterThan(0);
      expect(result.remediationApplied).toBe(true);
      expect(result.comparisonImproved).toBe(true);
      expect(result.rollbackVerified).toBe(true);
    },
    30000
  );

  it('produces zero false-positive FAILs on a cleanly configured node-postgresql project with reversible migrations', () => {
    const workDir = createTempDir('envguard-p15-clean-pg-');
    buildIndependentAppFixture('node-postgresql', workDir, { seededDefects: false });

    const report = runReadinessAudit({
      projectDir: workDir,
      allowExec: true,
      trustProject: true,
    });

    const findings = report.findings as FindingLike[];
    const fails = findings.filter((f) => f.status === 'FAIL');
    expect(fails).toEqual([]);

    const dbDriver = findings.find((f) => f.id === 'DB-001');
    const dbMigrations = findings.find((f) => f.id === 'DB-002');
    const buildTest = findings.find((f) => f.id === 'BUILD-002');

    expect(dbDriver?.status).toBe('PASS');
    expect(dbMigrations?.status).toBe('PASS');
    expect(buildTest?.status).toBe('PASS');
    expect(buildTest?.evidence?.verificationState).toBe(TEST_VERIFICATION_STATES.TESTS_PASSED);
    expect(buildTest?.evidence?.testExecuted).toBe(true);
  });

  it('detects seeded SQL injection in node-postgresql (DB-004) and missing Django CSRF middleware (PY-SEC-005)', () => {
    const pgDir = createTempDir('envguard-p15-sqli-pg-');
    buildIndependentAppFixture('node-postgresql', pgDir, { seededDefects: false });
    fs.writeFileSync(
      path.join(pgDir, 'src', 'db.mjs'),
      'export async function findUnsafe(pool, email) {\n  return pool.query(`SELECT * FROM users WHERE email = \'${email}\'`);\n}\n',
      'utf8'
    );

    const pgReport = runReadinessAudit({ projectDir: pgDir, allowExec: false });
    const db004 = (pgReport.findings as FindingLike[]).find((f) => f.id === 'DB-004');
    expect(db004?.status).toBe('FAIL');
    expect(db004?.severity).toBe('critical');

    const djangoDir = createTempDir('envguard-p15-csrf-django-');
    buildIndependentAppFixture('django', djangoDir, { seededDefects: false });
    fs.writeFileSync(
      path.join(djangoDir, 'mysite', 'settings.py'),
      'SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")\nALLOWED_HOSTS = ["example.com"]\n',
      'utf8'
    );

    const djangoReport = runReadinessAudit({ projectDir: djangoDir, allowExec: false });
    const csrfFinding = (djangoReport.findings as FindingLike[]).find((f) => f.id === 'PY-SEC-005');
    expect(csrfFinding?.status).toBe('FAIL');
  });

  it('installs the packed envguard-node Core tarball into an independent Express+Postgres consumer and executes type-safe validation without secret leakage', () => {
    const packDir = createTempDir('envguard-p15-pack-');
    const consumerDir = createTempDir('envguard-p15-consumer-');

    if (!fs.existsSync(path.join(REPO_ROOT, 'dist', 'index.js'))) {
      execSync('npm run build', { cwd: REPO_ROOT, stdio: 'pipe' });
    }

    const packOutput = execFileSync(
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32'
        ? ['/c', 'npm', 'pack', '--pack-destination', packDir]
        : ['pack', '--pack-destination', packDir],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }
    );
    const tgzName = packOutput
      .trim()
      .split(/\r?\n/)
      .pop()
      ?.trim();
    expect(tgzName).toMatch(/\.tgz$/);
    const tgzPath = path.join(packDir, tgzName as string);
    expect(fs.existsSync(tgzPath)).toBe(true);

    // Install zero-dependency tarball in a standalone consumer package, then overlay Express+Postgres app files
    fs.writeFileSync(
      path.join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'independent-postgres-consumer', version: '1.0.0', type: 'module' }, null, 2),
      'utf8'
    );
    execFileSync(
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32'
        ? ['/c', 'npm', 'install', '--no-audit', '--no-fund', '--offline', tgzPath]
        : ['install', '--no-audit', '--no-fund', '--offline', tgzPath],
      {
        cwd: consumerDir,
        stdio: 'pipe',
      }
    );
    const installedPkg = JSON.parse(fs.readFileSync(path.join(consumerDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    buildIndependentAppFixture('node-postgresql', consumerDir, { seededDefects: false });
    const overlaidPkg = JSON.parse(fs.readFileSync(path.join(consumerDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    overlaidPkg.dependencies = {
      ...(overlaidPkg.dependencies || {}),
      ...(installedPkg.dependencies || {}),
    };
    fs.writeFileSync(path.join(consumerDir, 'package.json'), JSON.stringify(overlaidPkg, null, 2), 'utf8');

    const syntheticSecret = 'pg_secret_dummy_token_99887766';
    fs.writeFileSync(path.join(consumerDir, '.env'), `DATABASE_URL=postgres://user:${syntheticSecret}@localhost:5432/app\n`, 'utf8');
    fs.writeFileSync(
      path.join(consumerDir, 'validate-env.mjs'),
      [
        "import { guard, s } from 'envguard-node';",
        'const mode = process.argv[2];',
        'const schema = { DATABASE_URL: s.string({ min: 10 }), PORT: s.port().default(5432) };',
        'const input = mode === "valid" ? { DATABASE_URL: "postgres://localhost:5432/app", PORT: "8080" } : {};',
        'const res = guard(schema, input);',
        'console.log(JSON.stringify({ success: res.success, port: res.data?.PORT ?? null, errors: res.errors.length }));',
      ].join('\n'),
      'utf8'
    );

    const missingEnvOut = JSON.parse(
      execFileSync('node', ['validate-env.mjs', 'missing'], { cwd: consumerDir, encoding: 'utf8' })
    ) as { success: boolean; port: number | null; errors: number };
    expect(missingEnvOut.success).toBe(false);
    expect(missingEnvOut.errors).toBe(1);

    const validEnvOut = JSON.parse(
      execFileSync('node', ['validate-env.mjs', 'valid'], { cwd: consumerDir, encoding: 'utf8' })
    ) as { success: boolean; port: number | null; errors: number };
    expect(validEnvOut.success).toBe(true);
    expect(validEnvOut.port).toBe(8080);

    const reportDir = createTempDir('envguard-p15-consumer-reports-');
    const consumerReport = runReadinessAudit({
      projectDir: consumerDir,
      allowExec: false,
      outputDir: reportDir,
      format: 'both',
    });

    const jsonText = fs.readFileSync(path.join(reportDir, 'readiness-report.json'), 'utf8');
    const mdText = fs.readFileSync(path.join(reportDir, 'readiness-report.md'), 'utf8');
    expect(jsonText).not.toContain(syntheticSecret);
    expect(mdText).not.toContain(syntheticSecret);

    const env003 = (consumerReport.findings as FindingLike[]).find((f) => f.id === 'ENV-003');
    expect(env003?.status).toBe('PASS');
  }, 30000);
});
