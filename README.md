<div align="center">

```
    ██╗  ██╗ ██████╗ ██████╗ ██╗   ██╗███████╗
    ██║  ██║██╔═══██╗██╔══██╗██║   ██║██╔════╝
    ███████║██║   ██║██████╔╝██║   ██║███████╗
    ██╔══██║██║   ██║██╔══██╗██║   ██║╚════██║
    ██║  ██║╚██████╔╝██║  ██║╚██████╔╝███████║
    ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
```

**The All-Seeing Gateway**

_Navegação visual, execução delegada._

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

</div>

---

## O Problema

Você troca de repositório e precisa rodar o projeto. Mas qual script era mesmo? `npm run dev`? `docker-compose up`? `make start`? O horus acaba com essa fricção cognitiva: um único comando (`hrs`) descobre e lista o que está disponível — você só precisa apontar e pressionar Enter.

> **Filosofia**: O `horus` é o controle remoto. O projeto é a TV.
> Ele não executa, ele delega — com total transparência de logs e saída.

---

## Instalação

### Via npm link (Desenvolvimento)

```bash
# 1. Clone o repositório
git clone https://github.com/KilluaChame/horus-cli.git
cd horus-cli

# 2. Instale as dependências
npm install

# 3. Compile o projeto
npm run build

# 4. Registre o comando hrs globalmente no seu sistema
npm link
```

Após o `npm link`, o comando `hrs` estará disponível em **qualquer diretório** do seu terminal, sem necessidade de `npx` ou caminhos absolutos.

### Via npm (Produção)

```bash
# Instalação global direta
npm install -g horus-cli

# Ou execução pontual sem instalação
npx horus-cli
```

### Verificação

```bash
hrs help
```

Se o banner ASCII aparecer, a instalação foi um sucesso.

---

## Developer Experience: Como o `npm link` funciona

Quando você roda `npm link` dentro do diretório do projeto, o npm cria um **symlink global** que aponta para o seu `dist/bin/horus.js` compilado. Isso significa:

1. O executável `hrs` é adicionado ao `PATH` do sistema (no mesmo lugar onde ficam outros binários globais do npm, como `tsc` ou `eslint`).
2. Qualquer alteração no código TypeScript, após um `npm run build`, é refletida **imediatamente** no `hrs` global — sem reinstalar.
3. Para remover o symlink: `npm unlink -g horus-cli`

```
Terminal: hrs
    │
    ▼
~/.nvm/versions/node/.../bin/hrs  ← symlink criado pelo npm link
    │
    ▼
~/seu-projeto/horus-cli/dist/bin/horus.js  ← seu código compilado
    │
    ▼
~/seu-projeto/horus-cli/dist/index.js  ← bundle principal (clack + zod inlinhados)
```

---

## Comandos Rápidos

| Comando | Alias | Descrição |
|---------|-------|-----------|
| `hrs` | — | Abre o menu interativo principal |
| `hrs add [path]` | `hrs register` | Registra um projeto. Omitido o path, usa o diretório atual |
| `hrs list` | `hrs ls` | Lista todos os projetos registrados |
| `hrs remove` | `hrs rm` | Remove um projeto do registro (menu interativo) |
| `hrs help` | `hrs -h`, `hrs --help` | Exibe a lista de comandos |

### Exemplos práticos

```bash
# Dentro do seu projeto Next.js
cd ~/projetos/meu-app
hrs add .                  # Registra "meu-app" com o nome do diretório

# Ou com nome customizado — o hrs vai perguntar interativamente
hrs add ~/projetos/api-backend

# De qualquer lugar, abre o menu com todos os projetos
hrs

# Lista o registro e remove projetos cujos pastas foram deletadas
hrs list
```

---

## Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| **Runtime** | Node.js v18+ | ESM nativo, `fs/promises`, `os.homedir()` |
| **Linguagem** | TypeScript 5.8 (Strict) | Segurança de tipos end-to-end, `exactOptionalPropertyTypes` |
| **UI/UX** | `@clack/prompts` | Menus interativos, spinners, `isCancel()` para Ctrl+C |
| **Cores** | `picocolors` | Zero dependências, ~3× mais rápido que `chalk` no boot |
| **Execução** | `execa` | `stdio: 'inherit'` preserva spinners e prompts originais |
| **Validação** | `zod` v4 | Schemas tipados para `horus.json` e `registry.json` |
| **Bundler** | `tsup` (esbuild) | Bundle único, minificação, tree-shaking, boot < 300ms |

### Por que `noExternal` no tsup?

`picocolors`, `@clack/prompts` e `zod` são inlinhados diretamente no bundle final. Isso elimina as syscalls de resolução de módulos Node.js em runtime, contribuindo para o objetivo de boot inferior a 300ms.

---

## Estrutura de Arquivos

```
horus-cli/
├── bin/
│   └── horus.ts            # Shebang universal + dynamic import (179B compilado)
├── src/
│   ├── core/
│   │   ├── registry.ts     # CRUD de ~/.horus/registry.json (escrita atômica + Zod)
│   │   ├── parser.ts       # Discovery Engine: horus.json → fallback package.json
│   │   └── executor.ts     # Wrapper execa com stdio: 'inherit'
│   ├── ui/
│   │   ├── prompts.ts      # Abstrações @clack/prompts (cancel, select, spinner)
│   │   └── theme.ts        # Paleta picocolors + banner ASCII + saudação
│   ├── commands/
│   │   ├── register.ts     # Handlers: add, list, remove
│   │   └── run.ts          # Handler de execução interativa (Fase 4)
│   └── index.ts            # Entrypoint: argv parser + routing de subcomandos
├── docs/                   # Documentação do projeto
├── package.json            # type: "module", bin: { "hrs": ... }
├── tsconfig.json           # Strict mode, Node16, exactOptionalPropertyTypes
└── tsup.config.ts          # Bundle otimizado para boot < 300ms
```

---

## Como Contribuir

```bash
# Modo desenvolvimento (rebuild automático)
npm run dev

# Verificação de tipos TypeScript
npm run typecheck

# Build de produção
npm run build
```

---

## Licença

MIT © horus contributors
