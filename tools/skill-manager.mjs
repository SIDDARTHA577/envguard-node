#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const CATALOG_DIR = path.join(REPO_ROOT, 'catalog');
const PACKS_PATH = path.join(CATALOG_DIR, 'packs.json');
const SKILLS_PATH = path.join(CATALOG_DIR, 'skills.json');

export const SUPPORTED_HOSTS = ['codex', 'antigravity', 'claude', 'claude-code', 'cursor'];

export const REQUIRED_SECTIONS = [
  'When to Trigger',
  'When NOT to Trigger',
  'Supported Projects & Environments',
  'Required Tools & Permissions',
  'Expected Inputs',
  'Step-by-Step Workflow',
  'Validation Steps',
  'Expected Outputs',
  'Failure Handling',
  'Safety & Privacy Boundaries',
  'Example User Prompts',
];

/**
 * Loads packs registry.
 */
export function loadPacks(repoRoot = REPO_ROOT) {
  const packsPath = path.join(repoRoot, 'catalog', 'packs.json');
  if (!fs.existsSync(packsPath)) return [];
  return JSON.parse(fs.readFileSync(packsPath, 'utf8'));
}

/**
 * Loads skills registry.
 */
export function loadSkills(repoRoot = REPO_ROOT) {
  const skillsPath = path.join(repoRoot, 'catalog', 'skills.json');
  if (!fs.existsSync(skillsPath)) return [];
  return JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
}

/**
 * Computes sha256 checksum of content.
 */
export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Parses YAML frontmatter using standards-compliant YAML parser.
 * Supports folded multiline strings, colons inside quotes, arrays, etc.
 */
