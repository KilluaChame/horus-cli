# Architecture Guide — horus CLI

> **Audiência**: Contribuidores e mantenedores do projeto.
> **Propósito**: Capturar as decisões arquiteturais, os trade-offs e as invariantes
> que **nunca devem ser violadas** sem uma discussão explícita.

---

## Visão Geral da Arquitetura

O horus é um **CLI proxy de comandos** — não um gerenciador de pacotes, não um
sistema de build, não uma ferramenta de automação. Ele descobre e delega.

```
┌─────────────────────────────────────────────────────────┐
│  Terminal do Usuário                                    │
│                                                         │
│  $ hrs                                                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  bin/horus.js  (179 bytes)                              │
│  #!/usr/bin/env node                                    │
│  → dynamic import('../index.js')                        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  dist/index.js  (~350KB, bundle único minificado)       │
│                                                         │
│  [argv parser] → [banner] → [menu interativo]           │
│       │                           │                     │
│       ▼                           ▼                     │
│  subcomandos           [Discovery Engine]               │
│  (add/list/rm)              │                           │
│       │                    ▼                            │
│       ▼            horus.json ──→ fallback package.json │
│  registry.ts                │                           │
│  ~/.horus/registry.json     ▼                           │
│  (Zod validado)     [Executor Proxy]                    │
│                     execa stdio:'inherit'               │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Processo Filho (npm, docker, make, python, etc.)       │
│  Saída transparente — horus não intercepta logs         │
└─────────────────────────────────────────────────────────┘
```

---

## 🏛️ As Regras de Ouro

Estas são invariantes arquiteturais. Qualquer PR que as viole deve ser revertido.

---

### Regra 1: Caminhos Universais — `os.homedir()` + `path.join()`

**Definição**: Nenhum caminho de arquivo no código-fonte pode conter strings fixas
com separadores ou prefixos de sistema operacional.

```typescript
// ❌ PROIBIDO — Quebra em qualquer sistema diferente do desenvolvedor
const registryPath = 'C:\\Users\\joao\\.horus\\registry.json';
const registryPath = '/home/maria/.horus/registry.json';
const registryPath = '~/.horus/registry.json';  // O Node não expande "~" !

// ✅ CORRETO — Universal e testável
import * as os from 'node:os';
import * as path from 'node:path';

const registryPath = path.join(os.homedir(), '.horus', 'registry.json');
```

**Por quê**: `os.homedir()` resolve para o diretório home correto em qualquer SO:
- Windows: `C:\Users\joao`
- macOS: `/Users/joao`
- Linux: `/home/joao`

`path.join()` usa o separador correto para cada plataforma automaticamente.

**Corolário**: Ao comparar caminhos (ex: para detectar duplicatas no registry),
normalize com `path.resolve()` e, no Windows, converta para lowercase antes de comparar
(`process.platform === 'win32'`), pois o filesystem do Windows é case-insensitive.

---

### Regra 2: Validação Zod Obrigatória — Nenhuma Escrita Sem Schema

**Definição**: Todo arquivo JSON lido ou escrito pelo horus deve ter um schema Zod
correspondente. `JSON.parse()` retorna `unknown` e deve permanecer assim até ser
validado.

```typescript
// ❌ PROIBIDO — JSON não tipado pode causar crash silencioso
const raw = JSON.parse(fs.readFileSync(path, 'utf-8'));
registry.projects.push(raw.project); // Pode explodir em runtime

// ✅ CORRETO — Validação com Zod antes de qualquer uso
const raw: unknown = JSON.parse(fs.readFileSync(path, 'utf-8'));
const result = RegistrySchema.safeParse(raw);
if (!result.success) {
  // Tratar o erro — nunca silenciar
  handleCorruptRegistry();
  return;
}
const registry = result.data; // Totalmente tipado e seguro
```

**Contratos de dados validados pelo Zod**:

| Arquivo | Schema | Localização |
|---------|--------|-------------|
| `~/.horus/registry.json` | `RegistrySchema` | `src/core/registry.ts` |
| `<projeto>/horus.json` | `HorusConfigSchema` | `src/core/parser.ts` (Fase 3) |

**Corolário para escrita**: Sempre use `safeParse()` antes de `saveRegistry()`.
A função `saveRegistry()` deve realizar sua própria validação interna como camada
de defesa adicional ("defense in depth").

---

### Regra 3: Transparência Total — `stdio: 'inherit'`

**Definição**: O horus é um **proxy**, não um gerenciador. Quando executa um comando,
a saída deve fluir diretamente para o terminal do usuário sem filtragem ou buffering.

