import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { IGNORED_DIRECTORIES } from '../constants.mjs';

/**
 * Parses simple workspace glob patterns from package.json or pnpm-workspace.yaml.
 */
function parseWorkspaceGlobs(projectDir) {
  const globs = [];

  // Check pnpm-workspace.yaml
  const pnpmWorkspacePath = path.join(projectDir, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWorkspacePath)) {
    try {
      const content = fs.readFileSync(pnpmWorkspacePath, 'utf8');
      const lines = content.split(/\r?\n/);
      let inPackages = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^packages:\s*$/.test(trimmed)) {
          inPackages = true;
          continue;
        }
        if (inPackages) {
          if (trimmed.startsWith('-')) {
            const pattern = trimmed.replace(/^-\s*['"]?/, '').replace(/['"]?\s*$/, '');
            if (pattern) globs.push(pattern);
          } else if (trimmed && !trimmed.startsWith('#')) {
            inPackages = false;
          }
        }
      }
    } catch {}
  }

  // Check root package.json workspaces
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (Array.isArray(pkg.workspaces)) {
        globs.push(...pkg.workspaces);
      } else if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
        globs.push(...pkg.workspaces.packages);
      }
    } catch {}
  }

  // Deduplicate globs
  return Array.from(new Set(globs));
}

/**
 * Resolves workspace directories matching glob patterns (e.g. "apps/*", "packages/*").
 */
function resolveWorkspaceDirs(projectDir, globs) {
  const resolved = [];

  for (const glob of globs) {
    if (glob.endsWith('/*') || glob.endsWith('/**')) {
      const parentRel = glob.replace(/\/\*+$/, '');
      const parentAbs = path.join(projectDir, parentRel);
      if (fs.existsSync(parentAbs) && fs.statSync(parentAbs).isDirectory()) {
        try {
          const entries = fs.readdirSync(parentAbs, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
              const rel = path.join(parentRel, entry.name).replace(/\\/g, '/');
              resolved.push(rel);
            }
          }
        } catch {}
      }
    } else {
      const directAbs = path.join(projectDir, glob);
      if (fs.existsSync(directAbs) && fs.statSync(directAbs).isDirectory()) {
        resolved.push(glob.replace(/\\/g, '/'));
      }
    }
  }

  return Array.from(new Set(resolved));
}

/**
 * Classifies an application based on manifest, structure, and dependencies.
 */
function classifyApplication(appDir, relPath, manifest) {
  const deps = { ...(manifest?.dependencies || {}), ...(manifest?.devDependencies || {}) };

  // Detect frameworks
  const frameworks = [];
  if (deps['next']) {
    frameworks.push('nextjs');
  }
  if (deps['react']) {
    frameworks.push('react');
  }
  if (deps['express']) {
    frameworks.push('express');
  }
  if (deps['fastify']) {
    frameworks.push('fastify');
  }
  if (deps['@nestjs/core']) {
    frameworks.push('nestjs');
  }
  if (deps['koa']) {
    frameworks.push('koa');
  }
  if (deps['vite']) {
    frameworks.push('vite');
  }

  // Detect databases
  const databases = [];
  if (deps['prisma'] || deps['@prisma/client']) databases.push('prisma');
  if (deps['drizzle-orm']) databases.push('drizzle');
  if (deps['typeorm']) databases.push('typeorm');
  if (deps['mongoose']) databases.push('mongoose');
  if (deps['pg']) databases.push('postgresql');
  if (deps['mysql2'] || deps['mysql']) databases.push('mysql');
  if (deps['sqlite3'] || deps['better-sqlite3']) databases.push('sqlite');

  // Detect languages
  const languages = [];
  const hasTsConfig = fs.existsSync(path.join(appDir, 'tsconfig.json'));
  if (hasTsConfig || deps['typescript']) {
    languages.push('typescript');
  }
  const hasPkgFile = fs.existsSync(path.join(appDir, 'package.json'));
  let hasJsFiles = Boolean(manifest || hasPkgFile);
  if (!hasJsFiles) {
    try {
      hasJsFiles = fs.readdirSync(appDir).some((f) => /\.(js|mjs|cjs|jsx|ts|tsx)$/i.test(f));
    } catch {}
  }
  if (hasJsFiles) {
    languages.push('javascript');
  }

  // Detect deployment targets
  const deploymentTargets = [];
  if (
    fs.existsSync(path.join(appDir, 'Dockerfile')) ||
    fs.existsSync(path.join(appDir, 'docker-compose.yml')) ||
    fs.existsSync(path.join(appDir, 'Containerfile'))
  ) {
    deploymentTargets.push('docker');
  }
  if (fs.existsSync(path.join(appDir, 'vercel.json'))) {
    deploymentTargets.push('vercel');
  }
  if (fs.existsSync(path.join(appDir, 'netlify.toml'))) {
    deploymentTargets.push('netlify');
  }

  // Determine application type
  let type = 'unknown';
  let confidence = 'verified';
  let uncertaintyReason = null;

  if (!manifest) {
    type = 'unknown';
    confidence = 'uncertain';
    uncertaintyReason = 'No package.json manifest found in application directory.';
  } else if (frameworks.includes('nextjs')) {
    // Next.js with app/api or pages/api can be fullstack
    const hasApiRoutes =
      fs.existsSync(path.join(appDir, 'app', 'api')) ||
      fs.existsSync(path.join(appDir, 'src', 'app', 'api')) ||
      fs.existsSync(path.join(appDir, 'pages', 'api')) ||
      fs.existsSync(path.join(appDir, 'src', 'pages', 'api'));
    type = hasApiRoutes ? 'fullstack' : 'frontend';
  } else if (frameworks.includes('react') || frameworks.includes('vite')) {
    type = 'frontend';
  } else if (
    frameworks.includes('express') ||
    frameworks.includes('fastify') ||
    frameworks.includes('nestjs') ||
    frameworks.includes('koa')
  ) {
    type = 'backend';
  } else if (manifest.bin) {
    type = 'cli';
  } else if (
    manifest.main ||
    manifest.types ||
    manifest.exports ||
    relPath.includes('packages/') ||
    relPath.includes('shared') ||
    relPath.includes('lib')
  ) {
    type = 'library';
  } else if (manifest.scripts?.start || manifest.scripts?.dev) {
    type = 'service';
    confidence = 'inferred';
  } else {
    type = 'unknown';
    confidence = 'uncertain';
    uncertaintyReason = 'Package manifest present but no recognized framework, library, or entrypoint pattern found.';
  }

  // Check router architecture for Next.js
  let nextRouter = null;
  if (frameworks.includes('nextjs')) {
    const hasApp = fs.existsSync(path.join(appDir, 'app')) || fs.existsSync(path.join(appDir, 'src', 'app'));
    const hasPages = fs.existsSync(path.join(appDir, 'pages')) || fs.existsSync(path.join(appDir, 'src', 'pages'));
    if (hasApp && hasPages) nextRouter = 'hybrid';
    else if (hasApp) nextRouter = 'app_router';
    else if (hasPages) nextRouter = 'pages_router';
  }

  return {
    type,
    confidence,
    uncertaintyReason,
    frameworks,
    databases,
    languages,
    deploymentTargets,
    nextRouter,
  };
}

