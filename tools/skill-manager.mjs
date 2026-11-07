#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const CATALOG_DIR = path.join(REPO_ROOT, 'catalog');
const PACKS_PATH = path.join(CATALOG_DIR, 'packs.json');
const SKILLS_PATH = path.join(CATALOG_DIR, 'skills.json');

const REQUIRED_SECTIONS = [
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
export function loadPacks() {
  if (!fs.existsSync(PACKS_PATH)) return [];
  return JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
}

/**
 * Loads skills registry.
 */
export function loadSkills() {
  if (!fs.existsSync(SKILLS_PATH)) return [];
  return JSON.parse(fs.readFileSync(SKILLS_PATH, 'utf8'));
}

/**
 * Computes sha256 checksum of content.
 */
export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Parses basic YAML frontmatter from Markdown.
 */
export function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return null;
  const raw = content.slice(3, endIdx).trim();
  const fields = {};
  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const k = line.slice(0, colon).trim();
      const v = line.slice(colon + 1).trim();
      fields[k] = v;
    }
  }
  return {
    frontmatter: fields,
    body: content.slice(endIdx + 3).trim(),
  };
}

/**
 * Synchronizes canonical skills to .agents/skills/ and updates host manifests.
 */
export function syncSkills(repoRoot = REPO_ROOT) {
  const skills = loadSkills();
  const agentsSkillsDir = path.join(repoRoot, '.agents', 'skills');

  if (!fs.existsSync(agentsSkillsDir)) {
    fs.mkdirSync(agentsSkillsDir, { recursive: true });
  }

  let syncedCount = 0;

  for (const skill of skills) {
    const srcDir = path.join(repoRoot, skill.canonicalDir);
    const srcSkill = path.join(srcDir, 'SKILL.md');
    if (!fs.existsSync(srcSkill)) continue;

    const destDir = path.join(agentsSkillsDir, skill.name);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const content = fs.readFileSync(srcSkill, 'utf8');
    const destSkill = path.join(destDir, 'SKILL.md');
    fs.writeFileSync(destSkill, content, 'utf8');
    syncedCount++;

    // Copy any scripts or references if present
    for (const sub of ['scripts', 'references']) {
      const subSrc = path.join(srcDir, sub);
      if (fs.existsSync(subSrc)) {
        const subDest = path.join(destDir, sub);
        if (!fs.existsSync(subDest)) fs.mkdirSync(subDest, { recursive: true });
        for (const file of fs.readdirSync(subSrc)) {
          fs.copyFileSync(path.join(subSrc, file), path.join(subDest, file));
        }
      }
    }
  }

  return { syncedCount };
}

/**
 * Verifies quality, frontmatter, and completeness across all skills.
 */
