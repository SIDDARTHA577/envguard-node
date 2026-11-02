import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarball-test-'));
console.log('Testing in temp dir:', tempDir);
const tarballPath = path.resolve('envguard-node-1.0.0.tgz');

try {
  execSync('npm init -y', { cwd: tempDir, stdio: 'inherit' });
  execSync(`npm install "${tarballPath}"`, { cwd: tempDir, stdio: 'inherit' });

  // 1. ESM Test
  const esmTestScript = `
import { guard, s } from 'envguard-node';

const schema = {
  PORT: s.port().default(3000),
  APP_ENV: s.enum(['prod', 'dev']).default('dev')
};

const result = guard(schema, { PORT: '8080' });
console.log('ESM validation success:', result.success);
if (result.data.PORT !== 8080 || result.data.APP_ENV !== 'dev') {
  process.exit(1);
}
`;
  fs.writeFileSync(path.join(tempDir, 'test.mjs'), esmTestScript);
  execSync('node test.mjs', { cwd: tempDir, stdio: 'inherit' });

  // 2. CommonJS Test
  const cjsTestScript = `
const { guard, s } = require('envguard-node');

const schema = {
  PORT: s.port().default(3000),
  DEBUG: s.boolean().default(false)
};

const result = guard(schema, { PORT: '9000', DEBUG: 'true' });
console.log('CJS validation success:', result.success);
if (result.data.PORT !== 9000 || result.data.DEBUG !== true) {
  process.exit(1);
}
`;
  fs.writeFileSync(path.join(tempDir, 'test.cjs'), cjsTestScript);
  execSync('node test.cjs', { cwd: tempDir, stdio: 'inherit' });

  // 3. Test CLI executable
  execSync('npx envguard --version', { cwd: tempDir, stdio: 'inherit' });

  console.log('Tarball smoke test (ESM + CommonJS + CLI) PASSED successfully!');
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
  } catch {
    // cleanup
  }
}
