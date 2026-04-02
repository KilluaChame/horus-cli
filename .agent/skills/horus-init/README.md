# horus-init

> **The Eye of Horus** — Teaches any AI agent to generate a perfect `horus.json` execution contract for the [Horus CLI](https://github.com/KilluaChame/horus-cli) task runner.

## What is this?

This is a cross-platform **agent skill** that instructs AI coding assistants (Cursor, Windsurf, GitHub Copilot, Claude, Gemini CLI, etc.) on how to analyze a software project and produce a validated `horus.json` file — the task manifest used by the Horus CLI.

## Installation

### Antigravity / Gemini CLI
```bash
# Already included in this repository at .agent/skills/horus-init/
# If you want to install globally:
cp -R .agent/skills/horus-init ~/.agents/skills/horus-init
```

### Cursor
```bash
cp -R .agent/skills/horus-init .cursor/rules/horus-init
```

### Windsurf
```bash
cp -R .agent/skills/horus-init .windsurf/rules/horus-init
```

### Claude Code
```bash
cp -R .agent/skills/horus-init ~/.claude/skills/horus-init
```

### GitHub Copilot
```bash
cp -R .agent/skills/horus-init .github/skills/horus-init
```

### VS Code Copilot (Chat)
```bash
cp -R .agent/skills/horus-init .github/skills/horus-init
```

### Universal (any SKILL.md-compatible agent)
```bash
cp -R .agent/skills/horus-init ~/.agents/skills/horus-init
```

## Usage

After installation, open your AI coding assistant and type:

```
/horus-init
```

Or ask naturally:

```
Create the horus.json for this project
Initialize Horus for this repo
Generate the task contract
```

The AI will analyze the project, detect the tech stack, and generate a validated `horus.json` with categorized tasks, emoji labels, and semantic hints.

## What gets generated

A `horus.json` file at the project root containing:

- **name** — Human-readable project name
- **description** — Concise project description
- **tasks** — Array of categorized tasks with:
  - `label` — Emoji-prefixed friendly action name
  - `cmd` — Exact shell command to execute
  - `hint` — Semantic explanation of what the command does
  - `group` — Category for visual grouping (Desenvolvimento, Build, Qualidade, etc.)

## Supported Stacks

Node.js, Next.js, Vite, Expo, NestJS, Go, Rust, Python, .NET, Docker, Makefile, Taskfile, Turborepo, pnpm workspaces, Lerna, and any polyglot combination.

## License

MIT
