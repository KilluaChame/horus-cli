# PROJECT_STATE — Estado Atual do horus CLI

> **Última atualização**: 2026-03-25
> **Versão**: 0.1.0
> **Estágio**: Fase 2 concluída → Entrando na Fase 3

---

## 📊 Status das Fases

| Fase | Nome | Status | Entrega |
|------|------|--------|---------|
| **Fase 1** | Setup da CLI e Estrutura Cross-Platform | ✅ **Concluída** | 2026-03-25 |
| **Fase 2** | Registry — O Mapa de Projetos Universal | ✅ **Concluída** | 2026-03-25 |
| **Fase 3** | Discovery Engine — O Motor de Busca | ✅ **Concluída** | 2026-03-25 |
| **Fase 4** | Executor Proxy e Tratamento de Processos | ✅ **Concluída** | 2026-03-25 |
| **Fase 5** | Distribuição e Empacotamento | ✅ **Concluída** | 2026-03-25 |

> 🎉 **Status Geral: MVP do Horus CLI Concluído e Estável.**

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

### Fase 5 — Distribuição ✅

- Publicação documentada no README.
- Suporte duplo ao CLI com os apelidos oficiais (`hrs` e `horus`).
- Estrutura otimizada para npm global.
- Documentação "O Problema", Instalação, Guias e Fallback (`horus.json`) consolidada para leitura de programadores finais.

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
│   │   ├── registry.ts           ✅ Fase 2 — CRUD + Zod + escrita atômica
│   │   ├── parser.ts             ✅ Fase 3 — Fallbacks e schemas
│   │   └── executor.ts           ✅ Fase 4 — Wrapper execa com inherit e sinal
│   ├── ui/
│   │   ├── theme.ts              ✅ Fase 1 — paleta + banner + saudação
│   │   └── prompts.ts            ✅ Fase 1 — abstrações @clack
│   ├── commands/
│   │   ├── register.ts           ✅ Fase 2 — add + list + remove
│   │   └── run.ts                ✅ Fase 3/4 — Loop de sessão, discovery + executor
│   └── index.ts                  ✅ Fase 4 — Parser e extraArgs repassados
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
