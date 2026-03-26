# PROJECT_STATE — Estado Atual do horus CLI

> **Última atualização**: 2026-03-26
> **Versão**: 0.1.0
> **Estágio**: Fase 8 concluída → Pronta para Integração de IA (Fase 9)

---

## 📊 Status das Fases

| Fase | Nome | Status | Entrega |
|------|------|--------|---------|
| **Fase 1** | Setup da CLI e Estrutura Cross-Platform | ✅ **Concluída** | 2026-03-25 |
| **Fase 2** | Registry — O Mapa de Projetos Universal | ✅ **Concluída** | 2026-03-25 |
| **Fase 3** | Discovery Engine — O Motor de Busca | ✅ **Concluída** | 2026-03-25 |
| **Fase 4** | Executor Proxy e Tratamento de Processos | ✅ **Concluída** | 2026-03-25 |
| **Fase 5** | Distribuição e Empacotamento | ✅ **Concluída** | 2026-03-25 |
| **Fase 6** | UX Contínua e Heurísticas  | ✅ **Concluída** | 2026-03-26 |
| **Fase 8** | Context Dashboard (V2) e Navegação UI | ✅ **Concluída** | 2026-03-26 |
| **Fase 8.5**| Bug Bash, Navegação Híbrida e Smart Init | ✅ **Concluída** | 2026-03-26 |
| **Fase 9.1**| Refinamento de Inteligência & Quad-Estágio | ✅ **Concluída** | 2026-03-26 |
| **Fase 9.5**| Documentação Rica e Templates Globais | ✅ **Concluída** | 2026-03-26 |

> 🎉 **Status Geral: Motor de IA Integrado, Markdown dinâmico sincronizado via Clack. Validação BYOK com cache bypass estruturada, Status visual de chaves e visualizador local (`~/.horus/prompts/`). Próximo passo: Background Tasks (Fase 10) ou Auto-Correction Zod (Fase 9.2).**

---

## Fase 1 — Setup ✅

### O que foi construído
- `bin/horus.ts` — Shebang universal (`#!/usr/bin/env node`), 179 bytes compilados
- `src/ui/theme.ts` — Paleta semântica com `picocolors`, banner ASCII, saudação contextual (manhã/tarde/noite)
- `src/ui/prompts.ts` — Abstrações sobre `@clack/prompts` (cancel handler, spinner, select tipados)
- `src/index.ts` — Entrypoint com menu interativo inicial
- `package.json` — ESM (`"type": "module"`), binário `hrs`, deps mínimas
- `tsconfig.json` — Strict mode, `Node16`, `exactOptionalPropertyTypes`
- `tsup.config.ts` — Bundle único, minificação, `noExternal` para deps de UI

### Métricas da Fase 1

| Métrica | Valor |
|---------|-------|
| Build time | ⚡ **192ms** |
| Bundle `dist/index.js` | **40KB** |
| Bundle `dist/bin/horus.js` | **179 bytes** |
| Typecheck errors | ✅ **0** |
| Vulnerabilidades npm | ✅ **0** |

---

## Fase 2 — Registry ✅

### O que foi construído
- `src/core/registry.ts` — CRUD completo de `~/.horus/registry.json`
- `src/commands/register.ts` — Handlers interativos: `add`, `list`, `remove`
- `src/index.ts` — Refatorado com argv parser e routing de subcomandos
- Zod adicionado como dependência de runtime (inlinhado no bundle)

### Contratos de Dados Implementados

#### `~/.horus/registry.json`

```json
{
  "version": 1,
  "projects": [
    {
      "name": "Horus CLI",
      "path": "M:\\Projetos\\Horus",
      "addedAt": "2026-03-25T22:24:54.539Z"
    }
  ]
}
```

#### Schema Zod (fonte de verdade em `src/core/registry.ts`)

```typescript
const ProjectSchema = z.object({
  name:     z.string().min(1),
  path:     z.string().min(1),
  addedAt:  z.string().datetime(),
});

const RegistrySchema = z.object({
  version:  z.number().int().min(1),
  projects: z.array(ProjectSchema),
});
```

