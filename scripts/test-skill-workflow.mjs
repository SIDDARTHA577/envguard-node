import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-skill-test-'));
const cliBinPath = path.resolve('dist', 'cli.js');

console.log('Testing realistic agent skill workflow in disposable project:', tempProjectDir);

try {
  // 1. Initialize sample project
  const packageJson = {
    name: 'sample-service',
    version: '1.0.0',
    type: 'module',
  };
  fs.writeFileSync(
    path.join(tempProjectDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // 2. Add realistic unvalidated application code
  const appCode = `
import http from 'node:http';

const port = process.env.PORT || 3000;
const dbUrl = process.env.DATABASE_URL;
const apiKey = process.env.API_KEY;

const server = http.createServer((req, res) => {
  res.end('OK');
});

console.log('App ready');
`;
  fs.writeFileSync(path.join(tempProjectDir, 'server.js'), appCode);

  // 3. Execute envguard init to generate starter config and .env.example
  execSync(`node "${cliBinPath}" init --type json`, {
    cwd: tempProjectDir,
    stdio: 'inherit',
  });

  const configPath = path.join(tempProjectDir, 'envguard.config.json');
  const examplePath = path.join(tempProjectDir, '.env.example');

  if (!fs.existsSync(configPath) || !fs.existsSync(examplePath)) {
    throw new Error('Skill setup failed to generate config or .env.example');
  }

  // 4. Test validation check against safe .env.example
  execSync(`node "${cliBinPath}" check --schema "${configPath}" --env-file "${examplePath}"`, {
    cwd: tempProjectDir,
    stdio: 'inherit',
  });

  // 5. Test validation failure on missing required keys
  const emptyEnvPath = path.join(tempProjectDir, '.env.empty');
  fs.writeFileSync(emptyEnvPath, '');

  let failedCleanly = false;
  try {
    execSync(`node "${cliBinPath}" check --schema "${configPath}" --env-file "${emptyEnvPath}"`, {
      cwd: tempProjectDir,
      stdio: 'pipe',
    });
  } catch (err) {
    if (err.status === 1) {
      failedCleanly = true;
    }
  }

  if (!failedCleanly) {
    throw new Error('Expected validation failure exit code 1 on empty env file');
  }

  console.log('Realistic agent skill workflow verified successfully in disposable project!');
} finally {
  try {
    fs.rmSync(tempProjectDir, { recursive: true, force: true });
  } catch {
    // cleanup
  }
}
