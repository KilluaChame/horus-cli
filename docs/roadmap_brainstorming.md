### ✅ Fase 9 — AI Discovery e Geração de Contratos

- **Agente Gerador (`hrs init --ai`):** Conecta a um SDK (Google Gemini / OpenAI / Anthropic / Groq / Ollama / OpenRouter) via var de ambiente no `.env`.
- **Análise da árvore de arquivos:** Detecta `Dockerfile`, `package.json`, `.NET Solutions`, `.py`, `Executáveis`. Extrai scripts chaves localmente.
- **Smart Fallback Engine:** Resiliência garantida por rotas em cascata lidando com Rate Limiting e rede offline.
- **Integração Prompt-Export:** Opção inovadora de visualização e cópia do Contexto gerado e prompt das Diretrizes (exportável para ChatGPT/Cursor/Windsurf).

---

### 🔲 Fase 9.1 — Refinamento de Inteligência (Em andamento)

*Objetivo: Escalonar economia de contexto (Tokens) e validação resiliente (Self-Correction).*

1. **Otimização Extrema de Contexto:** 
   * Filtragem assintótica de arquivos enviados à IA: truncamento dinâmico em README.md (escalonado baseado em provedor — LLama 70b vs Groq 8b).
   * Restrição e extração pontual de chaves relevantes (`dependencies` restritas, pulação de scripts NPM Hooks em hardcode parsing).
2. **Resiliência Multi-Cloud (Timeout Strict):** Adicionar um `AbortController` ao sistema de cascata limitando em 8s máximos por request antes de pivotar pro próximo provedor, prevenindo o usuário de ser preso numa espera zumbi de rede (`DT-01`).
3. **Self-Correction (Self-Healing Loop):** Implementar um parser inteligente do JSON recebido. Se o schema falhar via Zod, o motor não ejeta um fallback heurístico local na primeira tentativa, mas submete o erro do Schema de volta ao LLM instruindo autocrítica em um reprompt isolado.

---

### 🔲 Fase 10 — Execução em Segundo Plano (Detached Mode)

*Objetivo: Ligar o Horus em paralelo aos serviços essenciais da aplicação sem travar a interface da Máquina de Estados.*

1. **Tarefas Background e Detached Run:** Criação da keyword no arquivo de contrato ou flag no terminal (`--detached` ou `"background": true`).
2. **Gestão do Daemon de Processos:** Visualização interativa na Home dos processos rodando nativamente na máquina (`node server.js` ou containers ativos gerados pelo Horus).
3. **Graceful Terminate:** Uma task de UI pra `Matar Processos de Fundo` no fechar do CLI, matando os pipes adequadamente.

---

### 🔲 Fase 11 — Telemetria, Segurança e Variáveis de Ambiente Vaulted

*Objetivo: Integrar os contêineres e aplicações com um cofre de banco chaves-valores locado estritamente no Host OS do desenvolvedor.*

1. **Secure Keychain Vault:** Uma branch nativa do Node conectando ao OS Vault Service Local (Windows Credentials API / Mac Keychain) evitando chaves no Disco Limpo.
2. **Agentic Secrets:** Injeção das chaves nativas aos Scripts das Tasks em "Run Time", ex: `$ hrs run db:migrate` resgatará silenciosamente o `DATABASE_URL` do Horus Local Vault e passará pro stdio/execa.
3. **Zero Configuration Drift:** Quando falhar a env target no SDK nativo de execução, o Horus pausará alertando o usuário: "A task exige JWT_SECRET que não existe no local vault. Clicar pra inserir [___]".

---

### 🔲 Fase 12 — Workflows em Cascata (Macro-Tarefas)

*Objetivo: Interligação e criação de Scripts Multi-Stack na mesma Interface.*

1. **Compound Tasks no `horus.json`:** Possibilitar a junção linear ou concorrente de tasks no contrato (ex: `<task 1 (DB)> && <task 2 (Servidor)> && <task 3 (Front)>`).
2. **Dependência de Tasks:** Habilitar `"dependsOn"` nas tasks locais.
3. **Auto-Cleanups:** Tasks de Post-Execution engatilháveis a erros.

---

### 🔲 Fase 13 — Hub Remoto & Plugins Extensions (The All-Seeing Gateway Final)

1. **Hubs Nativos e Plugins (NPM Linkeds):** Possibilidade de baixar pacotes contendo scripts de automatização para infra (Terraform, AWS CDK) rodáveis via Horus.
2. **Cloud Project Sharing:** Permitir exportar um Registro Horus entre desenvolvedores da Mesma Companhia (export registry).
