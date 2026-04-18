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

export const AjudaItemSchema = z.object({
  comando:    z.string().min(1, 'Help command cannot be empty'),
  descricao:  z.string().min(1, 'Help description cannot be empty'),
  exemplo:    z.string().min(1, 'Help example cannot be empty'),
  tecnologia: z.string().min(1, 'Help technology cannot be empty'),
});

export const AjudaCategoriaSchema = z.object({
  titulo: z.string().min(1, 'Category title cannot be empty'),
  itens:  z.array(AjudaItemSchema).min(1).max(6, 'Max 6 items per category'),
});

export const GlossarioItemSchema = z.object({
  simbolo:     z.string().min(1),
  significado: z.string().min(1),
});

export const AjudaSchema = z.object({
  categorias: z.array(AjudaCategoriaSchema).min(1).max(8, 'Max 8 categories'),
  glossario:  z.array(GlossarioItemSchema).optional(),
});

export const HorusConfigSchema = z.object({
  name:        z.string().min(1, 'Project name cannot be empty'),
  description: z.string().optional(),
  sobre:       z.string().optional(),
  ajuda:       AjudaSchema.optional(),
  tasks:       z.array(TaskSchema).min(1, 'Define at least 1 task in "tasks"'),
});
```

## Field Specifications

### Root Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | `string` | ✅ Yes | Min 1 char. Human-readable project name. No underscores — use spaces. |
| `description` | `string` | ❌ No | Concise description, recommended max 80 chars. |
| `sobre` | `string` | ❌ No | Rich branding text displayed as a welcome banner above the task menu. Mentions key technologies. Max 400 chars recommended. |
| `ajuda` | `Ajuda` | ❌ No | Contextual help guide with navigable categories and symbol glossary. |
| `tasks` | `Task[]` | ✅ Yes | Array with minimum 1 task. Recommended max 15 tasks. |

### Task Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `label` | `string` | ✅ Yes | Min 1 char. Format: `[Emoji] [Friendly Action]`. Max 50 chars recommended. |
| `cmd` | `string` | ✅ Yes | Min 1 char. Exact shell command. Supports pipes (`\|`), operators (`&&`, `\|\|`), and inline env vars. |
| `hint` | `string` | ❌ No | Semantic explanation of what the command does. Strongly recommended. |
| `group` | `string` | ❌ No | Category for visual grouping in the CLI menu. Strongly recommended. |

### Ajuda Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `categorias` | `AjudaCategoria[]` | ✅ Yes | Min 1, max 8 categories. Each groups related commands. |
| `glossario` | `GlossarioItem[]` | ❌ No | Maps emoji symbols to their meanings in the CLI UI. |

### AjudaCategoria Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `titulo` | `string` | ✅ Yes | Category title with emoji prefix (e.g., `🛠 Desenvolvimento`). |
| `itens` | `AjudaItem[]` | ✅ Yes | Min 1, max 6 items per category. |

### AjudaItem Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `comando` | `string` | ✅ Yes | The exact shell command being documented. |
| `descricao` | `string` | ✅ Yes | Clear description of what the command does. |
| `exemplo` | `string` | ✅ Yes | Usage example via Horus CLI (e.g., `hrs run → select 'Watch Mode'`). |
| `tecnologia` | `string` | ✅ Yes | The tool/library used by the command (e.g., `tsup`, `Docker`). |

### GlossarioItem Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `simbolo` | `string` | ✅ Yes | The emoji symbol used in task labels. |
| `significado` | `string` | ✅ Yes | What the symbol represents in the UI. |

## Validation Rules

1. **name** must be human-readable: `"My Cool App"` not `"my_cool_app"` or `"/home/user/project"`
2. **cmd** accepts any valid shell string — the Horus CLI executor handles shell parsing
3. **label** should start with an emoji for visual consistency in the terminal UI
4. **tasks** array must not be empty — a `horus.json` with zero tasks is invalid
5. **hint** should explain the command *semantically*, not just repeat the command
6. **sobre** should mention the project's real technologies and sound professional
7. **ajuda** categories should match the task groups for consistency

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
  "sobre": "Full-stack application powered by Next.js 14 with TypeScript, Prisma ORM for database access, and Docker for containerized infrastructure. Uses Vitest for testing and ESLint for code quality.",
  "ajuda": {
    "categorias": [
      {
        "titulo": "🛠 Desenvolvimento",
        "itens": [
          {
            "comando": "npm run dev",
            "descricao": "Starts Next.js dev server with hot reload on port 3000",
            "exemplo": "hrs run → select '👁️ Watch Mode'",
            "tecnologia": "Next.js"
          }
        ]
      }
    ],
    "glossario": [
      { "simbolo": "👁️", "significado": "Watch / Dev Mode — continuous file monitoring" },
      { "simbolo": "🏗️", "significado": "Build / Compilation" }
    ]
  },
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
| `"Max 8 categories"` | `ajuda.categorias` has > 8 entries | Reduce to 8 or fewer categories |
| `"Max 6 items per category"` | A category has > 6 items | Reduce to 6 or fewer items |