/**
 * Builds a comprehensive inventory graph for the repository.
 * Model: Repository -> Applications -> Services -> Frameworks -> Databases -> Deployment Targets.
 */
export function buildInventoryGraph(projectDir) {
  const repoName = path.basename(projectDir);

  // Check Git status
  let isGit = false;
  let gitCommit = null;
  try {
    const res = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 3000,
      shell: false,
    });
    if (res.status === 0 && res.stdout.trim()) {
      isGit = true;
      gitCommit = res.stdout.trim();
    }
  } catch {}

  // Check Monorepo signals
  const workspaceGlobs = parseWorkspaceGlobs(projectDir);
  const isMonorepo = workspaceGlobs.length > 0;
  let monorepoType = null;
  if (fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'))) {
    monorepoType = 'pnpm';
  } else if (workspaceGlobs.length > 0) {
    monorepoType = 'npm-yarn';
  }

  const applications = [];
  const relationships = [];

  if (isMonorepo) {
    const appRelDirs = resolveWorkspaceDirs(projectDir, workspaceGlobs);
    for (const relPath of appRelDirs) {
      const appAbs = path.join(projectDir, relPath);
      let manifest = null;
      const pkgPath = path.join(appAbs, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        } catch {}
      }

      const classification = classifyApplication(appAbs, relPath, manifest);
      const appId = manifest?.name || path.basename(relPath);

      applications.push({
        id: appId,
        name: manifest?.name || path.basename(relPath),
        path: relPath,
        absPath: appAbs,
        isRoot: false,
        manifest,
        ...classification,
      });
    }

    // Map relationships between applications (e.g. web consumes shared library)
    for (const app of applications) {
      if (!app.manifest) continue;
      const allDeps = {
        ...(app.manifest.dependencies || {}),
        ...(app.manifest.devDependencies || {}),
      };

      for (const other of applications) {
        if (other.id === app.id) continue;
        if (allDeps[other.name] || allDeps[other.id]) {
          relationships.push({
            from: app.id,
            to: other.id,
            type: other.type === 'library' ? 'depends_on' : 'consumes',
          });
        }
      }
    }
  } else {
    // Single project repository
    let manifest = null;
    const pkgPath = path.join(projectDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch {}
    }

    const classification = classifyApplication(projectDir, '.', manifest);
    applications.push({
      id: manifest?.name || repoName,
      name: manifest?.name || repoName,
      path: '.',
      absPath: projectDir,
      isRoot: true,
      manifest,
      ...classification,
    });
  }

  return {
    repository: {
      root: projectDir,
      name: repoName,
      isGit,
      gitCommit,
      isMonorepo,
      monorepoType,
      workspaceGlobs,
    },
    applications,
    relationships,
    timestamp: new Date().toISOString(),
  };
}
