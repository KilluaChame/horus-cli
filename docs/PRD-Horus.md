# 🌌 PRD — horus: The All-Seeing Gateway

**Status:** Em desenvolvimento ativo | **Versão:** 0.1.0  
**Filosofia:** Navegação visual, execução delegada. O Horus é o controle remoto; o projeto, a TV.

---

## 1. Visão Geral e Problema

Desenvolvedores perdem tempo valioso lembrando comandos de rotina (`npm run…`, `docker-compose…`, `make…`) ao alternar entre repositórios. O **Horus** elimina essa fricção — um CLI interativo (Point-and-Click) que descobre e lista as ações disponíveis no projeto atual ou em projetos globalmente cadastrados.

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Razão |
|--------|-----------|-------|
| Linguagem | TypeScript 5.8 + Node.js 18+ ESM | Strictness, cross-platform, sem transpiler overhead |
| UI/CLI | `@clack/prompts` + `picocolors` | Menus elegantes, boot ~3× mais rápido que chalk |
| Execução | `execa` | Controle de subprocessos, streams e sinais |
| Validação | `zod` v4 | Schema-first, safeParse, sem exceções não tratadas |
| Estado Global | `os.homedir()` + `fs` nativo | `~/.horus/registry.json`, zero dependências extras |
| Empacotamento | `tsup` | Bundle único minificado, boot < 300ms |

---

## 3. Requisitos

### Funcionais

| ID | Requisito |
|----|-----------|
| R1 | Cadastro de diretórios de projetos em registro global (`~/.horus/registry.json`) |
| R2 | Menu visual para seleção de projetos cadastrados ou detecção do projeto no `cwd` |
| R3 | Análise de `horus.json` com fallback automático para `scripts` do `package.json` |
| R4 | Execução delegada com `stdio: 'inherit'` (preserva cores, spinners e TTY) |
| R5 | Loop de sessão persistente — encerramento apenas via "Sair" ou `Ctrl+C` na Home |
| R6 | Context Bar dinâmico mostrando `cwd`, projeto ativo e branch git |
| R7 | Busca textual (fuzzy) na lista de projetos registrados |
| R8 | Acesso rápido aos 3 projetos mais recentes na tela inicial |
| R9 | Badges de saúde por projeto (`📦`, `👁️`, `⚠️`) |

### Não-Funcionais

| ID | Requisito |
|----|-----------|
| RNF1 | Executável em Windows (PowerShell/CMD), macOS (Zsh) e Linux (Bash) |
| RNF2 | Boot < 300ms (da digitação de `hrs` até o menu aparecer) |
| RNF3 | Registro global via `os.homedir()` — nenhum caminho hardcoded |
| RNF4 | `stdio: 'inherit'` obrigatório em toda execução delegada |
| RNF5 | Escrita atômica obrigatória: `safeParse` → `.tmp` → `renameSync` |

---

## 4. Experiência do Usuário (UX Flow)

```
hrs
  │
  ├─ [Banner ASCII + Saudação contextual]
  │
  ├─ [Context Bar: cwd (Ciano) · projeto ativo (Verde) · branch git]
  │
  └─ Menu Principal
       │
       ├── ⭐  Mais Acessados        → cd virtual no projeto → Menu de Tarefas
       ├── ≡   Projetos (Busca)      → Sub-menu filtrável por texto → Menu de Tarefas
       ├── ▶   Executar comando      → cwd ou seleção → Menu de Tarefas
       ├── +   Registrar projeto     → cwd ou caminho manual (FS/Zod)
       ├── −   Remover projeto       → select + confirmação
       ├── ✦   Inicializar horus.json → heurística local [→ IA na Fase 9]
       ├── ?   Ajuda & Atalhos
       └── ✕   Sair                  → único ponto de encerramento
```

### Menu de Tarefas (sub-menu de qualquer projeto)

```
[Discovery: horus.json > package.json]
  │
  ├── 🌱 Seed Database       (hrs run)
  ├── 🚀 Start Dev Flow
  ├── 🧹 Limpar Cache
  └── ← Voltar               → retorna ao menu anterior
         [Ctrl+C aqui → volta, não fecha o processo]

[Após execução de qualquer comando]
  └── ▶ Pressione qualquer tecla para voltar ao menu...
```