### Comportamentos implementados

| Comportamento | Implementação |
|---------------|--------------|
| Criação automática de `~/.horus/` | `fs.mkdirSync({ recursive: true })` |
| Detecção de duplicatas | `normalizePath()` com case-insensitive no Windows |
| Escrita atômica | `.tmp` → `renameSync` |
| Auto-limpeza de projetos deletados | `purgeInvalidProjects()` — chamado **lazy** em `list` e `remove` |
| Recuperação de JSON corrompido | `safeParse()` → recria vazio, não quebra |
| Cancelamento (Ctrl+C) | `clack.isCancel()` em todo prompt interativo |

### Métricas da Fase 2

| Métrica | Valor |
|---------|-------|
| Build time | ⚡ **~570ms** |
| Bundle `dist/index.js` | **~354KB** (Zod v4 inlinhado) |
| Typecheck errors | ✅ **0** |
| Testes manuais | add ✅ · list ✅ · remove ✅ · duplicata ✅ · JSON corrompido ✅ |

### Comandos disponíveis (pós-Fase 2)

```bash
hrs                    # Menu interativo
hrs add [path]         # ≡ hrs register
hrs list               # ≡ hrs ls
hrs remove             # ≡ hrs rm
hrs help               # ≡ hrs -h, hrs --help
```

---

## Fase 3 — Discovery Engine ✅

### O que foi construído
- `src/core/parser.ts` — Implementação dos schemas Zod (`HorusConfigSchema`, `TaskSchema`, `PackageJsonSchema`).
- Lógica de dupla-camada/fallback convertendo o output de um `package.json` limpo de scripts como `preinstall` e `postbuild` e adicionando prefixos automáticos como `📦 Run dev`.
- `src/commands/run.ts` — O executor da CLI. Lê os projetos de CWD → Registry → Interação manual e inicia um **Loop de Sessão** garantindo recomeço veloz sem reinicializar o node e `hrs run`.
- Zod adaptado para **não relatar Erro de Node Fatal**, formatando os arrays `issues` da v4 num objeto formatado na UI (Ex: `  • tasks[0].label: O label da tarefa não pode estar vazio`) permitindo um uso de Fallback automático em caso de sintaxe malformada.

### Métricas da Fase 3

| Métrica | Valor |
|---------|-------|
| Time | ⚡ **~0.3ms por parsing** sincronizado |
| Testes passados | horus.json válido ✅ · vazio ✅ · campos inválidos ✅ · package.json fallback ✅ |

---

## Fase 4 — Executor Proxy ✅

### O que foi construído

- `src/core/executor.ts` construído encapsulando `execa`.
- Implementado controle de duplo tráfego para processamento isolado: separando o `split` seguro para passagem de argumentos limpos (`extraArgs`) contra processos shell completos com pipes, os quais bloqueiam argumentos de array.
- A diretiva `stdio: 'inherit'` preservou *Progress Bars, Interactive Shells e Cores Nativo* de comandos como React e Vite.
- Abortos via `SIGINT` (Ctrl+C no processo rodando) e falhas brutas do comando original processam elegantemente sem disparar Node Errors.
- Adição global de dupla chamada via bin: `"hrs"` e `"horus"`.

---

## Fases Futuras

### Fase 6 — UX Contínua e Navegação Infinita ✅

- **Stateful Navigation Loop**: Implementado na `src/index.ts`. O loop interativo principal mantém a sessão até que se selecione `Sair`.
- **Registro Interativo Aprimorado**: `hrs add` suporta submeter caminho atual de forma automática ou submeter um caminho via input manual, validado via `fs.existsSync`.
- **Lista Viva (`hrs ls`)**: O registry emite agora uma visualização aprofundada das listagens (com `addedAt` em formatação human-readable de tempo, diretório absoluto e soma estática de Task Count da discovery).
- **`hrs init --ai`**: Esqueleto implementado usando uma heurística real local que mapeia o projeto. Pode detectar stacks (Next, Docker, Prisma, Rust, Go, Python) para injetar labels amigáveis baseados na stack no arquivo `horus.json`. O prompt original LLM já foi injetado como um DocBlock para ser plugado pela Fase 8.

