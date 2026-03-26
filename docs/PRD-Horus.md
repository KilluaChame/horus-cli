🌌 PRD — horus: The The All-Seeing Gateway
Status: Planejamento | Versão: 1.0.0
Filosofia: Navegação visual, execução delegada. O horus é o controle remoto, o projeto é a TV.

1. Visão Geral e Problema
Desenvolvedores perdem tempo valioso tentando lembrar comandos específicos de rotina (npm run..., docker-compose..., just..., make...) ao alternar entre diferentes repositórios. O horus elimina a necessidade de memorização de comandos de infraestrutura e rotina, atuando como um CLI interativo (Point-and-Click) que descobre e lista as ações disponíveis no projeto atual ou em projetos globais cadastrados.

2. Tecnologias Necessárias (Stack)
Para garantir execução rápida e compatibilidade universal (Cross-platform):

Ambiente/Linguagem: Node.js (v18+) e TypeScript.

Interface (UI/CLI): @clack/prompts (para menus elegantes e fluidos), picocolors (para colorização no terminal).

Execução de Processos: execa (melhor tratamento de subprocessos, streams e sinais do sistema).

Validação de Dados: zod (para garantir que os arquivos horus.json e registry.json não quebrem a aplicação).

Gerenciamento de Estado Global: Módulo nativo os do Node.js combinado com fs (para ler/escrever no ~/.horus/registry.json em qualquer sistema operacional) ou a biblioteca conf.

Empacotamento: tsup ou esbuild para gerar um binário leve e rápido.

3. Requisitos (Funcionais e Não-Funcionais)
Requisitos Funcionais:

R1: O sistema deve permitir o cadastro de diretórios de projetos em um registro global.

R2: Ao ser invocado, o sistema deve exibir um menu visual para seleção de projetos cadastrados ou identificar o projeto no diretório atual (cwd).

R3: O sistema deve analisar a presença de um arquivo horus.json ou fazer o fallback para os scripts do package.json.

R4: O sistema deve executar o comando selecionado repassando o stdout e stderr (stdio: 'inherit') para que barras de progresso e logs sejam exibidos em tempo real.

Requisitos Não-Funcionais (Qualidade e Cross-platform):

RNF1: O binário deve ser executável em Windows (PowerShell/CMD), macOS (Zsh/Bash) e Linux.

RNF2: O tempo de inicialização do CLI (da digitação de hrs até o menu aparecer) deve ser inferior a 300ms.

RNF3: O registro global não deve depender de caminhos fixos (ex: C:\), mas sim utilizar a home do usuário (ex: os.homedir()).

4. Experiência do Usuário (UX Flow)
Invocação Global: O usuário digita hrs em qualquer lugar do terminal.

Seleção de Projeto (Se fora de um diretório mapeado): Um menu interativo do Clack lista os projetos salvos no registro (ex: "Aplicativo_Festas", "Backend API").

Descoberta Interativa: O horus entra no diretório do projeto alvo, valida se ele ainda existe e extrai os comandos disponíveis.

Menu de Ação: Exibição clara das opções mapeadas (ex: "🌱 Resetar Banco", "📱 Iniciar Mobile").

Delegação e Retorno: O comando roda nativamente. Ao finalizar com sucesso ou erro, o horus intercepta o fim do processo e pergunta: "Deseja realizar outra operação no projeto ou sair?"

🛠️ Planejamento de Implementação
O desenvolvimento será dividido em 5 fases sequenciais para garantir entregas testáveis a cada etapa.

Fase 1: Setup da CLI e Estrutura Cross-Platform
Objetivo: Criar o "esqueleto" que roda em qualquer terminal.

Configurar o package.json com "type": "module" e a propriedade "bin": { "hrs": "./dist/bin/horus.js" }.

Criar o arquivo de entrada bin/horus.js utilizando o shebang universal: #!/usr/bin/env node. Isso garante que sistemas Unix e Windows (via npm/Yarn) saibam como executar o arquivo.

Implementar o renderizador do banner (ASCII Art) e saudação inicial usando @clack/prompts e picocolors.

Fase 2: Registry (O Mapa de Projetos Universal)
Objetivo: Ensinar o horus a lembrar onde as coisas estão.

Criar o módulo registry.ts.

Implementar a resolução de caminho universal: path.join(os.homedir(), '.horus', 'registry.json').

Criar comandos auxiliares (ex: hrs add . ou hrs register) para adicionar o diretório atual ao mapa de projetos.

Usar o Zod para validar o formato do JSON e remover automaticamente projetos cujas pastas foram deletadas do sistema.

Fase 3: Discovery Engine (O Motor de Busca)
Objetivo: Ler os contratos (horus.json ou package.json).

Implementar o TaskParser. Ele deve buscar primeiro por horus.json.

Contrato Padrão (horus.json):

JSON
{
  "name": "Aplicativo_Festas",
  "tasks": [
    { "label": "🌱 Seed Database", "cmd": "npm run seed" },
    { "label": "🚀 Start Dev Flow", "cmd": "docker-compose up -d" },
    { "label": "🧹 Limpar Cache", "cmd": "rm -rf .cache" }
  ]
}
Fallback: Se não achar o horus.json, ler o package.json, iterar sobre a chave scripts e formatar o label dinamicamente (ex: de start:dev para 📦 Run start:dev).

Fase 4: Executor Proxy e Tratamento de Processos
Objetivo: Rodar a ação sem perder a interface visual.

Utilizar a biblioteca execa com stdio: 'inherit'. Isso é crucial: permite que ferramentas que possuem seus próprios prompts ou spinners (como o CLI do Expo ou scripts do npm) funcionem perfeitamente dentro do horus.

Envolver a execução em um bloco try/catch. Se o comando falhar, o horus não deve "quebrar", mas sim exibir o erro elegantemente e retornar ao menu principal.

Adição de Passagem de Argumentos (Para o Futuro):Por quê: Em algum momento você vai querer rodar um script passando uma flag extra (ex: npm run seed -- --force). 

Ação: Vale adicionar uma nota mental no PRD de que o executor precisará, numa versão futura, repassar os argumentos (args) que o usuário digitar após o comando.

Fase 5: Distribuição e Empacotamento
Objetivo: Tornar a instalação fácil para qualquer pessoa.

Configurar o tsup para minificar e agrupar o código TypeScript em um único arquivo JavaScript, acelerando o tempo de boot.

Preparar o repositório para ser instalado via npm globalmente (npm install -g horus-cli) ou executado instantaneamente via npx (npx horus-cli).

📂 Estrutura de Arquivos Otimizada
Plaintext
horus-cli/
├── bin/
│   └── horus.js            # Shebang universal (#!/usr/bin/env node) e import do main
├── src/
│   ├── core/
│   │   ├── registry.ts     # CRUD do ~/.horus/registry.json (usa os.homedir)
│   │   ├── parser.ts       # Lê e valida horus.json ou package.json (Zod)
│   │   └── executor.ts     # Wrapper do Execa
│   ├── ui/
│   │   ├── prompts.ts      # Abstrações do @clack/prompts (menus, spinners)
│   │   └── theme.ts        # Cores (picocolors) e ASCII
│   ├── commands/
│   │   ├── register.ts     # Lógica do `hrs add`
│   │   └── run.ts          # Lógica principal de execução interativa
│   └── index.ts            # Entrypoint do sistema
├── package.json
├── tsup.config.ts          # Configuração do bundler
└── tsconfig.json