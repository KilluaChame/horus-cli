    ██╗  ██╗ ██████╗ ██████╗ ██╗   ██╗███████╗
    ██║  ██║██╔═══██╗██╔══██╗██║   ██║██╔════╝
    ███████║██║   ██║██████╔╝██║   ██║███████╗
    ██╔══██║██║   ██║██╔══██╗██║   ██║╚════██║
    ██║  ██║╚██████╔╝██║  ██║╚██████╔╝███████║
    ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
  The All-Seeing Gateway · v0.1.0
  ─────────────────────────────────────────────

  🌆 Boa noite! Qual projeto vamos acessar hoje?
  Use as setas ↑↓ para navegar · Enter para selecionar · Ctrl+C para sair

  ─────────────────────────────────────────────
  👁️  LOCAL:   C:\Users\lizzi
  🏷️  PROJETO: lizzi (não registrado)
  ─────────────────────────────────────────────

## Menu Principal:
- ⭐  Mais Acessados [Favoritos]
- ≡  Projetos
- ▶  Executar comando rápido
- ⚙️  Configuração do horus
    -  🤖  Provedores de IA (Tokens e Modelos (BYOK))
    -  📝  Prompts Gerais
    -  ←  Voltar ao Menu Principal
- ?  Ajuda & Atalhos

### Dentro de  ⭐  Mais Acessados: (Agora irá ser favoritos)
- Lista de projetos mais acessados
- Lista de prompts mais acessados


### Dentro de ≡ Projetos:
- 🔍  Filtrar por nome…
- +  Registrar novo projeto
    -  ● Diretório atual
    -  ✎ Informar caminho manualmente
- Projeto 1
- Projeto 2
- Projeto 3

#### Dentro de cada projeto: (Ao escolher o projeto, abre uma nova tela com as seguintes opções)
👁️  LOCAL:   [LOCAL DO PROJETO] [branch: main] (Se não tiver branch, mostrar "Sem branch")
🏷️  PROJETO: [NOME DO PROJETO] [Ativo] (Se não tiver projeto, mostrar "Sem projeto")

- ▶ Executar comandos
- 📖 Ler README do Projeto
- ✦ Inicializar horus.json
    -  ✦ Agent API (Automático) (Descobre tarefas e gera o arquivo nativamente com LLMs na nuvem)
    -  📋 Copiar Prompt (Export)
    -  ✎ Modo Manual
    -  ⚙️ Configurar Provedor de IA
    -  ← Cancelar inicialização
- ⚙️ Editar projeto (Dentro de editar projeto, irá abrir uma nova tela com as seguintes opções)
    -  ✏️ Renomear projeto
    -  🗑️ Remover projeto


#### Dentro de provedores de IA:
#### 🤖 Provedores de IA ------------------------------------------------------+
|
|  Onde obter sua API Key:
|
|    ● Google Gemini          → https://aistudio.google.com/apikey
|    ● OpenRouter             → https://openrouter.ai/keys
|    ● Groq                   → https://console.groq.com/keys
|    ● OpenAI                 → https://platform.openai.com/api-keys
|    ● Anthropic (Claude)     → https://console.anthropic.com/settings/keys
|    ● Ollama (Local)         → https://ollama.com/download
|
|  💡 Dica: O Ollama roda 100% local e não precisa de API Key.
|  🔒 Suas chaves serão salvas em ~/.horus/.env (fora do Git).
|
+----------------------------------------------------------------------------+
|
*  Selecione um provedor para configurar:
|  > ✔  Google Gemini (Ativo [gemini-2.5-flash])
|    ✔  OpenRouter
|    ✔  Groq
|    ✔  OpenAI
|    ✔  Anthropic (Claude)
|    ✔  Ollama (Local)
|    ⟳  Retestar todas as chaves
|    ←  Voltar ao menu

Dentro de prompts gerais:
#### 📝 Prompts Gerais ------------------------------------------------------+
|
|  Aqui você pode editar os prompts que serão usados pelos agentes.
|  Use {{placeholders}} para variáveis que serão substituídas em tempo de execução.
|
+----------------------------------------------------------------------------+
|
*  Selecione um prompt para editar:
|    ➕ Criar Prompt
|  > 📋  Agent Prompt (Instruções gerais do agente)
|    📋  Commit Prompt (Instruções para gerar mensagens de commit)
|    📋  Task Prompt (Instruções para gerar tarefas)
|    📋  README Prompt (Instruções para gerar README)
|    ←  Voltar ao menu


#### Dentro de cada prompt:
#### ⚙️ Gerenciar Prompt: [NOME_DO_PROMPT].md -----------------------------+
|
| Visualizar prompt formato .md
|
+----------------------------------------------------------------------------+
|
*  Selecione uma ação:
|  > 📋  Copiar Prompt
|    ✏️  Editar Prompt
|    🗑️  Deletar Prompt
|    ←  Voltar
