# EnvGuard Skill Manager & Local Installer Guide

The `tools/skill-manager.mjs` script provides a local, portable lifecycle manager for EnvGuard developer skills. It works directly from a local Git clone or checkout before any npm publication.

---

## 1. Quick Commands

```bash
# List available packs and skills
node tools/skill-manager.mjs list

# Synchronize canonical skills to .agents/skills/
node tools/skill-manager.mjs sync

# Verify all skills against quality rules and schema
node tools/skill-manager.mjs verify
```

---

## 2. Installing Skills

### Install a Single Skill
```bash
# Preview what would be installed (dry run)
node tools/skill-manager.mjs install --skill envguard-audit --dest /path/to/my-project --dry-run

# Install into target project for OpenAI Codex / Agent Skills
node tools/skill-manager.mjs install --skill envguard-audit --dest /path/to/my-project --target codex

# Install into target project for Antigravity or Claude Code
node tools/skill-manager.mjs install --skill envguard-audit --dest /path/to/my-project --target antigravity
```

### Install an Entire Pack
```bash
# Install the core configuration pack
node tools/skill-manager.mjs install --pack core --dest /path/to/my-project

# Install all available developer skills
node tools/skill-manager.mjs install --pack all --dest /path/to/my-project
```

### Conflict Protection & Force Overwrite
If a skill file already exists in the destination directory and was not installed by EnvGuard, the installer will abort to prevent overwriting user modifications.

To force overwrite:
```bash
node tools/skill-manager.mjs install --skill envguard-audit --dest /path/to/my-project --force
```

---

## 3. Metadata & Idempotency

When skills are installed into a destination project, the installer records tracking metadata in `.envguard-skills.json`:

```json
{
  "managedBy": "envguard",
  "version": "1.0.0",
  "skills": {
    "envguard-audit": {
      "installedAt": "2026-11-07T07:54:00.000Z",
      "targetHost": "codex",
      "files": [
        {
          "path": ".agents/skills/envguard-audit/SKILL.md",
          "sha256": "3a7b...12c9"
        }
      ]
    }
  }
}
```

- Re-running the installer when files are identical performs 0 writes and reports `already up to date`.
- Files not tracked in metadata are never modified without `--force`.

---

## 4. Uninstalling Skills

```bash
# Preview uninstallation
node tools/skill-manager.mjs uninstall --skill envguard-audit --dest /path/to/my-project --dry-run

# Uninstall a specific skill
node tools/skill-manager.mjs uninstall --skill envguard-audit --dest /path/to/my-project

# Uninstall an entire pack
node tools/skill-manager.mjs uninstall --pack core --dest /path/to/my-project

# Uninstall all EnvGuard-managed skills and remove tracking metadata
node tools/skill-manager.mjs uninstall --all --dest /path/to/my-project
```
The uninstaller removes only files registered in `.envguard-skills.json` and automatically prunes empty parent directories.

