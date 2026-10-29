# EnvGuard Agent Skills & AI Integration Guide

EnvGuard provides installable AI Agent Skills that teach coding assistants how to inspect codebases for environment variables, generate safe schemas, detect secret leaks, and configure CI/CD pipelines safely.

---

## 1. Google Antigravity Installation

Google Antigravity discovers plugins via `plugin.json` in the project root or user configuration directories.

### Local Project Usage
1. Clone or add `envguard-node` to your workspace:
   ```bash
   git clone https://github.com/SIDDARTHA577/envguard-node.git
   ```
2. The Antigravity agent automatically detects `plugin.json` and exposes the 5 skills:
   - `envguard-audit`
   - `envguard-setup`
   - `envguard-review`
   - `envguard-ci`
   - `envguard-migrate`
3. Ask the assistant:
   > "Use envguard-audit to inspect this repository and recommend an environment schema."

---

## 2. Claude Code Installation

Claude Code uses `.claude-plugin/plugin.json` to register project-level and global tool extensions.

### Installation
Add the EnvGuard plugin to your Claude Code workspace:
```bash
claude plugin add SIDDARTHA577/envguard-node
```
Or symlink the repository into your local `.claude/plugins/` directory:
```bash
ln -s /path/to/envguard-node ~/.claude/plugins/envguard
```

### Usage
In any Claude Code session:
```text
/envguard-audit
/envguard-review
```

---

## 3. OpenAI Codex & Agents Standard

Agents supporting the `.agents/agent.json` specification read skill descriptors from `./skills/*/SKILL.md`.

### Usage
Reference the skill in your agent prompt or configuration:
```json
{
  "skills": ["./skills/envguard-audit/SKILL.md", "./skills/envguard-review/SKILL.md"]
}
```

---

## 4. Manual / Direct Skill Reference

If your AI coding agent does not support plugin manifests natively:
1. Provide the Markdown instructions from `skills/envguard-audit/SKILL.md` directly into the agent's context.
2. The skills are written in standardized GitHub-flavored Markdown with clear input/output constraints.

---

## 5. Security & Verification Note

- The agent plugin contains **zero telemetry** and makes **no outbound network requests**.
- All skills strictly prohibit displaying or committing actual `.env` files or decrypted secrets.
