# Task Protocol — Contrato `horus.json`

> **Por que este documento existe?**
> O `horus.json` é a **linguagem de contrato** entre o desenvolvedor de um projeto e o horus.
> A Fase 3 (Discovery Engine) implementa um parser que lê e valida este arquivo.
> Este documento é a fonte de verdade que orienta tanto o schema Zod do parser quanto
> o desenvolvedor que escreve o `horus.json` em seus projetos.

---

## O que é o `horus.json`?

É um arquivo de configuração opcional colocado na **raiz de um projeto**. Ele mapeia as
ações de rotina daquele projeto em um formato padronizado que o horus entende.

**Benefício**: Ao invés de lembrar `docker-compose up -d && npm run seed --env=dev`,
você escreve isso uma vez no `horus.json` como `"🚀 Start Dev Flow"` e nunca mais
precisa memorizar.

---

## Especificação Formal

### Schema (validado pelo Zod na Fase 3)

```typescript
// Derivado do schema Zod — src/core/parser.ts (Fase 3)
interface HorusConfig {
  /** Nome legível do projeto. Aparece como título no menu do horus. */
  name: string;           // Min: 1 caractere. Sem restrição de caracteres especiais.

  /** Descrição opcional. Exibida como subtítulo no menu principal. */
  description?: string;

  /** Lista ordenada de tarefas disponíveis. Mínimo: 1 tarefa. */
  tasks: Task[];
}

interface Task {
  /** Label exibido no menu interativo. Emojis são encorajados. */
  label: string;          // Min: 1 caractere. Exibido exatamente como escrito.

  /** Comando shell a ser executado. Suporta pipes e operators nativos do shell. */
  cmd: string;            // Min: 1 caractere. Executado via shell do sistema.

  /** Descrição curta para o hint do menu (linha abaixo do label). */
  hint?: string;

  /**
   * Grupo de organização. Tarefas do mesmo grupo ficam agrupadas no menu.
   * Fase futura: agrupamento visual no select.
   */
  group?: string;
}
```

---

## Exemplos

### Exemplo Mínimo

```json
{
  "name": "Meu Projeto",
  "tasks": [
    { "label": "▶ Iniciar", "cmd": "npm run dev" }
  ]
}
```

### Exemplo Completo (Projeto Full-Stack)

```json
{
  "name": "Aplicativo Festas",
  "description": "Backend + Mobile + Banco de Dados",
  "tasks": [
    {
      "label": "🌱 Seed Database",
      "cmd": "npm run seed",
      "hint": "Reseta o banco e injeta dados de teste",
      "group": "Banco de Dados"
    },
    {
      "label": "🗑️  Limpar e Recriar DB",
      "cmd": "npm run db:reset && npm run seed",
      "hint": "DESTRUTIVO — apaga todos os dados",
      "group": "Banco de Dados"
    },
    {
      "label": "🚀 Start Dev Flow",
      "cmd": "docker-compose up -d",
      "hint": "Sobe todos os containers em background",
      "group": "Serviços"
    },
    {
      "label": "🛑 Parar Todos os Serviços",
      "cmd": "docker-compose down",
      "group": "Serviços"
    },
    {
      "label": "📱 Iniciar Mobile (Expo)",
      "cmd": "npx expo start",
      "hint": "Abre o Metro Bundler",
      "group": "Aplicação"
    },
    {
      "label": "🌐 Iniciar Backend",
      "cmd": "npm run dev",
      "hint": "Porta 3000 com hot-reload",
      "group": "Aplicação"
    },
    {
      "label": "🧹 Limpar Cache",
      "cmd": "rm -rf .cache .expo node_modules/.cache",
      "hint": "Remove caches de build e Expo",
      "group": "Manutenção"
    },
    {
      "label": "📦 Reinstalar Dependências",
      "cmd": "rm -rf node_modules && npm install",
      "group": "Manutenção"
    }
  ]
}
```

### Exemplo Projeto Python/Make