---

## 5. Planejamento de Implementação

### ✅ Fase 1 — Setup da CLI e Estrutura Cross-Platform

- `bin/horus.ts` com shebang universal
- `src/ui/theme.ts` — paleta semântica, banner ASCII, saudação por hora do dia
- `src/ui/prompts.ts` — abstrações sobre `@clack/prompts`
- `src/index.ts` — entrypoint com menu inicial
- `package.json` ESM + `bin: { hrs, horus }`
- `tsconfig.json` strict + `exactOptionalPropertyTypes`
- `tsup.config.ts` bundle único otimizado

---

### ✅ Fase 2 — Registry (O Mapa de Projetos Universal)

- `src/core/registry.ts` — CRUD completo de `~/.horus/registry.json`
- Resolução universal: `path.join(os.homedir(), '.horus', 'registry.json')`
- Comandos `hrs add` / `hrs register`, `hrs list` / `hrs ls`, `hrs remove` / `hrs rm`
- Zod valida o schema; projetos com pastas deletadas são purgados automaticamente
- Escrita atômica: `.tmp` → `renameSync`

**Schema `registry.json`:**
```json
{
  "version": 1,
  "projects": [
    { "name": "Horus", "path": "M:\\Projetos\\Horus", "addedAt": "2026-03-25T22:24:54Z" }
  ]
}
```

---

### ✅ Fase 3 — Discovery Engine (O Motor de Busca)

- `src/core/parser.ts` — schemas Zod para `horus.json` e `package.json`
- Prioridade `horus.json` → fallback `package.json` (filtra hooks `pre*/post*`)
- Labels formatados automaticamente para scripts do npm

---

### ✅ Fase 4 — Executor Proxy e Tratamento de Processos

- `src/core/executor.ts` — wrapper `execa` com `stdio: 'inherit'`
- Separação segura de argumentos extras (`extraArgs`)
- `SIGINT` e falhas do processo filho tratados sem quebrar o CLI

---

### ✅ Fase 5 — Distribuição e Empacotamento

- `tsup` minifica e gera bundle único (`dist/index.js` ~375KB, `dist/bin/horus.js` 179B)
- Instalável via `npm install -g horus-cli` ou `npx horus-cli`

---

### ✅ Fase 6 — UX Contínua e Heurísticas

- **Loop de Sessão Persistente** em `src/index.ts`: o menu nunca fecha sozinho
- **`hrs add` interativo**: cwd automático ou caminho manual com `fs.existsSync`
- **`hrs ls` enriquecido**: `addedAt` relativo, caminho absoluto, contagem de tarefas
- **`hrs init --ai`**: scanner heurístico local detecta stacks (Next, Docker, Prisma, Rust, Go, Python) e gera `horus.json` tipado — esqueleto LLM documentado para Fase 9

---

### ✅ Fase 8 — Context Dashboard V2

> Nota: A Fase 7 (TUI avançado) foi incorporada parcialmente nesta fase.

- **Máquina de Estados** (`AppState`: HOME → RUN/LIST/ADD/… → HOME): sem callback hell, `Ctrl+C` em sub-menus volta ao menu principal sem encerrar o processo
- **Context Bar Dinâmico** (`renderContextBar`): `cwd` em Ciano, projeto ativo em Verde/Bold, branch git via `execSync` com timeout 500ms
- **`lastAccessed` Atômico** (`registry.ts`): campo opcional no schema Zod; `touchProject()` atualiza via `.tmp → renameSync`; `getRecentProjects(3)` ordena por acesso
- **Acesso Rápido** no topo da Home: os 3 projetos mais recentes aparecem antes das ferramentas; clicar faz `process.chdir()` + RUN direto
- **Badges de Saúde** (`src/ui/badges.ts`): `getProjectHealth()` via `fs.existsSync`; renderiza `👁️` (horus.json), `📦` (package.json), `⚠️` (caminho inválido)
- **`waitForKeypress()`** pós-execução: captura raw TTY; ao sair de um processo filho, aguarda `<qualquer tecla>` e volta ao loop de tarefas

---

