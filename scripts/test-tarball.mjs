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

  const testScript = `
import { guard, s } from 'envguard-node';

const schema = {
  PORT: s.port().default(3000),
  APP_ENV: s.enum(['prod', 'dev']).default('dev')
};

const result = guard(schema, { PORT: '8080' });
console.log('Validation success:', result.success);
console.log('Data:', JSON.stringify(result.data));
if (result.data.PORT !== 8080 || result.data.APP_ENV !== 'dev') {
  process.exit(1);
}
`;

  fs.writeFileSync(path.join(tempDir, 'test.mjs'), testScript);
  execSync('node test.mjs', { cwd: tempDir, stdio: 'inherit' });

  // Test CLI
  execSync('npx envguard --version', { cwd: tempDir, stdio: 'inherit' });

  console.log('Tarball smoke test PASSED successfully!');
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