export function verifySkills(repoRoot = REPO_ROOT) {
  const skills = loadSkills();
  const packs = loadPacks();
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

    // 4. Validate SKILL.md contents
    const rawContent = fs.readFileSync(canonicalPath, 'utf8');
    const parsed = parseFrontmatter(rawContent);

    if (!parsed) {
      errors.push(`Skill ${skill.name} has missing or malformed YAML frontmatter.`);
      continue;
    }

    if (parsed.frontmatter.name !== skill.name) {
      errors.push(
        `Skill ${skill.name} frontmatter name mismatch: expected "${skill.name}", got "${parsed.frontmatter.name}"`
      );
    }

    if (!parsed.frontmatter.description) {
      errors.push(`Skill ${skill.name} frontmatter is missing 'description' field.`);
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
      if (agentsContent !== rawContent) {
        errors.push(
          `Skill ${skill.name} is out of sync between ${skill.canonicalDir} and .agents/skills/${skill.name}.`
        );
      }
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
 * Validates destination directory against path traversal attacks.
 */
export function assertSafeDestination(destDir, subPath = '') {
  const resolvedBase = path.resolve(destDir);
  const resolvedTarget = path.resolve(resolvedBase, subPath);
  const relative = path.relative(resolvedBase, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path traversal attempt detected: "${subPath}" escapes destination "${destDir}"`);
  }
  return resolvedTarget;
}

/**
 * Installs skills into target destination with safety and idempotency.
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
  const allSkills = loadSkills();
  const allPacks = loadPacks();

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
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch {
      // Malformed metadata
    }
  }

  const plan = {
    actions: [],
    skipped: [],
    errors: [],
  };

  for (const skill of targetSkills) {
    const srcDir = path.join(repoRoot, skill.canonicalDir);
    const srcSkill = path.join(srcDir, 'SKILL.md');

    if (!fs.existsSync(srcSkill)) {
      plan.errors.push(`Canonical skill file missing: ${srcSkill}`);
      continue;
    }

    const content = fs.readFileSync(srcSkill, 'utf8');
    const hash = sha256(content);

    // Determine target relative destination according to targetHost
    let targetRelDir;
    if (targetHost === 'antigravity' || targetHost === 'claude') {
      targetRelDir = path.join('skills', skill.name);
    } else {
      // Default to Agent Skills / Codex standard
      targetRelDir = path.join('.agents', 'skills', skill.name);
    }

    const targetDestDir = assertSafeDestination(safeDestRoot, targetRelDir);
    const targetFilePath = assertSafeDestination(targetDestDir, 'SKILL.md');
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

      // If file exists and differs, check if managed
      const isManaged = metadata.skills[skill.name]?.files?.some(
        (f) => f.path === relativeToDest
      );

      if (!isManaged && !force) {
        plan.errors.push(
          `Conflict: "${relativeToDest}" already exists and is not managed by EnvGuard. Use --force to overwrite.`
        );
        continue;
      }
    }

    plan.actions.push({
      action: 'install',
      skill: skill.name,
      src: srcSkill,
      dest: targetFilePath,
      relPath: relativeToDest,
      content,
      hash,
    });
  }

  if (plan.errors.length > 0) {
    return { success: false, plan };
  }

  if (!dryRun) {
    if (!fs.existsSync(safeDestRoot)) {
      fs.mkdirSync(safeDestRoot, { recursive: true });
    }

    for (const item of plan.actions) {
      const dir = path.dirname(item.dest);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(item.dest, item.content, 'utf8');

      if (!metadata.skills[item.skill]) {
        metadata.skills[item.skill] = {
          installedAt: new Date().toISOString(),
          targetHost,
          files: [],
        };
      }

      metadata.skills[item.skill].files = [
        { path: item.relPath, sha256: item.hash },
      ];
    }

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  }

  return { success: true, plan };
}

/**
 * Uninstalls managed skills from target destination.
 */
export function uninstallSkills({
  skillName,
  packName,
  all = false,
  destDir = '.',
  dryRun = false,
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
  } catch (err) {
    return { success: false, error: `Invalid metadata file: ${err.message}` };
  }

  const allSkills = loadSkills();
  const allPacks = loadPacks();

  let toRemove = [];

  if (all) {
    toRemove = Object.keys(metadata.skills || {});
  } else if (skillName) {
    toRemove = [skillName];
  } else if (packName) {
    const pack = allPacks.find((p) => p.id === packName);
    if (!pack) {
      return { success: false, error: `Pack "${packName}" not found.` };
    }
    toRemove = pack.skills.filter((s) => metadata.skills[s]);
  } else {
    return { success: false, error: 'Specify --skill, --pack, or --all to uninstall.' };
  }

  const actions = [];

  for (const name of toRemove) {
    const record = metadata.skills?.[name];
    if (!record) continue;

    for (const file of record.files || []) {
      const targetPath = assertSafeDestination(safeDestRoot, file.path);
      actions.push({
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
        // Clean empty directory
        const parent = path.dirname(item.path);
        try {
          if (fs.readdirSync(parent).length === 0) {
            fs.rmdirSync(parent);
          }
        } catch {}
      }
      delete metadata.skills[item.skill];
    }

    if (Object.keys(metadata.skills || {}).length === 0) {
      fs.unlinkSync(metadataPath);
    } else {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    }
  }

  return { success: true, actions };
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
      const result = syncSkills();
      console.log(`Successfully synchronized ${result.syncedCount} skills to .agents/skills/.`);
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
      const dryRun = args.includes('--dry-run');
      const force = args.includes('--force');

      const result = installSkills({
        skillName,
        packName,
        destDir,
        targetHost,
        dryRun,
        force,
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
      const dryRun = args.includes('--dry-run');

      const result = uninstallSkills({
        skillName,
        packName,
        all,
        destDir,
        dryRun,
      });

      if (!result.success) {
        console.error(`Uninstallation failed: ${result.error}`);
        process.exit(1);
      }

      console.log(dryRun ? '=== Planned Removals (Dry Run) ===' : '=== Uninstallation Complete ===');
      for (const item of result.actions) {
        console.log(`  - [${item.skill}] -> ${item.relPath}`);
      }
    } else {
      console.log('Usage: node tools/skill-manager.mjs [list|sync|verify|install|uninstall] [options]');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