### 🔲 Fase 8.5 — Project Navigator (Busca Textual + Estrutura de Menu Final)

*Objetivo: Separar a lista de projetos do menu principal em um sub-menu dedicado com busca textual, e consolidar o design final da Home conforme spec.*

#### 8.5.1 — Sub-menu `≡ Projetos` com Busca Textual

O `@clack/prompts` expõe o método `clack.select` com opção de filtro via input. Vamos criar um **Project Navigator** dedicado que:

1. Ao selecionar `≡ Projetos`, abre uma tela separada (não inline no menu)
2. Exibe todos os projetos registrados com os badges de saúde (`👁️`, `📦`, `⚠️`)
3. **Permite digitar para filtrar** — a lista reduz em tempo real conforme o usuário digita (fuzzy match por nome)
4. Ao selecionar um projeto, faz `cd virtual` (`process.chdir`) e entra no **Menu de Tarefas** daquele projeto
5. `← Voltar` ou `Ctrl+C` retorna ao menu principal (sem encerrar o processo)

**Implementação:**
- Criar `src/commands/projects.ts` — módulo dedicado ao Project Navigator
- Usar `clack.select` com opções filtradas dinamicamente por input via `clack.text` prévio ou `autocomplete` (se disponível na versão do clack)
- Fallback: se `clack` não suportar busca inline, implementar filtro via dois passos: `text prompt` para digitar o nome → `select` com opções filtradas

#### 8.5.2 — Reestruturação do Menu Principal

O menu Home terá a estrutura final definitiva:

```
⭐ Mais Acessados          (seção dinâmica — aparece só se há histórico)
   └── [projeto A] ▶
   └── [projeto B] ▶

≡  Projetos (Busca Habilitada)   → Project Navigator (novo sub-menu)

▶  Executar comando rápido       → resolveProjectPath() existente
+  Registrar novo portal         → handleAddCommand()
−  Remover projeto               → handleRemoveCommand()
✦  Inicializar horus.json        → handleInitCommand()
?  Ajuda & Atalhos               → showInlineHelp()
✕  Sair                          → EXIT (único ponto de saída)
```

#### 8.5.3 — `cd Virtual` e Navegação por Projeto

Ao entrar em um projeto via `≡ Projetos` ou `⭐ Recentes`:
- `process.chdir(project.path)` efetua o cd virtual
- `touchProject(path)` registra o acesso
- O **Context Bar** é re-renderizado com o novo cwd e projeto ativo
- O **Menu de Tarefas** é aberto para aquele projeto específico

#### Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/commands/projects.ts` | **Novo** — Project Navigator com busca |
| `src/index.ts` | Novo estado `PROJECTS` na AppState; menu reestruturado |
| `src/commands/register.ts` | `handleListCommand` vira exibição estática; navegação migra para `projects.ts` |

#### Critérios de Aceite

- [ ] Digitar letras no menu `≡ Projetos` filtra a lista em tempo real
- [ ] Selecionar um projeto faz `cd virtual` e abre o Menu de Tarefas
- [ ] `Ctrl+C` ou `← Voltar` dentro do Project Navigator retorna à Home sem fechar
- [ ] Os badges `👁️`/`📦`/`⚠️` aparecem ao lado de cada projeto na busca
- [ ] O Context Bar é atualizado após o `cd virtual`
- [ ] `lastAccessed` é atualizado ao entrar via Project Navigator

---

### 🔲 Fase 9 — AI Discovery e Geração de Contratos

*Objetivo: Substituir a heurística local do `hrs init --ai` por um SDK de IA real.*

- **Agente Gerador (`hrs init --ai`):** Conecta a um SDK (Google Gemini / OpenAI / Anthropic) via variável de ambiente `HORUS_AI_KEY`
- **Análise da árvore de arquivos:** Detecta `Dockerfile`, `expo.json`, `supabase/`, `tsconfig`, `Cargo.toml`, `pyproject.toml`, etc.
- **Geração do `horus.json` Perfeito:** Labels semânticos, grupos de comandos, hints descritivos — tudo validado pelo schema Zod antes de escrever
- **Prompt de sistema** já documentado em `src/commands/init.ts` como DocBlock — pronto para ser plugado