```typescript
// ❌ PROIBIDO — Captura e quebra spinners/barras de progresso filhas
const { stdout } = await execa('npm', ['run', 'dev']);
console.log(stdout);

// ✅ CORRETO — Transparência total: o usuário vê exatamente o que o processo imprime
await execa('npm', ['run', 'dev'], { stdio: 'inherit' });
```

**Por quê é crítico**: Ferramentas como Expo CLI, Prisma e scripts do npm possuem
seus próprios sistemas de UI (spinners, barras de progresso coloridas, prompts).
Se capturarmos `stdout`, esses UIs são destruídos. Com `stdio: 'inherit'`, o terminal
do usuário é compartilhado diretamente com o processo filho.

**Corolário**: O horus **nunca parseia** a saída de comandos que executa.
Ele não deve tentar detectar erros via `stdout/stderr` — apenas o `exit code` importa.

---

## Arquitetura de Módulos

### Regras de Dependência (Dependency Rule)

```
src/commands/  →  pode importar de  →  src/core/
src/commands/  →  pode importar de  →  src/ui/
src/core/      →  NÃO pode importar de  →  src/ui/
src/core/      →  NÃO pode importar de  →  src/commands/
src/ui/        →  NÃO pode importar de  →  src/core/
src/ui/        →  NÃO pode importar de  →  src/commands/
```

Justificativa: `src/core/` deve ser testável independentemente de qualquer framework
de UI. O `registry.ts` não deve saber que `clack/prompts` existe.

### Regra de Importação da UI

```typescript
// ❌ PROIBIDO em src/core/ — acopla lógica de negócio à UI
import * as clack from '@clack/prompts';

// ✅ CORRETO — core expõe resultados, commands decidem como exibir
// src/core/registry.ts retorna AddProjectResult
// src/commands/register.ts lê o resultado e usa clack para exibir
```

---

## Performance — Boot < 300ms

### Orçamento de tempo

| Fase | Orçamento | Responsável |
|------|-----------|-------------|
| Node.js startup | ~30-50ms | Runtime (fixo) |
| Parse do bundle (`dist/index.js`) | ~50-80ms | tsup (`minify: true`) |
| Render do banner | ~5ms | `theme.ts` (apenas `stdout.write`) |
| I/O do registry | **0ms** | Lazy — nunca no boot |
| Menu interativo | — | Aguarda input do usuário |
| **Total até primeiro render** | **< 150ms** | — |

### Regras de performance

1. **Zero I/O antes do banner**: O arquivo de registry nunca é lido antes da primeira impressão no terminal.
2. **Sem verificações de existência no boot**: `fs.existsSync()` não é chamado no caminho crítico de inicialização.
3. **Bundling de dependências de UI**: `picocolors`, `@clack/prompts` e `zod` são inlinhados no bundle via `noExternal` no `tsup.config.ts`, eliminando resoluções de módulo em runtime.
4. **`bin/horus.js` mínimo**: Apenas 179 bytes. O V8 faz parse em < 1ms.

---

## Decisões Arquiteturais Registradas (ADRs)

| ID | Título | Status |
|----|--------|--------|
| ADR-01 | ESM-First com `"type": "module"` | ✅ Aceito |
| ADR-02 | `noExternal` para UI libs no tsup | ✅ Aceito |
| ADR-03 | `bin/horus.ts` como proxy mínimo (dynamic import) | ✅ Aceito |
| ADR-04 | Strict TypeScript com `exactOptionalPropertyTypes` | ✅ Aceito |
| ADR-05 | Escrita atômica via `.tmp` → `renameSync` | ✅ Aceito |
| ADR-06 | Zod inlinhado no bundle | ✅ Aceito |
| ADR-07 | Auto-limpeza lazy do registry | ✅ Aceito |

Para detalhes completos de cada ADR, consulte [fase1_implementacao.md](./fase1_implementacao.md)
e [fase2_implementacao.md](../brain/fase2_implementacao.md).

---

## Adicionando uma Nova Feature

### Checklist pré-implementação

- [ ] Qual módulo é o dono lógico desta feature? (`core`, `ui`, `commands`)
- [ ] A feature requer I/O de arquivo? → Validação Zod obrigatória
- [ ] A feature requer execução de processo? → `execa` com `stdio: 'inherit'`
- [ ] A feature adiciona nova dependência npm? → Avaliar impacto de boot, adicionar em `noExternal` se for de runtime
- [ ] A feature viola alguma das 3 Regras de Ouro? → Discussão obrigatória antes de merge

### Padrão de erro

```typescript
// Prefira Result types a exceções lançadas
interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Use exceptions apenas para erros verdadeiramente fatais
// (ex: impossível criar ~/.horus por falta de permissão)
```
