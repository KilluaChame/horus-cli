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

## 👁️ O Problema

Você troca de repositório e precisa rodar o projeto. Mas qual script era mesmo? `npm run dev`? `docker-compose up`? `make start`? O **Horus** acaba com essa fricção cognitiva no seu terminal: um único comando (`hrs` ou `horus`) descobre e lista o que está disponível no seu projeto — você só precisa apontar e pressionar Enter.

> **Filosofia**: O `horus` é o controle remoto. O projeto é a TV. 
> Ele não executa, ele apenas delega — com total transparência de logs, suporte a barras de carregamento (spinners) nativos e cores originais.

---

## 🚀 Instalação

### Instalação Global (Recomendado)

```bash
npm install -g horus-cli
```

Após a instalação, o Horus ficará disponível globalmente sob dois aliases nativos: **`hrs`** e **`horus`**. Você pode usar qualquer um deles indiferentemente.

### Testar sem instalar

Quer apenas testar rapidamente num projeto?
```bash
npx horus-cli run
```

---

## 🕹️ Como Usar (Comandos)

O Horus possui uma interface de linha de comando baseada em menu interativo e opções diretas.

### 1. `hrs run` (Ou apenas `hrs`)
Descobre o projeto atual e apresenta um menu listando todas as tarefas disponíveis. Caso você não esteja numa pasta de projeto válida, ele permitirá que você escolha um projeto da sua lista global de projetos registrados.

Você pode inclusive passar **flags adicionais** que serão passadas diretamente ao processo filho:
```bash
hrs run -- --watch
```

### 2. Gerenciamento de Projetos Globais (`Registry`)

O Horus pode "lembrar" onde seus projetos estão salvos no seu PC. Você pode executá-los de volta de **qualquer diretório** do seu sistema.

| Comando | Alias | Descrição |
|---------|-------|-----------|
| `hrs add [path]` | `hrs register` | Registra um projeto no seu mapa global. Se omitir o `[path]`, ele registra a pasta atual. |
| `hrs list` | `hrs ls` | Lista todos os projetos registrados na sua base de dados local. |
| `hrs remove` | `hrs rm` | Abre um menu interativo para você remover projetos que não existem mais. |
| `hrs init` | — | Inicializa um arquivo `horus.json` interativamente baseado nos scripts npm. |
| `hrs init --ai` | — | Analisa o seu repositório (Next.js, Python, Rust, Docker...) e gera o `horus.json` automaticamente com hints e grupos. |
| `hrs help` | `hrs -h` | Exibe a ajuda detalhada do CLI. |

---

## ⚙️ A Mágica: Discovery Engine (`horus.json` vs `package.json`)

Quando você liga o Horus num projeto, o motor de busca executa um **Fallback Inteligente** em duas etapas:

#### 1. Prioridade: `horus.json`
O Horus procura primeiro por um arquivo `.json` customizado na base do projeto. Aqui você dita exatamente o que deve aparecer nos menus, podendo agrupar e dar "hints" (dicas) aos seus comandos interativos!

```json
{
  "name": "Meu Super Projeto",
  "description": "App Backend",
  "tasks": [
    {
      "label": "👁️ Watch Mode",
      "cmd": "npm run dev",
      "hint": "Levanta o servidor local"
    },
    {
      "label": "🏗️ Build Production",
      "cmd": "npm run build"
    }
  ]
}
```

#### 2. Fallback Transparente: `package.json`
Se não houver um `horus.json` ou se ele estiver malformado, o Horus não entra em pânico. Ele automaticamente desvia para o seu `package.json`, filtra os hooks nativos sujos do npm (como `preinstall` e `postbuild`), e converte tudo interativamente. Você ganha a UI visual instantaneamente, a custo zero de configuração.

---

## ⚡ Por Que o Horus? (Sob o Capô)

Para não atrasar a vida do desenvolvedor, o Horus foi montado com métricas extremas de otimização:

- **Boot Super Fino (`< 300ms`)**: Módulos não essenciais (como o próprio `parser` do Discovery Engine e o `execa`) sofrem _Lazy Load_ extremo. Só vão pra memória quando a UI precisa deles.
- **`stdio: 'inherit'` via Execa**: Ferramentas modernas do NPM como Vite, Next e Expo pintam progresso no terminal direto. O Horus usa multiplexação pura que injeta esse TTY pass-through na sua CLI original. Dá até para fechar com o popular `Ctrl+C` perfeitamente!
- **Zero Crashes**: Processamento de arquivos com a engine do `Zod v4`. Se o formatador pegar erro humano no JSON, ele converte em aviso visual não bloqueante.

---

## 🧑‍💻 Developer Guide — Setup Local

Para quem quer estudar o código ou ajudar a manter, a CLI é construída em TypeScript (Strict Mode) num bundler ESM-only.

```bash
# 1. Clone o repositório
git clone https://github.com/KilluaChame/horus-cli.git
cd horus-cli

# 2. Instalação
npm install

# 3. Use o linker para simular a instalação global "ao vivo"
npm run build && npm link
```

### Scripting Utils
- **`npm run dev`**: Escuta eventos de salvamento do TS e compila on-the-fly (`tsup --watch`).
- **`npm run typecheck`**: Escaneia as tipagens restritas do código.

> Após o `npm link`, o comando `hrs` acionará as versões da pasta raiz clonada! Alterações são refletidas instantaneamente.

---

## 📝 Licença

Lançado sob a **MIT License** © horus contributors. 
_Delegue. Não decore._