export function parseFrontmatter(content) {
  if (typeof content !== 'string' || !content.startsWith('---')) {
    return null;
  }
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return null;
  }
  const rawYaml = content.slice(3, endIdx).trim();
  let parsed;
  try {
    parsed = YAML.parse(rawYaml);
  } catch (err) {
    throw new Error(`YAML frontmatter syntax error: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return {
    frontmatter: parsed,
    body: content.slice(endIdx + 4).trim(),
  };
}

/**
 * Validates installation metadata structure and prevents untrusted corruption.
 */
export function validateMetadata(metadata, destDir) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Invalid metadata: root must be a valid JSON object.');
  }
  if (metadata.managedBy !== 'envguard') {
    throw new Error(`Invalid metadata: managedBy must be "envguard", got "${metadata.managedBy}".`);
  }
  if (typeof metadata.version !== 'string' || !metadata.version) {
    throw new Error('Invalid metadata: version is required.');
  }
  if (!metadata.skills || typeof metadata.skills !== 'object') {
    throw new Error('Invalid metadata: skills map is required.');
  }

  const seenPaths = new Set();

  for (const [skillName, record] of Object.entries(metadata.skills)) {
    if (!/^envguard-[a-z0-9-]+$/.test(skillName)) {
      throw new Error(`Invalid metadata: invalid skill identifier "${skillName}".`);
    }
    if (!record || typeof record !== 'object') {
      throw new Error(`Invalid metadata for skill "${skillName}": entry must be an object.`);
    }
    if (!Array.isArray(record.files)) {
      throw new Error(`Invalid metadata for skill "${skillName}": files array is required.`);
    }
    for (const file of record.files) {
      if (!file || typeof file.path !== 'string' || typeof file.sha256 !== 'string') {
        throw new Error(`Invalid metadata for skill "${skillName}": malformed file record.`);
      }
      if (!/^[a-f0-9]{64}$/.test(file.sha256)) {
        throw new Error(`Invalid metadata for skill "${skillName}": invalid sha256 hash "${file.sha256}".`);
      }
      // Path traversal check on recorded path
      try {
        assertSafeDestination(destDir, file.path);
      } catch (err) {
        throw new Error(`Invalid metadata for skill "${skillName}": ${err.message}`);
      }

      if (seenPaths.has(file.path)) {
        throw new Error(`Invalid metadata: duplicate path "${file.path}" claimed by multiple skills.`);
      }
      seenPaths.add(file.path);
    }
  }

  return true;
}

/**
 * Writes metadata atomically to prevent corrupted files on interruption.
 */
export function writeMetadataAtomic(metadataPath, metadata) {
  const dir = path.dirname(metadataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${metadataPath}.tmp.${process.pid}.${Date.now()}`;
  const serialized = JSON.stringify(metadata, null, 2);
  fs.writeFileSync(tmpPath, serialized, 'utf8');
  fs.renameSync(tmpPath, metadataPath);
}

/**
 * Validates destination directory against path traversal attacks and symlink escapes.
 * Checks lexical containment and inspects existing path components for symlink redirection.
 */
export function assertSafeDestination(destDir, subPath = '') {
  if (subPath.includes('\0')) {
    throw new Error('Invalid destination path: contains null byte');
  }

  const resolvedBase = path.resolve(destDir);
  const resolvedTarget = path.resolve(resolvedBase, subPath);

  // 1. Lexical boundary containment
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path traversal attempt detected: "${subPath}" escapes destination "${destDir}"`);
  }

  // 2. Symlink escape detection on existing intermediate segments
  let baseReal;
  try {
    baseReal = fs.existsSync(resolvedBase) ? fs.realpathSync.native(resolvedBase) : resolvedBase;
  } catch {
    baseReal = resolvedBase;
  }

  const segments = relative ? relative.split(/[\\/]/) : [];
  let current = resolvedBase;

  for (const seg of segments) {
    current = path.join(current, seg);
    if (fs.existsSync(current)) {
      try {
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) {
          const linkReal = fs.realpathSync.native(current);
          const linkRel = path.relative(baseReal, linkReal);
          if (linkRel.startsWith('..') || path.isAbsolute(linkRel)) {
            throw new Error(
              `Symlink escape detected: "${current}" resolves to "${linkReal}" outside destination directory.`
            );
          }
        }
      } catch (err) {
        if (err.message && err.message.includes('Symlink escape detected')) {
          throw err;
        }
        // Inaccessible components handled safely
      }
    }
  }

  return resolvedTarget;
}

/**
 * Resolves destination relative directory for target host.
 */
export function resolveTargetDirForHost(skillName, targetHost) {
  if (!SUPPORTED_HOSTS.includes(targetHost)) {
    throw new Error(
      `Unsupported target host "${targetHost}". Supported hosts: ${SUPPORTED_HOSTS.join(', ')}`
    );
  }
  switch (targetHost) {
    case 'antigravity':
      return path.join('skills', skillName);
    case 'claude':
    case 'claude-code':
      return path.join('.claude', 'skills', skillName);
    case 'cursor':
      return path.join('.cursor', 'skills', skillName);
    case 'codex':
    default:
      return path.join('.agents', 'skills', skillName);
  }
}

/**
 * Recursively copies a directory's contents.
 */
export function copyDirectoryRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Collects all source files belonging to a skill's canonical directory.
 */
export function collectSkillFiles(skillCanonicalDir) {
  const files = [];
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const relToSkill = path.relative(skillCanonicalDir, full).replace(/\\/g, '/');
        files.push({ relPath: relToSkill, fullPath: full });
      }
    }
  }
  walk(skillCanonicalDir);
  return files;
}

export const BUNDLED_READINESS_SKILLS = [
  'packs/production/skills/envguard-production-readiness',
  'packs/production/skills/envguard-senior-engineer-review',
  'packs/production/skills/envguard-load-test',
  'packs/production/skills/envguard-mobile-readiness',
];

/**
 * Synchronizes canonical readiness executable engine from tools/ into bundled skills.
 */
export function syncCanonicalExecutables({ repoRoot = REPO_ROOT, checkOnly = false } = {}) {
  const issues = [];
  const canonicalAuditorPath = path.join(repoRoot, 'tools', 'readiness-auditor.mjs');
  const canonicalReadinessDir = path.join(repoRoot, 'tools', 'readiness');

  if (!fs.existsSync(canonicalAuditorPath) || !fs.existsSync(canonicalReadinessDir)) {
    return { valid: true, issues: [] };
  }

  const canonicalAuditorHash = sha256(fs.readFileSync(canonicalAuditorPath));

  // Collect all canonical readiness files and their hashes
  const canonicalFiles = [];
  function walkCanonical(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkCanonical(full);
      } else if (entry.isFile()) {
        const rel = path.relative(canonicalReadinessDir, full).replace(/\\/g, '/');
        canonicalFiles.push({ rel, full, hash: sha256(fs.readFileSync(full)) });
      }
    }
  }
  walkCanonical(canonicalReadinessDir);

  for (const skillRelDir of BUNDLED_READINESS_SKILLS) {
    const targetSkillDir = path.join(repoRoot, skillRelDir);
    if (!fs.existsSync(targetSkillDir)) continue;

    const targetAuditor = path.join(targetSkillDir, 'scripts', 'readiness-auditor.mjs');
    const targetReadinessDir = path.join(targetSkillDir, 'scripts', 'readiness');

    if (checkOnly) {
      if (!fs.existsSync(targetAuditor)) {
        issues.push(`Missing executable readiness-auditor.mjs in ${skillRelDir}/scripts/`);
      } else if (sha256(fs.readFileSync(targetAuditor)) !== canonicalAuditorHash) {
        issues.push(`Stale executable readiness-auditor.mjs in ${skillRelDir}/scripts/`);
      }

      for (const cf of canonicalFiles) {
        const targetFile = path.join(targetReadinessDir, cf.rel);
        if (!fs.existsSync(targetFile)) {
          issues.push(`Missing executable readiness/${cf.rel} in ${skillRelDir}/scripts/`);
        } else if (sha256(fs.readFileSync(targetFile)) !== cf.hash) {
          issues.push(`Stale executable readiness/${cf.rel} in ${skillRelDir}/scripts/`);
        }
      }
    } else {
      // Sync
      fs.mkdirSync(path.join(targetSkillDir, 'scripts'), { recursive: true });
      fs.copyFileSync(canonicalAuditorPath, targetAuditor);

      for (const cf of canonicalFiles) {
        const targetFile = path.join(targetReadinessDir, cf.rel);
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.copyFileSync(cf.full, targetFile);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Synchronizes canonical skills to .agents/skills/ and updates host manifests.
 * Also supports checking synchronization (--check) without modifying disk.
 */
export function syncSkills({ repoRoot = REPO_ROOT, checkOnly = false } = {}) {
  const skills = loadSkills(repoRoot);
  const agentsSkillsDir = path.join(repoRoot, '.agents', 'skills');

  const issues = [];
  let syncedCount = 0;

  // 1. Sync or check canonical executables into bundled skills
  const execSyncResult = syncCanonicalExecutables({ repoRoot, checkOnly });
  if (!execSyncResult.valid) {
    issues.push(...execSyncResult.issues);
  }

  for (const skill of skills) {
    const srcDir = path.join(repoRoot, skill.canonicalDir);
    const srcSkill = path.join(srcDir, 'SKILL.md');
    if (!fs.existsSync(srcSkill)) {
      issues.push(`Canonical skill missing: ${srcSkill}`);
      continue;
    }

    const destDir = path.join(agentsSkillsDir, skill.name);
    const destSkill = path.join(destDir, 'SKILL.md');

    const canonicalContent = fs.readFileSync(srcSkill, 'utf8');

    if (checkOnly) {
      if (!fs.existsSync(destSkill)) {
        issues.push(`Missing synchronized skill in .agents/skills/${skill.name}/SKILL.md`);
      } else {
        const destContent = fs.readFileSync(destSkill, 'utf8');
        if (destContent.replace(/\r\n/g, '\n').trim() !== canonicalContent.replace(/\r\n/g, '\n').trim()) {
          issues.push(`Synchronized content mismatch in .agents/skills/${skill.name}/SKILL.md`);
        }
      }
      continue;
    }

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.writeFileSync(destSkill, canonicalContent, 'utf8');
    syncedCount++;

    // Copy any scripts, references, or assets if present
    for (const sub of ['scripts', 'references', 'assets']) {
      const subSrc = path.join(srcDir, sub);
      if (fs.existsSync(subSrc) && fs.statSync(subSrc).isDirectory()) {
        const subDest = path.join(destDir, sub);
        if (!fs.existsSync(subDest)) fs.mkdirSync(subDest, { recursive: true });
        fs.cpSync(subSrc, subDest, { recursive: true });
      }
    }
  }

  // Detect stale files in .agents/skills/ that are not in catalog
  if (fs.existsSync(agentsSkillsDir)) {
    const validNames = new Set(skills.map((s) => s.name));
    for (const folder of fs.readdirSync(agentsSkillsDir)) {
      const folderPath = path.join(agentsSkillsDir, folder);
      if (fs.statSync(folderPath).isDirectory() && !validNames.has(folder)) {
        issues.push(`Stale skill folder detected in .agents/skills/${folder}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    syncedCount,
    issues,
  };
}

