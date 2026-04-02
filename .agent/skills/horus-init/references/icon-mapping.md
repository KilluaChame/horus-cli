# Icon-to-Category Mapping

Complete reference table for assigning emojis to task labels based on their semantic intent.

## Primary Mapping (Mandatory)

| Icon | Category | When to Use | Example Labels |
|------|----------|-------------|----------------|
| 🚀 | Start / Launch | Starting servers, launching apps, booting infrastructure | `🚀 Start Server`, `🚀 Launch App` |
| 👁️ | Watch / Dev Mode | Development servers with hot reload or file watchers | `👁️  Watch Mode`, `👁️  Dev Server` |
| 🏗️ | Build / Compile | Compilation, bundling, static generation, transpilation | `🏗️  Build`, `🏗️  Compile TypeScript` |
| 🧪 | Test | Unit tests, E2E tests, integration tests, coverage | `🧪 Run Tests`, `🧪 E2E Tests` |
| 🔍 | Quality / Lint | Linting, typechecking, formatting, code analysis | `🔍 Lint`, `🔍 Typecheck` |
| 📦 | Deploy / Release | Publishing, deployment, releases, export | `📦 Deploy`, `📦 Publish to npm` |
| 🗄️ | Database | Migrations, seeds, schema generation, DB studio tools | `🗄️  Migrate DB`, `🗄️  Seed Data` |
| ⚙️ | Script / Generic | Custom scripts, executables, utilities, automation | `⚙️  Run Script`, `⚙️  Generate Types` |
| 🐳 | Docker | Container operations, compose, image building | `🐳 Docker: Up`, `🐳 Build Image` |
| 🌱 | Git | Version control operations, status, log, branching | `🌱 Git: Status`, `🌱 Git: Pull` |

## Secondary Mapping (Optional — Use When Specific)

| Icon | Category | When to Use |
|------|----------|-------------|
| 🎨 | Studio / Visual | Visual database tools (Prisma Studio), design tools |
| 📱 | Mobile | Expo, React Native, Flutter specific commands |
| 🐍 | Python | Python-specific commands (pytest, pip, uvicorn) |
| 🦀 | Rust | Rust-specific commands (cargo build, cargo test) |
| 🐹 | Go | Go-specific commands (go run, go build, go test) |
| 🟣 | .NET | .NET-specific commands (dotnet build, dotnet run) |
| ✨ | Format | Code formatters (prettier, black, rustfmt) |
| 🧹 | Clean | Cleanup commands (rm dist, cargo clean) |
| 🛡️ | Security | Security audit, vulnerability scan |

## Inference Rules

Use these rules to determine the correct icon when the script name is ambiguous:

1. **Script name contains `dev` or `serve`** → 👁️ (Watch/Dev)
2. **Script name contains `start`** → 🚀 (Start)
3. **Script name contains `build` or `compile`** → 🏗️ (Build)
4. **Script name contains `test` or `spec`** → 🧪 (Test)
5. **Script name contains `lint` or `check` or `type`** → 🔍 (Quality)
6. **Script name contains `deploy` or `publish` or `release`** → 📦 (Deploy)
7. **Script name contains `migrate` or `seed` or `db` or `prisma`** → 🗄️ (Database)
8. **Script name contains `docker` or `compose`** → 🐳 (Docker)
9. **Script name contains `format` or `prettier` or `fmt`** → ✨ (Format)
10. **Script name contains `clean`** → 🧹 (Clean)
11. **Fallback for unrecognized scripts** → ⚙️ (Generic)

## Group Names (Portuguese — Horus CLI Standard)

Groups MUST use these Portuguese names to match the Horus CLI interface:

| English Concept | Group Name to Use |
|-----------------|-------------------|
| Development | `Desenvolvimento` |
| Build | `Build` |
| Quality | `Qualidade` |
| Tests | `Testes` |
| Database | `Banco de Dados` |
| Docker | `Docker` |
| Git | `Git` |
| Deploy | `Deploy` |
| Automation | `Automação` |

## Label Formatting Rules

1. **Always start with an emoji** — no exceptions
2. **Use a space after the emoji** — e.g., `🚀 Start` not `🚀Start`
3. **Keep labels under 50 characters** — the CLI terminal has limited width
4. **Use verbs** — `🏗️  Build` not `🏗️  Builder`
5. **Include the technology in parentheses when disambiguation is needed** — e.g., `🏗️  Build (Docker)` vs `🏗️  Build (Next.js)`
6. **For Docker commands, use the `Service: Action` pattern** — e.g., `🐳 Docker: Up`, `🐳 Docker: Logs`