```json
{
  "name": "API Python",
  "tasks": [
    { "label": "🐍 Ativar Ambiente Virtual",  "cmd": "source .venv/bin/activate" },
    { "label": "🚀 Iniciar FastAPI",           "cmd": "make run",         "hint": "uvicorn na porta 8000" },
    { "label": "🧪 Rodar Testes",              "cmd": "make test",        "hint": "pytest com coverage" },
    { "label": "📦 Instalar Deps",             "cmd": "pip install -r requirements.txt" },
    { "label": "🗄️  Migrar Banco",             "cmd": "alembic upgrade head" }
  ]
}
```

---

## Regras e Boas Práticas

### ✅ O que é permitido em `cmd`

```json
// Comandos simples
{ "cmd": "npm run dev" }

// Pipes nativos do shell
{ "cmd": "docker logs api | grep ERROR" }

// Operadores de sequência
{ "cmd": "npm run build && npm run test" }

// Condicionais shell
{ "cmd": "npm run lint || echo 'Lint falhou, verifique os erros'" }

// Variáveis de ambiente inline
{ "cmd": "NODE_ENV=production npm run start" }
```

### ❌ O que evitar

```json
// Evite caminhos fixos — quebra em outros ambientes
{ "cmd": "C:\\Users\\joao\\scripts\\start.bat" }  // ❌ Windows-only

// Prefira caminhos relativos à raiz do projeto
{ "cmd": "./scripts/start.sh" }  // ✅ Relativo ao projeto

// Evite comandos que pedem input interativo dentro de pipes
{ "cmd": "npm init | somecommand" }  // ❌ Pode travar
```

### Ordem importa

As tarefas são exibidas no menu **na ordem exata** em que aparecem no array `tasks`.
Coloque as mais usadas no topo.

---

## Fallback: `package.json`

Quando o Discovery Engine **não encontra** um `horus.json` no diretório do projeto,
ele faz o fallback automático para o `package.json`.

### Como funciona a conversão

O parser itera sobre a chave `scripts` do `package.json` e converte cada entrada
em uma `Task` usando as seguintes regras:

| Script no `package.json` | Label gerado pelo horus |
|--------------------------|------------------------|
| `"dev"` | `📦 Run dev` |
| `"start"` | `📦 Run start` |
| `"build"` | `📦 Run build` |
| `"test"` | `📦 Run test` |
| `"start:dev"` | `📦 Run start:dev` |
| `"db:seed"` | `📦 Run db:seed` |

O comando gerado é sempre `npm run <script-name>`.

### Scripts ignorados no fallback

O parser ignora scripts prefixados com `pre` e `post` (hooks internos do npm),
pois estes não são acionados diretamente pelo usuário:

```json
// Ignorados automaticamente pelo fallback:
"preinstall": "...",
"postbuild": "...",
"prebuild": "..."
```

### Limitações do fallback vs `horus.json`

| Recurso | `horus.json` | Fallback `package.json` |
|---------|:---:|:---:|
| Labels customizados com emoji | ✅ | ❌ (prefixo `📦 Run` padrão) |
| Hints descritivos | ✅ | ❌ |
| Agrupamento por categoria | ✅ | ❌ |
| Comandos não-npm (docker, make) | ✅ | ❌ |
| Ordem personalizada | ✅ | Ordem do JSON |
| Validação Zod rigorosa | ✅ | ✅ (schema do pkg.json) |

> **Recomendação**: Crie um `horus.json` assim que o projeto ganhar mais de 3 scripts.
> A diferença de experiência no menu é significativa.

---

## Onde colocar o `horus.json`

```
meu-projeto/
├── horus.json       ← Na raiz do projeto (mesmo nível do package.json)
├── package.json
├── src/
└── ...
```

O Discovery Engine sempre busca na **raiz do diretório registrado** no `~/.horus/registry.json`.

---

## Validação pelo Zod

Todo `horus.json` é validado por um schema Zod antes de qualquer processamento.
Se o arquivo for inválido (campo obrigatório ausente, tipo incorreto, array vazio),
o horus **não quebra** — ele exibe uma mensagem de erro clara e oferece o fallback
para o `package.json`.

Exemplo de erro de validação exibido ao usuário:

```
⚠  horus.json inválido em: ~/projetos/meu-app
   Campo "tasks" precisa ter pelo menos 1 tarefa.
   → Usando fallback: package.json
```
