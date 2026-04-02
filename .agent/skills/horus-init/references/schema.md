# horus.json Schema Reference

This document contains the complete Zod schema specification for the `horus.json` file used by Horus CLI.

## TypeScript Zod Definition (Source of Truth)

```typescript
import { z } from 'zod';

export const TaskSchema = z.object({
  label: z.string().min(1, 'Task label cannot be empty'),
  cmd:   z.string().min(1, 'Command cannot be empty'),
  hint:  z.string().optional(),
  group: z.string().optional(),
});

export const HorusConfigSchema = z.object({
  name:        z.string().min(1, 'Project name cannot be empty'),
  description: z.string().optional(),
  tasks:       z.array(TaskSchema).min(1, 'Define at least 1 task in "tasks"'),
});
```

## Field Specifications

### Root Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | `string` | ✅ Yes | Min 1 char. Human-readable project name. No underscores — use spaces. |
| `description` | `string` | ❌ No | Concise description, recommended max 80 chars. |
| `tasks` | `Task[]` | ✅ Yes | Array with minimum 1 task. Recommended max 15 tasks. |

### Task Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `label` | `string` | ✅ Yes | Min 1 char. Format: `[Emoji] [Friendly Action]`. Max 50 chars recommended. |
| `cmd` | `string` | ✅ Yes | Min 1 char. Exact shell command. Supports pipes (`\|`), operators (`&&`, `\|\|`), and inline env vars. |
| `hint` | `string` | ❌ No | Semantic explanation of what the command does. Strongly recommended. |
| `group` | `string` | ❌ No | Category for visual grouping in the CLI menu. Strongly recommended. |

## Validation Rules

1. **name** must be human-readable: `"My Cool App"` not `"my_cool_app"` or `"/home/user/project"`
2. **cmd** accepts any valid shell string — the Horus CLI executor handles shell parsing
3. **label** should start with an emoji for visual consistency in the terminal UI
4. **tasks** array must not be empty — a `horus.json` with zero tasks is invalid
5. **hint** should explain the command *semantically*, not just repeat the command

## JSON Example (Minimal Valid)

```json
{
  "name": "My Project",
  "tasks": [
    {
      "label": "🚀 Start",
      "cmd": "npm run start"
    }
  ]
}
```

## JSON Example (Full Featured)

```json
{
  "name": "My Full Stack App",
  "description": "Next.js frontend with Prisma ORM and Docker infrastructure",
  "tasks": [
    {
      "label": "👁️  Watch Mode",
      "cmd": "npm run dev",
      "hint": "Starts Next.js dev server with hot reload",
      "group": "Desenvolvimento"
    },
    {
      "label": "🏗️  Build",
      "cmd": "npm run build",
      "hint": "Compiles TypeScript and bundles for production",
      "group": "Build"
    }
  ]
}
```

## Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `"Project name cannot be empty"` | `name` is `""` or missing | Provide a non-empty project name |
| `"Task label cannot be empty"` | A task has `label: ""` | Every task needs a descriptive label |
| `"Command cannot be empty"` | A task has `cmd: ""` | Every task needs an executable command |
| `"Define at least 1 task"` | `tasks` is `[]` | Add at least one task to the array |
