import fs from 'node:fs';
import path from 'node:path';

/**
 * Synchronizes canonical skills from skills/ into .agents/skills/
 * to ensure OpenAI Codex and Agent Skills compatible environments
 * discover skills reliably without metadata or content drift.
 */
export function syncCodexSkills(rootDir = path.resolve('.')) {
  const srcDir = path.join(rootDir, 'skills');
  const destDir = path.join(rootDir, '.agents', 'skills');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const skillFolders = fs.readdirSync(srcDir);
  for (const folder of skillFolders) {
    const srcSkillPath = path.join(srcDir, folder, 'SKILL.md');
    if (!fs.existsSync(srcSkillPath)) continue;

    const targetFolder = path.join(destDir, folder);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const content = fs.readFileSync(srcSkillPath, 'utf8');
    fs.writeFileSync(path.join(targetFolder, 'SKILL.md'), content, 'utf8');
  }
}

