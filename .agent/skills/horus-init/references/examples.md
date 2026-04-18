# horus.json Output Examples

Three real-world examples demonstrating the Eye of Horus protocol output for different project types.

## Example 1: Node.js + Next.js + Prisma

**Project structure signals:**
- `package.json` with scripts: dev, build, start, lint, typecheck, test, migrate, studio, seed
- `prisma/schema.prisma` exists
- `next.config.js` exists
- `.git` directory exists

```json
{
  "name": "My SaaS Dashboard",
  "description": "Next.js 14 dashboard with Prisma ORM and PostgreSQL",
  "sobre": "Full-stack SaaS dashboard built with Next.js 14 and TypeScript. Uses Prisma ORM for type-safe database access against PostgreSQL. Jest for testing, ESLint for code quality. Deployed via Vercel.",
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
          },
          {
            "comando": "npm run start",
            "descricao": "Runs the production build locally for final verification",
            "exemplo": "hrs run → select '🚀 Iniciar'",
            "tecnologia": "Next.js"
          }
        ]
      },
      {
        "titulo": "🗄️ Banco de Dados",
        "itens": [
          {
            "comando": "npm run migrate",
            "descricao": "Applies pending Prisma migrations to the database",
            "exemplo": "hrs run → select '🗄️ Migrar DB'",
            "tecnologia": "Prisma"
          },
          {
            "comando": "npm run studio",
            "descricao": "Opens Prisma Studio for visual database management",
            "exemplo": "hrs run → select '🎨 Studio'",
            "tecnologia": "Prisma"
          },
          {
            "comando": "npm run seed",
            "descricao": "Populates the database with initial test data",
            "exemplo": "hrs run → select '🌱 Seed DB'",
            "tecnologia": "Prisma"
          }
        ]
      }
    ],
    "glossario": [
      { "simbolo": "👁️", "significado": "Watch / Dev Mode — continuous file monitoring" },
      { "simbolo": "🚀", "significado": "Start / Launch — boots a service or application" },
      { "simbolo": "🏗️", "significado": "Build / Compilation — generates production artifacts" },
      { "simbolo": "🔍", "significado": "Quality — lint, typecheck, static analysis" },
      { "simbolo": "🧪", "significado": "Tests — unit, integration, E2E" },
      { "simbolo": "🗄️", "significado": "Database — migrations, seeds, schema tools" },
      { "simbolo": "🎨", "significado": "Studio — visual database management" },
      { "simbolo": "🌱", "significado": "Git / Seed — version control or data seeding" }
    ]
  },
  "tasks": [
    {
      "label": "👁️  Watch Mode",
      "cmd": "npm run dev",
      "hint": "Starts Next.js dev server with hot reload on port 3000",
      "group": "Desenvolvimento"
    },
    {
      "label": "🏗️  Build",
      "cmd": "npm run build",
      "hint": "Compiles TypeScript and generates optimized production bundle",
      "group": "Build"
    },
    {
      "label": "🚀 Iniciar",
      "cmd": "npm run start",
      "hint": "Runs the production build locally",
      "group": "Desenvolvimento"
    },
    {
      "label": "🔍 Lint",
      "cmd": "npm run lint",
      "hint": "Runs ESLint to check code quality and style violations",
      "group": "Qualidade"
    },
    {
      "label": "🔍 Typecheck",
      "cmd": "npm run typecheck",
      "hint": "Validates TypeScript types without emitting files",
      "group": "Qualidade"
    },
    {
      "label": "🧪 Testes",
      "cmd": "npm run test",
      "hint": "Runs the full test suite with Jest",
      "group": "Testes"
    },
    {
      "label": "🗄️  Migrar DB",
      "cmd": "npm run migrate",
      "hint": "Applies pending Prisma migrations to the database",
      "group": "Banco de Dados"
    },
    {
      "label": "🎨 Studio",
      "cmd": "npm run studio",
      "hint": "Opens Prisma Studio for visual database management",
      "group": "Banco de Dados"
    },
    {
      "label": "🌱 Seed DB",
      "cmd": "npm run seed",
      "hint": "Populates the database with initial test data",
      "group": "Banco de Dados"
    },
    {
      "label": "🌱 Git: Status",
      "cmd": "git status",
      "hint": "Shows the current state of the working tree",
      "group": "Git"
    },
    {
      "label": "🌱 Git: Log",
      "cmd": "git log --oneline -10",
      "hint": "Shows the last 10 commits in compact format",
      "group": "Git"
    }
  ]
}
```

## Example 2: Go + Docker

**Project structure signals:**
- `go.mod` exists (module: `github.com/acme/api-gateway`)
- `Dockerfile` exists
- `docker-compose.yml` with services: `api`, `postgres`, `redis`
- `Makefile` with targets: `build`, `run`, `test`, `lint`, `docker-up`, `docker-down`
- `scripts/migrate.sh` exists

