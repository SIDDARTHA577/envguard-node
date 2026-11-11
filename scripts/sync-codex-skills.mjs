import path from 'node:path';
import { syncSkills } from '../tools/skill-manager.mjs';

/**
 * Synchronizes canonical skills into .agents/skills/
 * to ensure OpenAI Codex and Agent Skills compatible environments
 * discover skills reliably without metadata or content drift.
 *
 * @param {string} [rootDir]
 */
export function syncCodexSkills(rootDir = path.resolve('.')) {
  return syncSkills({ repoRoot: rootDir });
}
