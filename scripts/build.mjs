import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { syncCodexSkills } from './sync-codex-skills.mjs';

const distDir = path.resolve('dist');

// Synchronize skills to .agents/skills for Codex discovery
syncCodexSkills();

// 1. Ensure dist/cli.js starts with shebang
const cliPath = path.join(distDir, 'cli-bin.js');
const targetCli = path.join(distDir, 'cli.js');

if (fs.existsSync(cliPath)) {
  let content = fs.readFileSync(cliPath, 'utf8');
  if (!content.startsWith('#!/usr/bin/env node')) {
    content = '#!/usr/bin/env node\n' + content;
  }
  fs.writeFileSync(targetCli, content, { mode: 0o755 });
}

// 2. Build CommonJS distribution for dual CJS/ESM support
try {
  execSync('npx tsc -p tsconfig.cjs.json', { stdio: 'inherit' });
  const cjsDir = path.join(distDir, 'cjs');
  if (!fs.existsSync(cjsDir)) {
    fs.mkdirSync(cjsDir, { recursive: true });
  }
  // Isolate CJS scope so Node treats .js inside dist/cjs as CommonJS
  fs.writeFileSync(
    path.join(cjsDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2),
    'utf8'
  );
  const cjsBridge = `// Dual CommonJS and ESM bridge for envguard-node
module.exports = require('./cjs/index.js');
`;
  fs.writeFileSync(path.join(distDir, 'index.cjs'), cjsBridge, 'utf8');
  console.log('CommonJS distribution compiled successfully.');
} catch (err) {
  console.error('Failed to compile CommonJS build:', err);
  process.exit(1);
}

console.log('Build post-processing completed successfully.');