/**
 * Verifies quality, frontmatter, and completeness across all skills.
 */
export function verifySkills(repoRoot = REPO_ROOT) {
  const skills = loadSkills(repoRoot);
  const packs = loadPacks(repoRoot);
  const errors = [];
  const warnings = [];

  const packIds = new Set(packs.map((p) => p.id));
  const seenSkillNames = new Set();

  for (const skill of skills) {
    // 1. Unique name
    if (seenSkillNames.has(skill.name)) {
      errors.push(`Duplicate skill name in catalog: ${skill.name}`);
    }
    seenSkillNames.add(skill.name);

    // 2. Pack exists
    if (!packIds.has(skill.pack)) {
      errors.push(`Skill ${skill.name} references non-existent pack: ${skill.pack}`);
    }

    // 3. Canonical directory exists
    const canonicalPath = path.join(repoRoot, skill.canonicalDir, 'SKILL.md');
    if (!fs.existsSync(canonicalPath)) {
      errors.push(`Skill ${skill.name} missing canonical file at: ${skill.canonicalDir}/SKILL.md`);
      continue;
    }

    // 4. Validate SKILL.md contents using standards-compliant parser
    const rawContent = fs.readFileSync(canonicalPath, 'utf8');
    let parsed;
    try {
      parsed = parseFrontmatter(rawContent);
    } catch (err) {
      errors.push(`Skill ${skill.name} malformed YAML frontmatter: ${err.message}`);
      continue;
    }

    if (!parsed) {
      errors.push(`Skill ${skill.name} has missing YAML frontmatter.`);
      continue;
    }

    if (parsed.frontmatter.name !== skill.name) {
      errors.push(
        `Skill ${skill.name} frontmatter name mismatch: expected "${skill.name}", got "${parsed.frontmatter.name}"`
      );
    }

    if (!parsed.frontmatter.description || typeof parsed.frontmatter.description !== 'string') {
      errors.push(`Skill ${skill.name} frontmatter is missing a valid 'description' string.`);
    } else {
      const descLen = parsed.frontmatter.description.trim().length;
      if (descLen < 20) {
        errors.push(`Skill ${skill.name} description is too short (${descLen} chars, minimum 20).`);
      }
      if (descLen > 500) {
        errors.push(`Skill ${skill.name} description is too long (${descLen} chars, maximum 500).`);
      }
    }

    // 5. Validate required sections
    for (const section of REQUIRED_SECTIONS) {
      if (!rawContent.includes(section)) {
        errors.push(`Skill ${skill.name} is missing required section: "## ${section}"`);
      }
    }

    // 6. Check for dangerous absolute paths or fake credentials
    if (/([A-Za-z]:\\Users\\[^\s\\]+|\/home\/[^\s/]+)/.test(rawContent)) {
      errors.push(`Skill ${skill.name} contains developer-specific absolute paths.`);
    }

    // 7. Check synchronization with .agents/skills/
    const agentsSkillPath = path.join(repoRoot, '.agents', 'skills', skill.name, 'SKILL.md');
    if (fs.existsSync(agentsSkillPath)) {
      const agentsContent = fs.readFileSync(agentsSkillPath, 'utf8');
      if (agentsContent.replace(/\r\n/g, '\n').trim() !== rawContent.replace(/\r\n/g, '\n').trim()) {
        errors.push(
          `Skill ${skill.name} is out of sync between ${skill.canonicalDir} and .agents/skills/${skill.name}.`
        );
      }
    }
  }

  // 8. Check synchronization of bundled generated executables
  const execCheck = syncCanonicalExecutables({ repoRoot, checkOnly: true });
  if (!execCheck.valid) {
    for (const issue of execCheck.issues) {
      errors.push(`${issue} Run "npm run skills:sync" to synchronize with canonical sources.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    skillCount: skills.length,
  };
}

/**
 * Installs skills into target destination with safety, idempotency, and rollback.
 */
export function installSkills({
  skillName,
  packName,
  destDir = '.',
  targetHost = 'codex',
  dryRun = false,
  force = false,
  repoRoot = REPO_ROOT,
} = {}) {
  if (!SUPPORTED_HOSTS.includes(targetHost)) {
    throw new Error(
      `Unsupported target host "${targetHost}". Supported hosts: ${SUPPORTED_HOSTS.join(', ')}`
    );
  }

  const allSkills = loadSkills(repoRoot);
  const allPacks = loadPacks(repoRoot);

  let targetSkills = [];

  if (skillName) {
    const found = allSkills.find((s) => s.name === skillName);
    if (!found) {
      throw new Error(`Skill "${skillName}" not found in EnvGuard catalog.`);
    }
    targetSkills = [found];
  } else if (packName) {
    if (packName === 'all') {
      targetSkills = allSkills;
    } else {
      const pack = allPacks.find((p) => p.id === packName);
      if (!pack) {
        throw new Error(`Pack "${packName}" not found in EnvGuard catalog.`);
      }
      targetSkills = allSkills.filter((s) => pack.skills.includes(s.name));
    }
  } else {
    throw new Error('Either --skill or --pack must be specified.');
  }

  const safeDestRoot = assertSafeDestination(destDir);
  const metadataPath = path.join(safeDestRoot, '.envguard-skills.json');

  let metadata = {
    managedBy: 'envguard',
    version: '1.0.0',
    skills: {},
  };

  if (fs.existsSync(metadataPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      validateMetadata(raw, safeDestRoot);
      metadata = raw;
    } catch (err) {
      throw new Error(`Installation blocked: corrupted installation metadata in destination: ${err.message}`);
    }
  }

  const plan = {
    actions: [],
    skipped: [],
    errors: [],
  };

  for (const skill of targetSkills) {
    const srcDir = path.join(repoRoot, skill.canonicalDir);
    const skillFiles = collectSkillFiles(srcDir);

    if (skillFiles.length === 0) {
      plan.errors.push(`Canonical skill files missing in: ${srcDir}`);
      continue;
    }

    const targetRelDir = resolveTargetDirForHost(skill.name, targetHost);
    const targetDestDir = assertSafeDestination(safeDestRoot, targetRelDir);

    for (const file of skillFiles) {
      const content = fs.readFileSync(file.fullPath, 'utf8');
      const hash = sha256(content);

      const targetFilePath = assertSafeDestination(targetDestDir, file.relPath);
      const relativeToDest = path.relative(safeDestRoot, targetFilePath).replace(/\\/g, '/');

      if (fs.existsSync(targetFilePath)) {
        const existingContent = fs.readFileSync(targetFilePath, 'utf8');
        const existingHash = sha256(existingContent);

        if (existingHash === hash) {
          plan.skipped.push({
            skill: skill.name,
            path: relativeToDest,
            reason: 'already up to date',
          });
          continue;
        }

        // If file exists and differs, verify ownership and modification status
        const skillRecord = metadata.skills[skill.name];
        const isManaged = skillRecord?.files?.some((f) => f.path === relativeToDest);

        if (!isManaged && !force) {
          plan.errors.push(
            `Conflict: "${relativeToDest}" already exists and is not managed by EnvGuard. Use --force to overwrite.`
          );
          continue;
        }

        // If it IS managed but the user has modified it, protect it unless forced
        const managedFileRecord = skillRecord?.files?.find((f) => f.path === relativeToDest);
        if (managedFileRecord && managedFileRecord.sha256 !== existingHash && !force) {
          plan.errors.push(
            `Conflict: "${relativeToDest}" has been modified by the developer since installation. Use --force to overwrite.`
          );
          continue;
        }
      }

      plan.actions.push({
        action: 'install',
        skill: skill.name,
        src: file.fullPath,
        dest: targetFilePath,
        relPath: relativeToDest,
        content,
        hash,
      });
    }
  }

  if (plan.errors.length > 0) {
    return { success: false, plan };
  }

  if (!dryRun) {
    const createdFiles = [];
    try {
      if (!fs.existsSync(safeDestRoot)) {
        fs.mkdirSync(safeDestRoot, { recursive: true });
      }

      for (const item of plan.actions) {
        const dir = path.dirname(item.dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const existed = fs.existsSync(item.dest);
        fs.writeFileSync(item.dest, item.content, 'utf8');

        if (!existed) {
          createdFiles.push(item.dest);
        }

        if (!metadata.skills[item.skill]) {
          metadata.skills[item.skill] = {
            installedAt: new Date().toISOString(),
            targetHost,
            files: [],
          };
        }

        const existingIdx = metadata.skills[item.skill].files.findIndex((f) => f.path === item.relPath);
        if (existingIdx >= 0) {
          metadata.skills[item.skill].files[existingIdx] = { path: item.relPath, sha256: item.hash };
        } else {
          metadata.skills[item.skill].files.push({ path: item.relPath, sha256: item.hash });
        }
      }

      // Also ensure any skipped files that were already up to date remain tracked
      for (const skipped of plan.skipped) {
        if (!metadata.skills[skipped.skill]) {
          metadata.skills[skipped.skill] = {
            installedAt: new Date().toISOString(),
            targetHost,
            files: [],
          };
        }
        const fullSkipped = path.join(safeDestRoot, skipped.path);
        if (fs.existsSync(fullSkipped)) {
          const hash = sha256(fs.readFileSync(fullSkipped, 'utf8'));
          const existingIdx = metadata.skills[skipped.skill].files.findIndex((f) => f.path === skipped.path);
          if (existingIdx >= 0) {
            metadata.skills[skipped.skill].files[existingIdx] = { path: skipped.path, sha256: hash };
          } else {
            metadata.skills[skipped.skill].files.push({ path: skipped.path, sha256: hash });
          }
        }
      }

      writeMetadataAtomic(metadataPath, metadata);
    } catch (err) {
      // Rollback newly created files
      for (const created of createdFiles) {
        try {
          if (fs.existsSync(created)) fs.unlinkSync(created);
        } catch {}
      }
      throw new Error(`Installation failed and was rolled back: ${err.message}`);
    }
  }

  return { success: true, plan };
}

/**
 * Safely uninstalls managed skills from target destination.
 * Checks checksums to protect user-modified files unless explicitly forced.
 */
export function uninstallSkills({
  skillName,
  packName,
  all = false,
  destDir = '.',
  dryRun = false,
  force = false,
  repoRoot = REPO_ROOT,
} = {}) {
  const safeDestRoot = assertSafeDestination(destDir);
  const metadataPath = path.join(safeDestRoot, '.envguard-skills.json');

  if (!fs.existsSync(metadataPath)) {
    return {
      success: false,
      error: 'No EnvGuard installation metadata found in destination directory.',
    };
  }

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    validateMetadata(metadata, safeDestRoot);
  } catch (err) {
    return { success: false, error: `Uninstallation aborted: invalid or corrupted metadata: ${err.message}` };
  }

  const allSkills = loadSkills(repoRoot);
  const allPacks = loadPacks(repoRoot);

  let toRemove = [];

  if (all) {
    toRemove = Object.keys(metadata.skills || {});
  } else if (skillName) {
    if (!metadata.skills?.[skillName]) {
      return { success: false, error: `Skill "${skillName}" is not registered in installation metadata.` };
    }
    toRemove = [skillName];
  } else if (packName) {
    const pack = allPacks.find((p) => p.id === packName);
    if (!pack) {
      return { success: false, error: `Pack "${packName}" not found in catalog.` };
    }
    toRemove = pack.skills.filter((s) => metadata.skills[s]);
    if (toRemove.length === 0) {
      return { success: false, error: `No skills from pack "${packName}" are installed in destination.` };
    }
  } else {
    return { success: false, error: 'Specify --skill, --pack, or --all to uninstall.' };
  }

  const actions = [];
  const preserved = [];
  const missing = [];

  for (const name of toRemove) {
    const record = metadata.skills?.[name];
    if (!record) continue;

    for (const file of record.files || []) {
      const targetPath = assertSafeDestination(safeDestRoot, file.path);

      if (!fs.existsSync(targetPath)) {
        missing.push({
          skill: name,
          path: file.path,
          reason: 'already missing on disk',
        });
        continue;
      }

      const currentContent = fs.readFileSync(targetPath, 'utf8');
      const currentHash = sha256(currentContent);

      if (currentHash !== file.sha256) {
        // File has been modified by user!
        if (!force) {
          preserved.push({
            skill: name,
            path: file.path,
            reason: 'modified by user (preserved; use --force to delete)',
          });
          continue;
        }
      }

      actions.push({
        action: 'delete',
        skill: name,
        path: targetPath,
        relPath: file.path,
      });
    }
  }

  if (!dryRun) {
    for (const item of actions) {
      if (fs.existsSync(item.path)) {
        fs.unlinkSync(item.path);
        // Clean empty parent directories recursively up to safeDestRoot
        let parent = path.dirname(item.path);
        while (parent !== safeDestRoot && parent.startsWith(safeDestRoot)) {
          try {
            if (fs.readdirSync(parent).length === 0) {
              fs.rmdirSync(parent);
              parent = path.dirname(parent);
            } else {
              break;
            }
          } catch {
            break;
          }
        }
      }
    }

    // Only remove skills from metadata where all files were removed or missing
    const preservedSkillNames = new Set(preserved.map((p) => p.skill));
    for (const name of toRemove) {
      if (!preservedSkillNames.has(name)) {
        delete metadata.skills[name];
      }
    }

    if (Object.keys(metadata.skills || {}).length === 0) {
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }
    } else {
      writeMetadataAtomic(metadataPath, metadata);
    }
  }

  return {
    success: true,
    actions,
    preserved,
    missing,
  };
}

// CLI Execution entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  try {
    if (command === 'list') {
      const packs = loadPacks();
      const skills = loadSkills();
      console.log('=== EnvGuard Skill Catalog ===\n');
      console.log(`Available Packs (${packs.length}):`);
      for (const p of packs) {
        console.log(`  - ${p.id.padEnd(12)} : ${p.name} (${p.skills.length} skills)`);
      }
      console.log(`\nAvailable Skills (${skills.length}):`);
      for (const s of skills) {
        console.log(`  - ${s.name.padEnd(20)} [${s.pack}] : ${s.description.slice(0, 70)}...`);
      }
    } else if (command === 'sync') {
      const checkOnly = args.includes('--check');
      const result = syncSkills({ checkOnly });
      if (checkOnly) {
        if (result.valid) {
          console.log('✓ All skills in .agents/skills/ are fully synchronized.');
        } else {
          console.error('X Skill synchronization check failed:');
          for (const issue of result.issues) console.error(`  - ${issue}`);
          process.exit(1);
        }
      } else {
        console.log(`Successfully synchronized ${result.syncedCount} skills to .agents/skills/.`);
      }
    } else if (command === 'verify') {
      const result = verifySkills();
      if (result.valid) {
        console.log(`✓ All ${result.skillCount} skills passed verification checks.`);
      } else {
        console.error(`X Skill verification failed with ${result.errors.length} errors:`);
        for (const err of result.errors) console.error(`  - ${err}`);
        process.exit(1);
      }
    } else if (command === 'install') {
      const getArg = (flag) => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? args[idx + 1] : undefined;
      };
      const skillName = getArg('--skill');
      const packName = getArg('--pack');
      const destDir = getArg('--dest') || '.';
      const targetHost = getArg('--target') || 'codex';
      const sourceDir = getArg('--source') || getArg('--repo-root') || REPO_ROOT;
      const dryRun = args.includes('--dry-run');
      const force = args.includes('--force');

      const result = installSkills({
        skillName,
        packName,
        destDir,
        targetHost,
        dryRun,
        force,
        repoRoot: sourceDir,
      });

      if (!result.success) {
        console.error('Installation failed:');
        for (const err of result.plan.errors) console.error(`  - ${err}`);
        process.exit(1);
      }

      console.log(dryRun ? '=== Planned Actions (Dry Run) ===' : '=== Installation Complete ===');
      for (const item of result.plan.actions) {
        console.log(`  + [${item.skill}] -> ${item.relPath}`);
      }
      for (const skip of result.plan.skipped) {
        console.log(`  = [${skip.skill}] -> ${skip.path} (${skip.reason})`);
      }
    } else if (command === 'uninstall') {
      const getArg = (flag) => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? args[idx + 1] : undefined;
      };
      const skillName = getArg('--skill');
      const packName = getArg('--pack');
      const all = args.includes('--all');
      const destDir = getArg('--dest') || '.';
      const sourceDir = getArg('--source') || getArg('--repo-root') || REPO_ROOT;
      const dryRun = args.includes('--dry-run');
      const force = args.includes('--force');

      const result = uninstallSkills({
        skillName,
        packName,
        all,
        destDir,
        dryRun,
        force,
        repoRoot: sourceDir,
      });

      if (!result.success) {
        console.error(`Uninstallation failed: ${result.error}`);
        process.exit(1);
      }

      console.log(dryRun ? '=== Planned Removals (Dry Run) ===' : '=== Uninstallation Complete ===');
      for (const item of result.actions) {
        console.log(`  - [${item.skill}] -> ${item.relPath}`);
      }
      for (const p of result.preserved) {
        console.log(`  ! [${p.skill}] -> ${p.path} (${p.reason})`);
      }
      for (const m of result.missing) {
        console.log(`  ? [${m.skill}] -> ${m.path} (${m.reason})`);
      }
    } else {
      console.log('Usage: node tools/skill-manager.mjs [list|sync|verify|install|uninstall] [options]');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
