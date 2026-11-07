# EnvGuard Agent Skills & AI Integration Guide

EnvGuard provides installable AI Agent Skills that guide coding assistants to inspect codebases for environment variables, generate safe schemas, detect secret leaks, and configure CI/CD pipelines safely.

---

## 1. Host Compatibility Matrix

The table below distinguishes between validated manifest syntax, successful local installation, native skill discovery, interactive invocation, and completed end-to-end workflows:

| Agent Host | Manifest Validated | Installed Successfully | Skill Discovered | Skill Invoked | Example Workflow Completed | Verification Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Google Antigravity** | Yes | Yes | Yes | Yes | Yes | Verified via root `plugin.json` and project skill loading in active IDE environment. |
| **OpenAI Codex** | Yes | Yes | Yes | Yes | Yes | Verified via `.agents/skills/` directory structure and Agent Skills specification. |
| **Claude Code** | Yes | Yes | Yes | Yes | Yes | Verified via `.claude-plugin/plugin.json` and local project directory copying/linking. |
| **Cursor** | Yes | Yes | Yes | Unverified | Unverified | Directory conventions validated; native automated invocation in Cursor runtime unverified. |

---

## 2. Installing Skills with the Local Installer

EnvGuard includes a portable Node.js tool (`tools/skill-manager.mjs`) to install skills into any target project:

```bash
# Preview installation without modifying files (Dry Run)
node tools/skill-manager.mjs install --pack core --dest /path/to/my-project --dry-run

# Install core pack for OpenAI Codex (.agents/skills/)
node tools/skill-manager.mjs install --pack core --dest /path/to/my-project --target codex

# Install production readiness pack (includes bundled readiness auditor)
node tools/skill-manager.mjs install --pack production --dest /path/to/my-project --target codex

# Install core pack for Google Antigravity or Claude Code (skills/)
node tools/skill-manager.mjs install --pack core --dest /path/to/my-project --target antigravity

# Install a single skill
node tools/skill-manager.mjs install --skill envguard-audit --dest /path/to/my-project

# Run the bundled readiness auditor in target project
node /path/to/my-project/.agents/skills/envguard-production-readiness/scripts/readiness-auditor.mjs scan --project /path/to/my-project

# Preview planned commands and effects without execution
node /path/to/my-project/.agents/skills/envguard-production-readiness/scripts/readiness-auditor.mjs scan --project /path/to/my-project --preview-commands

# Remove installed skills cleanly
node tools/skill-manager.mjs uninstall --pack production --dest /path/to/my-project
```

All installations write `.envguard-skills.json` tracking metadata to ensure idempotent updates and safe removals.

---

## 3. Host-Specific Guidelines

### Google Antigravity (Verified)
Google Antigravity discovers plugins via `plugin.json` in the project root or local configuration directory.
- Root `plugin.json` registers canonical skills located in `skills/`.
- Suggested prompts are exposed in the AI chat palette:
  > "Audit this project's environment variables with envguard-audit"  
  > "Configure startup environment validation with envguard-setup"  
  > "Review my environment variable security and .gitignore with envguard-review"

### OpenAI Codex & Agent Skills Specification (Verified)
Agents conforming to the Agent Skills standard look for skills in `.agents/skills/`:
- EnvGuard synchronizes canonical skills into `.agents/skills/<skill-name>/SKILL.md`.
- Run `npm run skills:sync` or `node tools/skill-manager.mjs sync` to update.
- Metadata is declared in `.agents/agent.json`.

### Claude Code (Verified Directory Workflow)
Claude Code supports project-level extensions via `.claude-plugin/plugin.json` and local skills:
```bash
# Copy plugin manifest and skills into target project
node tools/skill-manager.mjs install --pack core --dest /path/to/my-project --target claude
```
Reference skills directly in Claude Code:
- `/envguard-audit` to inspect environment reads.
- `/envguard-setup` to configure initialization.

### Cursor (Documented Integration Path)
Cursor projects can include skill instructions inside project rules (e.g. `.cursor/rules/`) or refer to `skills/<name>/SKILL.md` directly. While manifest compatibility and files are verified, automated runtime execution in Cursor remains unverified.

---

## 4. Security & Privacy Note

- All agent skills contain **zero telemetry** and make **no outbound network calls**.
- All skills strictly prohibit displaying or committing real `.env` files, production credentials, or decrypted secrets.
