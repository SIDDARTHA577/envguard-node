import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  generateUnifiedDiff,
  discoverEnvVarNames,
  discoverTestFramework,
  generateRemediationPatches,
  assertSafeProjectRelativePath,
  createCheckpoint,
  restoreCheckpoint,
  cleanupCheckpoints,
  REMEDIATION_STATUSES,
  executeRemediationWorkflow,
  main as runAuditorCli,
  EXIT_CODES,
  NodeTypeScriptAdapter,
} from '../../tools/readiness-auditor.mjs';

const rootDir = path.resolve(__dirname, '..', '..');
const fixturesDir = path.join(rootDir, 'tests', 'fixtures', 'readiness');

describe('Phase 11 — Reviewable Fixes & Automated Retesting Workflow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-remediation-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('11.1: Dependency-Free Unified Diff Generation', () => {
    it('generates standard unified diff for new file creation', () => {
      const diff = generateUnifiedDiff('.env.example', null, 'PORT=3000\nNODE_ENV=development\n');
      expect(diff).toContain('--- /dev/null');
      expect(diff).toContain('+++ b/.env.example');
      expect(diff).toContain('@@ -0,0 +1,2 @@');
      expect(diff).toContain('+PORT=3000');
      expect(diff).toContain('+NODE_ENV=development');
    });

    it('generates standard unified diff for file modifications', () => {
      const original = 'node_modules/\ndist/\n';
      const proposed = 'node_modules/\ndist/\n.env\n.env.*\n';

      const diff = generateUnifiedDiff('.gitignore', original, proposed);
      expect(diff).toContain('--- a/.gitignore');
      expect(diff).toContain('+++ b/.gitignore');
      expect(diff).toContain('+.env');
      expect(diff).toContain('+.env.*');
    });
  });

  describe('11.2: Patch Formulation & Variable Discovery', () => {
    it('discovers environment variables from source files', () => {
      fs.writeFileSync(
        path.join(tempDir, 'server.ts'),
        'const port = process.env.PORT || 3000;\nconst db = process.env.DATABASE_URL;\n'
      );

      const vars = discoverEnvVarNames(tempDir, ['server.ts']);
      expect(vars).toContain('PORT');
      expect(vars).toContain('DATABASE_URL');
    });

    it('formulates safe patches for ENV-001 and ENV-002 without destructive edits', () => {
      const mockFindings = [
        {
          id: 'ENV-001',
          status: 'FAIL',
          severity: 'high',
          targetPath: '.',
          title: 'Missing .env.example',
        },
        {
          id: 'ENV-002',
          status: 'FAIL',
          severity: 'critical',
          targetPath: '.',
          title: 'Unignored .env',
        },
      ];

      const patches = generateRemediationPatches(tempDir, mockFindings, []);
      expect(patches.length).toBe(2);

      const envPatch = patches.find((p) => p.findingId === 'ENV-001');
      expect(envPatch).toBeDefined();
      expect(envPatch?.targetFile).toBe('.env.example');
      expect(envPatch?.action).toBe('create');
      expect(envPatch?.proposedContent).toContain('PORT=3000');
      expect(envPatch?.unifiedDiff).toContain('+PORT=3000');

      const gitignorePatch = patches.find((p) => p.findingId === 'ENV-002');
      expect(gitignorePatch).toBeDefined();
      expect(gitignorePatch?.targetFile).toBe('.gitignore');
      expect(gitignorePatch?.proposedContent).toContain('.env');
    });

    it('discovers test runner from package dependencies and configures verified test script', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'vitest-app',
            devDependencies: { vitest: '^2.0.0' },
          },
          null,
          2
        )
      );

      const mockFindings = [
        {
          id: 'BUILD-002',
          status: 'WARNING',
          severity: 'high',
          targetPath: '.',
          title: 'No test script',
        },
      ];

      const patches = generateRemediationPatches(tempDir, mockFindings, ['package.json']);
      expect(patches.length).toBe(1);
      const testPatch = patches[0];
      expect(testPatch.findingId).toBe('BUILD-002');
      expect(testPatch.targetFile).toBe('package.json');
      expect(testPatch.proposedContent).toContain('"test": "vitest run"');
      expect(testPatch.proposedContent).not.toContain('echo "Tests passing"');
    });

    it('never fabricates fake passing test script when no test runner or suite exists', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'untested-app',
            scripts: { test: 'echo "Error: no test specified" && exit 1' },
          },
          null,
          2
        )
      );

      const mockFindings = [
        {
          id: 'BUILD-002',
          status: 'FAIL',
          severity: 'critical',
          targetPath: '.',
          title: 'Failing placeholder test script',
        },
      ];

      // No test framework in deps and no test files
      const patches = generateRemediationPatches(tempDir, mockFindings, ['package.json']);
      expect(patches.length).toBe(0); // Zero fabricated patches!

      const discovery = discoverTestFramework(tempDir, { name: 'untested-app' }, ['package.json']);
      expect(discovery.status).toBe('NOT_RUN');
      expect(discovery.framework).toBeNull();
      expect(discovery.command).toBeNull();
      expect(discovery.recommendation).toContain('No automated test suite detected');
    });

    it('flags ambiguous test configuration when test files exist without runner dependencies', () => {
      const discovery = discoverTestFramework(
        tempDir,
        { name: 'ambiguous-app' },
        ['package.json', 'tests/unit.test.js']
      );
      expect(discovery.status).toBe('MANUAL_REVIEW');
      expect(discovery.confidence).toBe('ambiguous');
      expect(discovery.recommendation).toContain('Manual engineering review required');
    });

    it('flags fabricated or placeholder test script in static adapter analysis', () => {
      const adapter = new NodeTypeScriptAdapter();
      const fakePkg = {
        name: 'fake-test-app',
        scripts: {
          build: 'echo "built"',
          test: 'echo "Tests passing" && exit 0',
        },
      };

      const findings = adapter.runDynamicChecks(
        { path: '.', absPath: tempDir, manifest: fakePkg, type: 'backend', isRoot: true },
        { projectDir: tempDir, allowExec: true, trustProject: true },
        () => ({ success: true, exitCode: 0, durationMs: 10, notRun: false })
      );

      const testCheck = findings.find((f: any) => f.id === 'BUILD-002');
      expect(testCheck).toBeDefined();
      expect(testCheck.status).toBe('WARNING');
      expect(testCheck.title).toContain('Placeholder or Fabricated Test Script');
    });
  });

  describe('11.3: Checkpoint Snapshots & Non-Destructive Rollback', () => {
    it('creates checkpoint and restores pristine state on rollback', () => {
      const existingFile = path.join(tempDir, 'config.json');
      fs.writeFileSync(existingFile, '{"setting": "original"}\n', 'utf8');

      const patches = [
        {
          targetFile: 'config.json',
          action: 'modify',
          proposedContent: '{"setting": "modified"}\n',
        },
        {
          targetFile: 'new-file.txt',
          action: 'create',
          proposedContent: 'brand new file\n',
        },
      ];

      // 1. Create checkpoint
      const checkpoint = createCheckpoint(tempDir, patches);
      expect(checkpoint.checkpointId).toContain('checkpoint-');
      expect(fs.existsSync(checkpoint.backupDir)).toBe(true);

      // 2. Apply modifications to working directory
      fs.writeFileSync(existingFile, '{"setting": "modified"}\n', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'new-file.txt'), 'brand new file\n', 'utf8');

      expect(fs.readFileSync(existingFile, 'utf8')).toContain('modified');
      expect(fs.existsSync(path.join(tempDir, 'new-file.txt'))).toBe(true);

      // 3. Rollback
      const rollback = restoreCheckpoint(checkpoint);
      expect(rollback.restored).toBe(true);
      expect(fs.readFileSync(existingFile, 'utf8')).toContain('original');
      expect(fs.existsSync(path.join(tempDir, 'new-file.txt'))).toBe(false); // Created file was deleted!
    });

    it('enforces path traversal protections and rejects directory escaping paths', () => {
      // Relative path escaping root
      expect(() => {
        assertSafeProjectRelativePath(tempDir, '../outside.txt');
      }).toThrow(/Path traversal rejected/);

      expect(() => {
        assertSafeProjectRelativePath(tempDir, 'sub/../../outside.txt');
      }).toThrow(/Path traversal rejected/);

      // Checkpoint creation rejects escaping target
      const maliciousPatches = [
        {
          targetFile: '../../etc/passwd',
          action: 'modify',
          proposedContent: 'malicious',
        },
      ];

      expect(() => {
        createCheckpoint(tempDir, maliciousPatches);
      }).toThrow(/Path traversal rejected/);
    });

    it('strictly omits raw secret-bearing file contents from checkpoint JSON manifest', () => {
      const secretFile = path.join(tempDir, '.env');
      const sensitiveSecret = 'AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE_SECRET_DATA';
      fs.writeFileSync(secretFile, sensitiveSecret, 'utf8');

      const patches = [
        {
          targetFile: '.env',
          action: 'modify',
          proposedContent: 'AWS_SECRET_ACCESS_KEY=redacted',
        },
      ];

      const checkpoint = createCheckpoint(tempDir, patches);
      const manifestPath = path.join(checkpoint.backupDir, 'checkpoint-manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const rawManifest = fs.readFileSync(manifestPath, 'utf8');
      // Manifest must NOT contain the secret or originalContent string
      expect(rawManifest).not.toContain(sensitiveSecret);
      expect(rawManifest).not.toContain('originalContent');

      // Manifest MUST contain integrity hash and file size
      const parsedManifest = JSON.parse(rawManifest);
      expect(parsedManifest.snapshots[0].originalHash).toBeDefined();
      expect(parsedManifest.snapshots[0].fileSizeBytes).toBeGreaterThan(0);
      expect(parsedManifest.snapshots[0].existed).toBe(true);

      // Restore still works accurately from backup file
      fs.writeFileSync(secretFile, 'corrupted', 'utf8');
      const rollback = restoreCheckpoint(checkpoint);
      expect(rollback.restored).toBe(true);
      expect(fs.readFileSync(secretFile, 'utf8')).toBe(sensitiveSecret);
    });

    it('safely rolls back applied patches after a partial write failure', () => {
      const existingFile = path.join(tempDir, 'valid.txt');
      fs.writeFileSync(existingFile, 'pristine-state\n', 'utf8');

      // First patch modifies valid.txt, second patch points to a path that will fail or traverse
      const patches = [
        {
          targetFile: 'valid.txt',
          action: 'modify',
          proposedContent: 'modified-state\n',
        },
        {
          targetFile: '../invalid-traversal.txt',
          action: 'create',
          proposedContent: 'forbidden',
        },
      ];

      // Executing remediation with invalid traversal patch should throw and not apply partial changes
      expect(() => {
        createCheckpoint(tempDir, patches);
      }).toThrow(/Path traversal rejected/);

      expect(fs.readFileSync(existingFile, 'utf8')).toBe('pristine-state\n');
    });

    it('prunes expired checkpoints while retaining recent snapshots', () => {
      const backupsBase = path.join(tempDir, '.envguard', 'backups');
      fs.mkdirSync(backupsBase, { recursive: true });

      // Create 5 dummy checkpoint directories
      for (let i = 0; i < 5; i++) {
        const cpDir = path.join(backupsBase, `checkpoint-${Date.now()}-${i}`);
        fs.mkdirSync(cpDir, { recursive: true });
        fs.writeFileSync(path.join(cpDir, 'checkpoint-manifest.json'), '{}');
      }

      // Cleanup retaining max 2 checkpoints
      const pruned = cleanupCheckpoints(tempDir, { maxCheckpoints: 2 });
      expect(pruned).toBe(3);

      const remaining = fs.readdirSync(backupsBase);
      expect(remaining.length).toBe(2);
    });
  });

  describe('11.4: Approval Gate & Automated Retesting Workflow', () => {
    it('enforces approval gate in dry-run mode (applyFix: false) and modifies zero files', () => {
      const appDir = path.join(tempDir, 'dry-run-app');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), appDir, { recursive: true });

      const res = executeRemediationWorkflow({
        projectDir: appDir,
        applyFix: false,
      });

      expect(res.status).toBe(REMEDIATION_STATUSES.PROPOSED_PENDING_APPROVAL);
      expect(res.approvalRequired).toBe(true);
      expect(res.applied).toBe(false);
      expect(res.patches.length).toBeGreaterThanOrEqual(2);
      expect(res.diffPreview).toContain('--- /dev/null');
      expect(res.diffPreview).toContain('+++ b/.env.example');

      // Verify zero files were actually written to disk
      expect(fs.existsSync(path.join(appDir, '.env.example'))).toBe(false);
    });

    it('applies patches with approval, reruns audit, and confirms remediation with zero regressions', () => {
      const appDir = path.join(tempDir, 'approved-app');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), appDir, { recursive: true });

      const res = executeRemediationWorkflow({
        projectDir: appDir,
        applyFix: true,
        allowExec: true,
        trustProject: true,
      });

      expect(res.status).toBe(REMEDIATION_STATUSES.REMEDIATED_AND_VERIFIED);
      expect(res.applied).toBe(true);
      expect(res.reverted).toBe(false);
      expect(res.checkpoint).toBeDefined();
      expect(fs.existsSync(path.join(appDir, '.env.example'))).toBe(true);
      expect(fs.existsSync(path.join(appDir, '.gitignore'))).toBe(true);

      // Verify retesting comparison
      expect(res.comparison).toBeDefined();
      expect(res.comparison.statusTransition.improved).toBe(true);
      expect(res.comparison.resolvedFindings.length).toBeGreaterThan(0);
      expect(res.comparison.regressedFindings.length).toBe(0);
    }, 20000);
  });

  describe('11.5: CLI --remediate & --apply-fix Integration', () => {
    it('CLI --remediate previews diffs without applying edits and exits with 0', () => {
      const appDir = path.join(tempDir, 'cli-remediate-app');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), appDir, { recursive: true });

      const exitCode = runAuditorCli([
        '--remediate',
        '--project',
        appDir,
      ]);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS_NO_BLOCKERS);
      expect(fs.existsSync(path.join(appDir, '.env.example'))).toBe(false);
    });

    it('CLI --apply-fix applies patches, reruns checks, and verifies remediation', () => {
      const appDir = path.join(tempDir, 'cli-apply-app');
      fs.cpSync(path.join(fixturesDir, 'missing-env'), appDir, { recursive: true });

      const exitCode = runAuditorCli([
        '--apply-fix',
        '--allow-exec',
        '--trust-project',
        '--project',
        appDir,
      ]);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS_NO_BLOCKERS);
      expect(fs.existsSync(path.join(appDir, '.env.example'))).toBe(true);
      expect(fs.existsSync(path.join(appDir, '.gitignore'))).toBe(true);
    }, 20000);
  });
});