```json
{
  "name": "API Gateway",
  "description": "Go API gateway with PostgreSQL and Redis via Docker",
  "tasks": [
    {
      "label": "🚀 Run Server",
      "cmd": "go run .",
      "hint": "Starts the Go API server in development mode",
      "group": "Desenvolvimento"
    },
    {
      "label": "🏗️  Build Binary",
      "cmd": "go build -o ./bin/api-gateway .",
      "hint": "Compiles the Go binary to ./bin/api-gateway",
      "group": "Build"
    },
    {
      "label": "🧪 Run Tests",
      "cmd": "go test ./...",
      "hint": "Runs all Go tests recursively across all packages",
      "group": "Testes"
    },
    {
      "label": "🔍 Lint (golangci)",
      "cmd": "make lint",
      "hint": "Runs golangci-lint for code quality checks",
      "group": "Qualidade"
    },
    {
      "label": "🐳 Docker: Up",
      "cmd": "docker-compose up -d",
      "hint": "Starts all services (api, postgres, redis) in background",
      "group": "Docker"
    },
    {
      "label": "🐳 Docker: Down",
      "cmd": "docker-compose down",
      "hint": "Stops and removes all containers and networks",
      "group": "Docker"
    },
    {
      "label": "🐳 Docker: Logs",
      "cmd": "docker-compose logs -f",
      "hint": "Follows real-time logs from all running services",
      "group": "Docker"
    },
    {
      "label": "🗄️  Migrate DB",
      "cmd": "./scripts/migrate.sh",
      "hint": "Applies pending database migrations via shell script",
      "group": "Banco de Dados"
    },
    {
      "label": "🌱 Git: Status",
      "cmd": "git status",
      "hint": "Shows the current state of the working tree",
      "group": "Git"
    }
  ]
}
```

## Example 3: Monorepo (Turborepo + 3 Apps)

**Project structure signals:**
- `turbo.json` exists
- `pnpm-workspace.yaml` exists
- `apps/web/package.json` (Next.js)
- `apps/api/package.json` (NestJS)
- `apps/mobile/package.json` (Expo)
- `packages/shared/package.json` (shared library)
- Root `package.json` with scripts: `dev`, `build`, `lint`, `test`, `db:migrate`, `db:seed`
- `docker-compose.yml` with services: `postgres`, `redis`

```json
{
  "name": "Acme Platform",
  "description": "Turborepo monorepo with Next.js, NestJS, and Expo apps",
  "tasks": [
    {
      "label": "👁️  Dev (All Apps)",
      "cmd": "pnpm run dev",
      "hint": "Starts all apps in dev mode via Turborepo parallel pipeline",
      "group": "Desenvolvimento"
    },
    {
      "label": "👁️  Dev (Web Only)",
      "cmd": "pnpm run dev --filter=web",
      "hint": "Starts only the Next.js web app in dev mode",
      "group": "Desenvolvimento"
    },
    {
      "label": "👁️  Dev (API Only)",
      "cmd": "pnpm run dev --filter=api",
      "hint": "Starts only the NestJS API in dev mode",
      "group": "Desenvolvimento"
    },
    {
      "label": "🏗️  Build (All)",
      "cmd": "pnpm run build",
      "hint": "Builds all apps and packages via Turborepo cached pipeline",
      "group": "Build"
    },
    {
      "label": "🔍 Lint (All)",
      "cmd": "pnpm run lint",
      "hint": "Runs ESLint across all apps and packages",
      "group": "Qualidade"
    },
    {
      "label": "🧪 Test (All)",
      "cmd": "pnpm run test",
      "hint": "Runs test suites across all apps via Turborepo",
      "group": "Testes"
    },
    {
      "label": "🗄️  Migrate DB",
      "cmd": "pnpm run db:migrate",
      "hint": "Applies pending Prisma migrations shared across apps",
      "group": "Banco de Dados"
    },
    {
      "label": "🌱 Seed DB",
      "cmd": "pnpm run db:seed",
      "hint": "Seeds the database with test data for development",
      "group": "Banco de Dados"
    },
    {
      "label": "🐳 Docker: Up (Infra)",
      "cmd": "docker-compose up -d",
      "hint": "Starts PostgreSQL and Redis containers for local dev",
      "group": "Docker"
    },
    {
      "label": "🐳 Docker: Down",
      "cmd": "docker-compose down",
      "hint": "Stops infrastructure containers",
      "group": "Docker"
    },
    {
      "label": "📱 Expo: Start",
      "cmd": "pnpm run dev --filter=mobile",
      "hint": "Starts the Expo development server for the mobile app",
      "group": "Desenvolvimento"
    },
    {
      "label": "📱 Expo: Prebuild",
      "cmd": "cd apps/mobile && npx expo prebuild",
      "hint": "Generates native iOS and Android project files",
      "group": "Build"
    },
    {
      "label": "🌱 Git: Status",
      "cmd": "git status",
      "hint": "Shows the current state of the working tree",
      "group": "Git"
    },
    {
      "label": "🌱 Git: Pull",
      "cmd": "git pull",
      "hint": "Fetches and merges latest changes from remote",
      "group": "Git"
    }
  ]
}
```

## Key Patterns to Notice

1. **Monorepo tasks** use `--filter=<app>` to scope to individual apps
2. **Docker tasks** always include Up, Down, and Logs for operational transparency
3. **Git tasks** are always included as universal diagnostics
4. **Labels** always start with an emoji followed by a human-friendly action
5. **Hints** explain the *purpose*, not just repeat the command
6. **Groups** use Portuguese names to match the Horus CLI's locale
