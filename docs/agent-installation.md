# EnvGuard Agent Skills & AI Integration Guide

EnvGuard provides installable AI Agent Skills that guide coding assistants to inspect codebases for environment variables, generate safe schemas, detect secret leaks, and configure CI/CD pipelines safely.

---

## 1. Google Antigravity Installation (Verified)

Google Antigravity discovers plugins via `plugin.json` in the project root or local configuration directory.

### Local Project Usage
1. Clone or add `envguard-node` to your workspace:
   ```bash
   git clone https://github.com/SIDDARTHA577/envguard-node.git
   ```
2. The Antigravity agent discovers `plugin.json` and exposes the 5 skills:
   - `envguard-audit`
   - `envguard-setup`
   - `envguard-review`
   - `envguard-ci`
   - `envguard-migrate`
3. Suggested prompts supported by the manifest:
   > "Audit this project's environment variables with envguard-audit"  
   > "Configure startup environment validation with envguard-setup"  
   > "Review my environment variable security and .gitignore with envguard-review"

---

## 2. OpenAI Codex / Agent Skills Standard (Verified File Discovery)

Codex and agents supporting the Agent Skills standard look for skills in the project's `.agents/skills/` directory.

### Discovery via Synchronized Skills
- EnvGuard automatically synchronizes all skills from `skills/` into `.agents/skills/<skill-name>/SKILL.md` during the build process (`npm run build`).
- `.agents/agent.json` declares the manifest and schema mapping.

### Adding Skills to Another Project
To make EnvGuard skills available in your target project:
```bash
# Copy the verified .agents/skills directory into your project
cp -r /path/to/envguard-node/.agents/skills your-project/.agents/skills
```

---

## 3. Claude Code Installation (Local Manual Directory Workflow)

Claude Code supports project-level tool extensions defined via `.claude-plugin/plugin.json`.

> [!NOTE]
> Centralized marketplace installation (`claude plugin add`) is pending public registry availability. The tested, reliable method today is the local project configuration path below.

### Local Installation
1. Symlink or copy the `.claude-plugin` directory and `skills` directory into your project root:
   ```bash
   cp -r /path/to/envguard-node/.claude-plugin your-project/.claude-plugin
   cp -r /path/to/envguard-node/skills your-project/skills
   ```
2. In your Claude Code session, reference the skills directly:
   - Use `/envguard-audit` to inspect environment reads.
   - Use `/envguard-setup` to configure initialization.

---

## 4. Manual / Direct Skill Reference

If your AI coding agent does not support plugin manifests natively:
- You can provide the Markdown instructions from `skills/envguard-audit/SKILL.md` directly into the agent's context.
- All skills use standard GitHub-flavored Markdown with clear input/output constraints.

---

## 5. Security & Privacy Note

- All agent skills contain **zero telemetry** and make **no outbound network calls**.
- All skills strictly prohibit displaying or committing real `.env` files, production credentials, or decrypted secrets.