---

### 🔲 Fase 10 — Execução em Segundo Plano (Background/Parallel)

*Objetivo: Permitir que o Horus fique aberto enquanto um processo longo roda.*

- Ao executar um comando longo (ex: `npm run dev`), perguntar: *"Deseja manter o Horus em segundo plano?"*
- Se sim: processo filho é detachado, logs são repassados, `Ctrl+C` encerra apenas o filho e retorna ao menu
- Implementação via `execa` com `detached: true` + pipe manual de stdout/stderr

---

## 6. Estrutura de Arquivos (Fase 8.5)

```
horus-cli/
├── bin/
│   └── horus.ts               # Shebang universal (179B compilado)
├── src/
│   ├── core/
│   │   ├── registry.ts        # CRUD + Zod + lastAccessed atômico
│   │   ├── parser.ts          # horus.json → package.json fallback
│   │   └── executor.ts        # Wrapper execa, stdio: inherit
│   ├── ui/
│   │   ├── theme.ts           # Paleta, banner, renderContextBar, waitForKeypress
│   │   ├── badges.ts          # Badges de saúde (existsSync)
│   │   └── prompts.ts         # Abstrações @clack/prompts
│   ├── commands/
│   │   ├── register.ts        # hrs add / list (exibição) / remove
│   │   ├── projects.ts        # [NOVO] Project Navigator com busca textual
│   │   ├── run.ts             # Execução de tarefas com loop stateful
│   │   └── init.ts            # hrs init / --ai (heurística + skeleton LLM)
│   └── index.ts               # Máquina de estados: HOME|PROJECTS|RUN|ADD|…|EXIT
├── docs/
│   ├── PRD-Horus.md           # Este arquivo
│   ├── architecture.md        # Regras de Ouro + ADRs
│   ├── tasks.md               # Contrato horus.json + fallback
│   └── PROJECT_STATE.md       # Estado atual e histórico de fases
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## 7. Dependências

| Pacote | Versão | Propósito | Bundle |
|--------|--------|-----------|--------|
| `@clack/prompts` | `^0.9.1` | UI interativa do terminal | ✅ Inlinhado |
| `picocolors` | `^1.1.1` | Colorização ANSI | ✅ Inlinhado |
| `zod` | `^4.3.6` | Validação de schemas JSON | ✅ Inlinhado |
| `execa` | `^9.5.2` | Executor de processos filhos | ✅ Inlinhado |

> Todas as dependências de runtime são inlinhadas via `noExternal` no `tsup.config.ts`. O `node_modules` não é necessário em produção.

---

## 8. Invariantes de Performance (RNF2)

```
Evento                          Custo estimado    Acumulado
─────────────────────────────────────────────────────────
Node.js startup                 ~40ms             ~40ms
V8 parse dist/bin/horus.js      < 1ms             ~41ms
dynamic import(dist/index.js)   ~50-80ms          ~120ms
Render do banner ASCII          ~5ms              ~125ms
Render da saudação              < 1ms             ~126ms
Render do select (@clack)       ~10ms             ~136ms
══════════════════════════════════════════════════════════
TOTAL ATÉ MENU APARECER         < 150ms           ✅ DENTRO DO LIMITE
```

**Contratos que garantem RNF2:**
1. Zero I/O no boot — `registry.ts` nunca lê antes da primeira interação
2. Bundle único — zero syscalls de module resolution em runtime
3. `min: true` no tsup — bundle menor → parse V8 mais rápido
4. `bin/horus.js` deve permanecer abaixo de 300 bytes

---

## 9. Regras de Ouro (Inegociáveis)

| # | Regra | Razão |
|---|-------|-------|
| G1 | **Boot < 300ms** — nenhum I/O antes do banner | UX instantânea |
| G2 | **Caminhos universais** — sempre `os.homedir()` + `path.join()` | Cross-platform real |
| G3 | **`stdio: 'inherit'`** em toda execução delegada | Transparência total |
| G4 | **Escrita atômica** — `safeParse` → `.tmp` → `renameSync` | Integridade de dados |
| G5 | **`Ctrl+C` nunca mata o Horus** — cancela apenas a ação folha | UX resiliente |