### Fases 7 e 8 — Context Dashboard V2 ✅

- **Máquina de Estados Absoluta (`src/index.ts`)**: Migrado o loop simplista para a arquitetura com passagem de contexto `AppState` (`HOME`, `RUN`, `LIST`), prevenindo closure nesting e callback hell. Menu operando agora ininterruptamente. `Ctrl+C` em submenus volta à página inicial em vez de fechar.
- **Status Bar Dinâmico (`renderContextBar`)**: Renderiza o CWD (Ciano), Nome do Projeto Registrado (Verde) e faz parsing síncrono ultra-rápido (com timeout) da `<brand>` de repositórios Git no local.
- **Acesso Rápido e Metadados (`lastAccessed`)**: O Schema Zod incorporado à `registry.ts` agora lê as interações em cada projeto via a função atômica transparente `.touchProject()`. Retorna atalhos no menu "⭐ Mais Acessados".
- **Smart Badges (`src/ui/badges.ts`)**: Módulo puro via `fs.existsSync` que injeta Badges inline nos dropdowns interativos do `@clack/prompts` (`📦`, `👁️` ou `⚠️`).
- **Transição de Execução Interativa**: Após os child-processes em Terminal finalizarem, `waitForKeypress()` captura entrada RAW em `.isTTY` (`"Pressione Enter para voltar ao menu"`) sem matar a UI da CLI.

### Fase 8.5 — Bug Bash & Navegação Híbrida ✅

- **Estabilização do Daemon (Crash Fix)**: Removido o uso de `handleCancel()` (que acionava `process.exit`) nos prompts de registro e seleção. A navegação agora utiliza o _Call Stack_ do próprio `async/await` como Pilha de Navegação (Navigation Stack). Um `isCancel()` resulta em `return`, retrocedendo exatamente um estado de forma segura e mantendo o loop vitalício.
- **Navegação Híbrida em Projetos (`src/commands/projects.ts`)**: O menu `≡ Projetos` exibe a lista completa instantaneamente, permitindo navegação imediata por setas (↑↓). Adicionada a opção fixa `🔍 Filtrar por nome…` no topo, que aciona o modo de busca textual sob demanda sem bloquear a UX inicial.
- **Smart Init (Fluxo de Recuperação)**: O Discovery Engine não apenas avisa quando um diretório é virgem de configuração, mas bloqueia o fluxo exibindo um prompt: `"Deseja inicializar o horus.json agora?"`. Se aceito, o CLI efetua um `cd` virtual (Context Switch seguro) e inicia o wizard interativo na raiz do novo projeto, voltando ao menu logo após a conclusão.
- **Microcopy**: Renomeado "Registrar novo portal" para "Registrar novo projeto" para melhor clareza. Cancelamentos em sub-menus geram feedbacks pacíficos (`Registro cancelado.`, `Voltando...`).

### Fase 9.1 — Refinamento de Inteligência (Segurança e Validação) ✅

- **Cache Bypass Otimizado (`src/utils/env.ts`)**: Módulo criado para contornar cache do Node/V8 lendo sempre o `.env` atômico em `~/.horus/.env`. Aniquilada a falha de "Chaves Zumbis" onde exclusões no disco não refletiam na UI.
- **Status Quad-Estágio para Provedores de IA**: `✔` (Verde: Válido), `✗` (Vermelho: Inválido/Sem Conf), `⚠` (Roxo: Cota/Rate Limit), `○` (Cinza: Pendente).
- **Tratamento Timeout Fetch**: AbortController adaptado em todos os `fetch()` de ping limitando em 6s e evitando o travamento de sistema caso Ollama não esteja rodando ou provedor na nuvem caia.
- **Escudo AI Agent (`hrs init --ai`)**: Comando de Discovery da IA modificado para realizar pre-flight via `checkActiveProviderHealth()`. Impede requests mortas enviando o usuário automaticamente para o painel de configuração.

### Fase 9.5 — Documentação Rica e Templates Globais ✅

