<div align="center">

```text
    ██╗  ██╗ ██████╗ ██████╗ ██╗   ██╗███████╗
    ██║  ██║██╔═══██╗██╔══██╗██║   ██║██╔════╝
    ███████║██║   ██║██████╔╝██║   ██║███████╗
    ██╔══██║██║   ██║██╔══██╗██║   ██║╚════██║
    ██║  ██║╚██████╔╝██║  ██║╚██████╔╝███████║
    ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
```

**The All-Seeing Gateway**

*Navegação visual, execução delegada. O horus é o controle remoto, o projeto é a TV.*

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: Dual](https://img.shields.io/badge/License-Dual-yellow)](LICENSE)

</div>

---

## 👁️ O Problema

Você troca de repositório e precisa rodar o projeto. Mas qual script era mesmo? `npm run dev`? `docker-compose up`? `dotnet run`? O **Horus** acaba com essa fricção cognitiva no seu terminal: um único comando (`hrs` ou `horus`) descobre e lista todos os comandos disponíveis no seu projeto — você só precisa apontar e pressionar Enter.

Não perca mais tempo vasculhando `package.json`, `Makefiles` ou `.sln` apenas para subir um ambiente. Com o Horus, a navegação é visual, interativa e sem esforço.

---

## ✨ Principais Funcionalidades

### 🔄 Always On Dashboard (Loop de Estado Contínuo)
Uma verdadeira Máquina de Estados operando diretamente no seu TTY. Liste, filtre (fuzzy search) dezenas de projetos via UI, ou role neles nativamente via Setas. O Horus permite realizar saltos entre repositórios globais registrados na sua máquina instantaneamente, operando em um loop persistente que não te abandona após uma execução.

### 🔍 Discovery Engine com Fallback Inteligente
O motor de descoberta prioriza de forma inteligente:
1. Contratos explícitos no formato `horus.json`.
2. Inferência de projetos nativos (ex: Node.js lendo `package.json`).
3. Detecção poliglota (Docker, Go, Rust, .NET, Executáveis raw).
Tudo interceptado velozmente para apresentar as "Tasks" formatadas e contextualizadas.

### 🧠 AI Agent (`hrs init --ai`)
Não quer escrever seu contrato `horus.json` à mão? Nós também não. O motor de **Smart Init** possui uma heurística multi-provider (Ollama ➔ OpenRouter ➔ Groq ➔ Gemini) que lê seus arquivos, escaneia seu README e utiliza inteligência artificial para inferir, categorizar e gerar um arquivo de tarefas blindado e validado em Zod. Menos digitação, zero fricção.

**Exemplo gerado automaticamente por IA para um projeto Next.js + Prisma:**
```json
{
  "name": "fake-next-app",
  "description": "Gerado pelo horus IA Agent — stack: Next.js + Prisma",
  "tasks": [
    {
      "label": "👁️  Watch Mode",
      "cmd": "npm run dev",
      "hint": "next dev",
      "group": "Desenvolvimento"
    },
    {
      "label": "🏗️  Build",
      "cmd": "npm run build",
      "hint": "next build",
      "group": "Build"
    },
    {
      "label": "🚀 Iniciar",
      "cmd": "npm run start",
      "hint": "next start",
      "group": "Desenvolvimento"
    },
    {
      "label": "🔍 Lint",
      "cmd": "npm run lint",
      "hint": "eslint src",
      "group": "Qualidade"
    },
    {
      "label": "🔍 Typecheck",
      "cmd": "npm run typecheck",
      "hint": "tsc --noEmit",
      "group": "Qualidade"
    },
    {
      "label": "🧪 Testes",
      "cmd": "npm run test",
      "hint": "jest",
      "group": "Testes"
    },
    {
      "label": "🗄️  Migrar DB",
      "cmd": "npm run migrate",
      "hint": "prisma migrate dev",
      "group": "Banco de Dados"
    },
    {
      "label": "🎨 Studio",
      "cmd": "npm run studio",
      "hint": "prisma studio",
      "group": "Banco de Dados"
    },
    {
      "label": "🌱 Seed DB",
      "cmd": "npm run seed",
      "hint": "prisma db seed",
      "group": "Banco de Dados"
    },
    {
      "label": "🌱 Git: Status",
      "cmd": "git status",
      "group": "Git"
    },
    {
      "label": "🌱 Git: Pull",
      "cmd": "git pull",
      "hint": "Atualiza o repositório",
      "group": "Git"
    },
    {
      "label": "🌱 Git: Log",
      "cmd": "git log --oneline -10",
      "hint": "Últimos 10 commits",
      "group": "Git"
    }
  ]
}
```

### ⚡ Performance Extrema & Fidedignidade
- **Boot < 300ms:** Arquitetura de compilação modular usando *Lazy Loading*. O motor de IA e as bibliotecas pesadas só entram na memória caso sejam estritamente necessárias.
- **Transparência Executiva:** O Horus usa a engine transacional do Execa associada ao `stdio: 'inherit'`. O output que você vê da execução da task, os warnings em vermelho e a barra de carregamento do compilador original são mantidos intactos, repassados perfeitamente com todas as cores ANSI nativas. O comando executa como se o Horus não estivesse lá.

---

## 🕹️ Guia de Comandos

O fluxo recomendado é puramente visual (digite apenas `horus` e siga na interface). No entanto, o CLI oferece suporte completo para atalhos diretos:

| Comando | Alias | Flag | Descrição |
| :--- | :---: | :---: | :--- |
| `horus run` | `hrs` | `--watch` | Inicia o motor interativo no diretório atual (repassa argumentos extras nativamente) |
| `horus register` | `hrs add` | `[path]` | Registra o projeto atual ou do diretório fornecido no catálogo global de atalhos. |
| `horus list` | `hrs ls` | | Abre a interface de visualização, filtragem e switch de projetos salvos. |
| `horus remove` | `hrs rm` | `--purge` | Abre menu para remover projeto do catálogo (ou limpa atalhos com paths inválidos). |
| `horus init` | `hrs init` | `--ai`, `--prompt` | Cria um template inicial do contrato abstrato de automações local. |
| `horus config` | `hrs config` | | Acesso rápido pelo Deep Link para configuração BYOK (Provedores de IA). |

### 📖 Central de Documentação e Prompts (Novo)
O Horus unifica a leitura de referências do seu projeto reproduzindo um renderizador nativo de **Markdown** no seu terminal (estilo IDE). Podendo ser usado para ler o `README.md` do seu projeto em tempo real com formatações ou instanciar e visualizar seus System Prompts de preferência salvos globalmente em `~/.horus/prompts/`. 

Além da leitura dinâmica, o módulo conta com:
- **Clipboard UTF-8 Cross-platform:** Cópia instantânea garantindo indentação real sem acionar quebras de linhas acidentais em IDEs como o VS Code (Smart Paste bypass).
- **Editor Atômico Integrado:** Opção de disparar o `$EDITOR` global do PC congelando o fluxo para se editar nativamente e comutando arquivos de forma transacional usando `.tmp` + `renameSync` pra nunca perverter seu arquivo em caso de shutdown da janela!

---

## 📝 License (Dual)

This project is licensed under a **Dual License**:

- **Personal Use**: Free of charge.
- **Commercial Use**: Requires a paid license.

For commercial inquiries or to purchase a license, please contact me [@mateus_chame](https://www.instagram.com/mateus_chame/).

---

## 👨‍💻 Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para:

- 🐛 Reportar bugs
- 💡 Sugerir novas funcionalidades
- 🚀 Enviar pull requests com melhorias arquiteturais e correções

## 📧 Contato

- **Issues:** Abra uma issue no repositório GitHub
- **Instagram:** [@mateus_chame](https://www.instagram.com/mateus_chame/)
- **Me contrate:** 💼 [LinkedIn](https://www.linkedin.com/in/mateus-chame)

---

**Feito com ❤️ para os desenvolvedores!** 👨‍💻

**💸 Me pague um café: 🥤 [Ko-fi](https://ko-fi.com/mateuschame)**
