import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');

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

// 2. Generate CommonJS wrapper for CJS compatibility
const cjsWrapper = `// EnvGuard CommonJS compatibility bridge
const esmModulePromise = import('./index.js');

module.exports = new Proxy({}, {
  get(_target, prop) {
    throw new Error(
      \`EnvGuard is published as an ES Module. To use it in CommonJS, use dynamic import: const { guard, s } = await import('envguard-node');\`
    );
  }
});
`;

fs.writeFileSync(path.join(distDir, 'index.cjs'), cjsWrapper, 'utf8');
console.log('Build post-processing completed successfully.');