- **Document Viewer (`hrs readme`)**: Algoritmo nativo de renderização Markdown colorida e formatada com quebra inteligente de linha no terminal, casando perfeitamente com a UI do `@clack/prompts`.
- **Motor de Prompts Interativo**: Prompts gerais locados universalmente em `~/.horus/prompts/` renderizados e gerenciados via terminal, substituindo a velha edição por strings puras.
- **Deep Link `Init`**: O Roteamento foi otimizado para navegações diretas caso IA não esteja configurada (`manageProviders`), saltando overhead de submenus.

---

## Invariantes de Performance

### Contrato RNF2: Boot < 300ms

O diagrama abaixo mostra o orçamento de tempo até o primeiro render do menu:

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

### Contratos que garantem RNF2

1. **Zero I/O no boot**: `registry.ts` nunca é lido antes da primeira interação
2. **Bundle único**: zero syscalls de module resolution em runtime
3. **`min: true` no tsup**: bundle menor → parse mais rápido pelo V8
4. **`bin/horus.js` = 179 bytes**: primeiro arquivo a ser parsed, deve permanecer mínimo

---

## Estrutura de Arquivos Atual

```
m:/Projetos/Horus/
├── bin/
│   └── horus.ts                  ✅ Fase 1
├── src/
│   ├── core/
│   │   ├── registry.ts           ✅ Fase 2/8 — CRUD + Zod + lastAccessed atômico
│   │   ├── parser.ts             ✅ Fase 3 — Fallbacks e schemas
│   │   ├── executor.ts           ✅ Fase 4 — Wrapper execa com inherit e sinal
│   │   └── ai-agent.ts           ✅ Fase 9 — Integração Multi-LLM BYOK
│   ├── ui/
│   │   ├── theme.ts              ✅ Fase 8 — Context Bar, waitForKeypress e saudação
│   │   ├── badges.ts             ✅ Fase 8 — Badges de Saúde lazily read
│   │   └── prompts.ts            ✅ Fase 8.5 — isCancelled() seguro (sem process.exit)
│   ├── utils/
│   │   └── env.ts                ✅ Fase 9.1 — Cache Bypass e gerenciamento rigoroso de variáveis
│   ├── commands/
│   │   ├── register.ts           ✅ Fase 8.5 — Tratamento de erros robusto e sem crashes
│   │   ├── run.ts                ✅ Fase 8.5 — Smart Init + Discovery fallback
│   │   ├── projects.ts           ✅ Fase 8.5 — Navegação híbrida (Setas + Busca filtrada)
│   │   ├── ai-config.ts          ✅ Fase 9.1 — I/O tri-state, timeout fetch, revalidação bypass
│   │   └── init.ts               ✅ Fase 9.1 — Pre-flight health check no `--ai`
│   └── index.ts                  ✅ Fase 8.5 — Máquina de Estados Absoluta (Call Stack)
├── docs/
│   ├── PRD-Horus.md              ✅ Requisitos do produto
│   ├── tasks.md                  ✅ Contrato horus.json + fallback
│   ├── architecture.md           ✅ Regras de Ouro + ADRs
│   └── PROJECT_STATE.md          ✅ Este arquivo
├── dist/                         ✅ Gerado pelo tsup (não versionar)
├── package.json                  ✅ ESM, bin: hrs, deps completas
├── tsconfig.json                 ✅ Strict + Node16
└── tsup.config.ts                ✅ Bundle otimizado
```

---

## Dependências em Produção

| Pacote | Versão | Propósito | No Bundle |
|--------|--------|-----------|-----------|
| `@clack/prompts` | `^0.9.1` | UI interativa do terminal | ✅ Inlinhado |
| `picocolors` | `^1.1.1` | Colorização ANSI | ✅ Inlinhado |
| `zod` | `^4.3.6` | Validação de schemas JSON | ✅ Inlinhado |
| `execa` | — | Executor de processos filhos | 📋 Fase 4 |

> **Nota**: Todas as dependências de runtime são inlinhadas no bundle via `noExternal` no `tsup.config.ts`. O `node_modules` não é necessário em produção.
