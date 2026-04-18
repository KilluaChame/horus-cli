/**
 * ai-agent.ts — AI Discovery Agent (Fase 9)
 *
 * Responsabilidades:
 *   1. Escanear a árvore de arquivos do diretório alvo
 *   2. Montar um contexto de projeto compacto para o LLM
 *   3. Chamar o Google Gemini (lazy-loaded) e obter o horus.json gerado
 *   4. Validar o JSON retornado com Zod (HorusConfigSchema)
 *   5. Filtrar comandos potencialmente perigosos (@security-auditor)
 *   6. Retornar o resultado ou um erro tipado para o chamador
 *
 * ⚡ Performance (RNF2):
 *   - Este módulo é carregado SOMENTE quando `hrs init --ai` é invocado.
 *   - O import do SDK Gemini é dinâmico para não inflar o bundle inicial.
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { HorusConfigSchema } from './parser.js';
import { setProviderStatus } from '../commands/ai-config.js';

// ─── Constantes de Template ──────────────────────────────────────────────────

const HORUS_DIR = path.join(os.homedir(), '.horus');
const EXPORT_TEMPLATE_PATH = path.join(HORUS_DIR, 'prompt_export.md');
const MANUAL_TEMPLATE_PATH = path.join(HORUS_DIR, 'prompt_manual.md');

/**
 * Retorna o template customizado do Export, ou null se não existir.
 * O template deve conter {{PROJECT_SUMMARY}} e {{PROJECT_NAME}} como placeholders.
 */
export function getExportPromptTemplate(): string | null {
  try {
    if (fs.existsSync(EXPORT_TEMPLATE_PATH)) {
      return fs.readFileSync(EXPORT_TEMPLATE_PATH, 'utf-8');
    }
  } catch {}
  return null;
}

/**
 * Salva o template padrão do Export no disco para edição.
 */
export function ensureExportTemplate(): string {
  if (!fs.existsSync(HORUS_DIR)) fs.mkdirSync(HORUS_DIR, { recursive: true });
  if (!fs.existsSync(EXPORT_TEMPLATE_PATH)) {
    const defaultTemplate = buildSystemPrompt('{{PROJECT_SUMMARY}}', '{{PROJECT_NAME}}');
    fs.writeFileSync(EXPORT_TEMPLATE_PATH, defaultTemplate, 'utf-8');
  }
  return EXPORT_TEMPLATE_PATH;
}

/**
 * Retorna o caminho do template Manual, criando-o com um padrão se não existir.
 */
export function ensureManualTemplate(): string {
  if (!fs.existsSync(HORUS_DIR)) fs.mkdirSync(HORUS_DIR, { recursive: true });
  if (!fs.existsSync(MANUAL_TEMPLATE_PATH)) {
    const defaultManual = [
      '# Template de Inicialização Manual do horus.json',
      '',
      '> Este arquivo define a estrutura padrão usada pelo `hrs init` no modo Manual.',
      '> Edite os grupos e labels para personalizar o wizard.',
      '',
      '## Grupos padrão sugeridos:',
      '- Desenvolvimento',
      '- Build',
      '- Qualidade',
      '- Testes',
      '- Banco de Dados',
      '- Docker',
      '- Git',
      '- Deploy',
      '',
      '## Mapeamento de Ícones:',
      '- 👁️  Watch Mode → npm run dev',
      '- 🏗️  Build → npm run build',
      '- 🚀 Iniciar → npm run start',
      '- 🔍 Lint → npm run lint',
      '- 🧪 Testes → npm run test',
      '- 🗄️  Migrar DB → npx prisma migrate dev',
      '',
      '## Observações:',
      'Ao editar este arquivo, o modo Manual usará estes templates como referência.',
    ].join('\n');
    fs.writeFileSync(MANUAL_TEMPLATE_PATH, defaultManual, 'utf-8');
  }
  return MANUAL_TEMPLATE_PATH;
}

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface AiAgentResult {
  ok: true;
  config: z.infer<typeof HorusConfigSchema>;
  warnings: string[];       // alertas de segurança sem bloquear o fluxo
}

export interface AiAgentError {
  ok: false;
  reason: 'no-api-key' | 'api-error' | 'parse-error' | 'validation-error' | 'unknown';
  message: string;
}

export type AiAgentOutcome = AiAgentResult | AiAgentError;

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Comandos ou padrões de shell que representam risco alto */
const DANGEROUS_PATTERNS = [
  // Unix/Linux
  /rm\s+-rf?\s+\/(?!\w)/,         // rm -rf /
  /:\(\)\{.*\|.*&\};:/,           // fork bomb
  /dd\s+if=\/dev\/zero/,          // dd nuke
  /mkfs\./,                       // formatar partição
  /shutdown|halt|reboot/i,
  /curl.*\|.*sh/,                  // pipe-to-shell
  /wget.*\|.*sh/,
  /chmod\s+777\s+\//,
  />(\s*)\/etc\/passwd/,
  // Windows / PowerShell
  /format\s+[a-z]:/i,              // Format C:
  /del\s+\/s\s+\/q\s+[a-z]:\\/i, // del /s /q C:\
  /rd\s+\/s\s+\/q\s+[a-z]:\\/i,  // rd /s /q C:\
  /stop-computer/i,                // PowerShell shutdown
  /restart-computer/i,             // PowerShell reboot
  /clear-content\s+[a-z]:\\/i,    // PowerShell wipe
  /remove-item\s+-recurse\s+-force\s+[a-z]:\\/i, // PowerShell rm -rf
];

// ─── Scanner de Repositório ──────────────────────────────────────────────────

async function readHead(filePath: string, maxLines: number = 20): Promise<string[]> {
  try {
    const handle = await fsPromises.open(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, 4096, 0);
    await handle.close();
    const content = buffer.toString('utf-8', 0, bytesRead);
    return content.split(/\r?\n/).slice(0, maxLines);
  } catch {
    return [];
  }
}

/**
 * Produz um sumário compacto do projeto para enviar ao LLM.
 * Varre também heurísticas "perto do código".
 */
export async function scanRepository(cwd: string): Promise<string> {
  const linesOut: string[] = [];
  
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsPromises.readdir(cwd, { withFileTypes: true });
  } catch {
    return '';
  }

  // 1. Arquivos de indicador de stack (nível raiz)
  const ROOT_INDICATORS = new Set([
    'package.json', 'pyproject.toml', 'requirements.txt',
    'Cargo.toml', 'go.mod', 'Makefile', 'Dockerfile',
    'docker-compose.yml', 'docker-compose.yaml',
    'pom.xml', 'build.gradle', 'next.config.js', 'vite.config.ts', 'vite.config.js',
    'prisma/schema.prisma'
  ]);

  const indicatorsFound: string[] = [];
  const executablesFound: string[] = [];
  
  const filesToReadHead: string[] = [];

  // Extensões que costumam representar entrypoints ou scripts ou stacks
  const STACK_EXT = new Set(['.sln', '.csproj', '.fsproj', '.vbproj', '.csproj.user']);
  const EXEC_EXT = new Set(['.exe', '.bat', '.ps1', '.sh', '.py', '.au3', '.cmd', '.js', '.ts']);
  
  // Diretórios para deep discovery
  const DEEP_DISCOVERY_DIRS = new Set(['scripts', 'bin', 'tools']);

  for (const e of entries) {
    if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (ROOT_INDICATORS.has(e.name) || STACK_EXT.has(ext)) {
        indicatorsFound.push(e.name);
      } 
      if (EXEC_EXT.has(ext)) {
        executablesFound.push(e.name);
      }
      
      if (e.name.toLowerCase() === 'makefile' || e.name.toLowerCase().startsWith('docker-compose')) {
        filesToReadHead.push(path.join(cwd, e.name));
      } else if (EXEC_EXT.has(ext) || ext === '') {
        filesToReadHead.push(path.join(cwd, e.name));
      }
    } else if (e.isDirectory() && DEEP_DISCOVERY_DIRS.has(e.name)) {
      try {
        const subEntries = await fsPromises.readdir(path.join(cwd, e.name), { withFileTypes: true });
        for (const subE of subEntries) {
          if (subE.isFile()) {
            const subExt = path.extname(subE.name).toLowerCase();
            if (EXEC_EXT.has(subExt) || subExt === '') {
              filesToReadHead.push(path.join(cwd, e.name, subE.name));
              executablesFound.push(`${e.name}/${subE.name}`);
            }
          }
        }
      } catch { /* silencioso */ }
    }
  }

  // Verificar caminhos absolutos extras (Next, Prisma, Vite)
  for (const extra of ['next.config.js', 'vite.config.ts', 'prisma/schema.prisma']) {
    const p = path.join(cwd, extra);
    if (fs.existsSync(p)) {
      if (!indicatorsFound.includes(extra)) indicatorsFound.push(extra);
      filesToReadHead.push(p);
    }
  }

  if (indicatorsFound.length) linesOut.push(`[STACK FILES] ${indicatorsFound.join(', ')}`);
  if (executablesFound.length) linesOut.push(`[EXECUTABLES] ${executablesFound.join(', ')}`);

  // Extrair README (Quick Start / Deploy)
  const readmePath = entries.find((e) => e.name.toLowerCase().startsWith('readme.md'))?.name;
  if (readmePath) {
    try {
      const readme = await fsPromises.readFile(path.join(cwd, readmePath), 'utf-8');
      const snippet = readme.slice(0, 1500); 
      linesOut.push(`[README EXTRACT]\n${snippet}\n[END README]`);
      
      const regex = /(?:##|\n#)\s*(?:deploy(?:ment)?|quick\s*start|getting\s*started).*?\n(.*?)(?=\n#|$)/is;
      const match = readme.match(regex);
      if (match && match[1]) {
        linesOut.push(`[README DEPLOY/QUICKSTART SECTION]\n${match[1].slice(0, 1000)}\n[END DEPLOY SECTION]`);
      }
    } catch { /* Ignora erro ao ler README */ }
  }

  // 2. Scripts do package.json (se existir)
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await fsPromises.readFile(pkgPath, 'utf-8')) as {
        name?: string;
        description?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (pkg.name) linesOut.push(`[NAME] ${pkg.name}`);
      if (pkg.description) linesOut.push(`[DESC] ${pkg.description}`);

      const notableDeps = Object.keys(pkg.dependencies ?? {})
        .filter((d) => !d.startsWith('@types/'))
        .slice(0, 30);
      if (notableDeps.length) linesOut.push(`[DEPS] ${notableDeps.join(', ')}`);
      
      const notableDevDeps = Object.keys(pkg.devDependencies ?? {})
        .filter((d) => !d.startsWith('@types/'))
        .slice(0, 30);
      if (notableDevDeps.length) linesOut.push(`[DEV DEPS] ${notableDevDeps.join(', ')}`);

      const NPM_HOOKS = /^(pre|post)\w+$/;
      const scripts = Object.entries(pkg.scripts ?? {})
        .filter(([k]) => !NPM_HOOKS.test(k))
        .map(([k, v]) => `  "${k}": "${v}"`);
      if (scripts.length) {
        linesOut.push('[SCRIPTS]');
        linesOut.push(...scripts);
      }
    } catch { /* JSON malformado ignora */ }
  }

  // 3. Subdiretórios gerais
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']);
  const dirs = entries
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map((e) => e.name)
    .slice(0, 10);

  if (dirs.length) linesOut.push(`[DIRS] ${dirs.join(', ')}`);
  
  // 4. Heurística "Perto do Código" (Limite concorrência pra performance)
  const limit = 10;
  let active = 0;
  const headsToRead = Array.from(new Set(filesToReadHead)).slice(0, 30); 
  const headResults: { file: string; lines: string[] }[] = [];

  await new Promise<void>((resolve) => {
    let index = 0;
    const next = async () => {
      if (index >= headsToRead.length) {
        if (active === 0) resolve();
        return;
      }
      const file = headsToRead[index++] as string;
      active++;
      const lines = await readHead(file, 20);
      if (lines.length > 0) headResults.push({ file: path.relative(cwd, file).replace(/\\/g, '/'), lines });
      active--;
      next();
    };
    for (let i = 0; i < limit && i < headsToRead.length; i++) next();
    if (headsToRead.length === 0) resolve();
  });

  for (const result of headResults) {
    const codeInfo: string[] = [];
    for (const l of result.lines) {
      if (l.startsWith('#!')) codeInfo.push(`Shebang: ${l}`);
      if (l.includes('NODE_ENV=') || l.includes('APP_ENV=')) codeInfo.push(`EnvVars: ${l.trim()}`);
      if (result.file.toLowerCase().includes('makefile') && /^[a-zA-Z0-9_-]+:/.test(l)) {
        codeInfo.push(`Make Target: ${l.trim()}`);
      }
      if (result.file.toLowerCase().includes('docker-compose') && /^\s*[a-zA-Z0-9_-]+:/.test(l)) {
        codeInfo.push(`Compose Svc: ${l.trim()}`);
      }
    }
    if (codeInfo.length) {
      linesOut.push(`[FILE INFO: ${result.file}]`);
      linesOut.push(...codeInfo);
    }
  }

  return linesOut.join('\n');
}

// ─── System Prompt ───────────────────────────────────────────────────────────

export function buildSystemPrompt(projectSummary: string, projectName: string): string {
  return `
Você é um Engenheiro de IA e Arquiteto de Sistemas Sênior especializado em Análise Estática de Código e Engenharia de Prompt, responsável por formatar e descobrir Tarefas (Tasks) a partir do contexto de um projeto.
Atue como um tradutor de UX para o comando "hrs", que utiliza o "@discovery-engine". Priorize a intenção semântica sobre a sintaxe bruta e explore arquivos ocultos e padrões.

## Contexto Extraído do Diretório (Mapa de Intenções)
\`\`\`
${projectSummary}
\`\`\`

## CADEIA DE PENSAMENTO (CHAIN-OF-THOUGHT)
1. **Identificação da Stack**: Determine a tecnologia base (ex: Node.js, Next.js, Go, Rust, Python, Docker).
2. **Descoberta de Ferramentas Ocultas**: Analise scripts em \`./bin\`, \`./scripts\`, aliases (.sh, .py, Executáveis, Shebang) ou arquivos de configuração (ex: next.config.js, docker-compose.yml, Makefile) mencionados no contexto. Se houver informações do README, identifique instruções de "Deploy" ou "Quick Start".
3. **Categorização e Tradução**: Agrupe as tarefas em grupos específicos (Essential, Development, Database, Utility, etc) e descubra a "intenção real" de cada comando. (ex: \`docker-compose up -d\` é a intenção de "Subir Infraestrutura").

## REGRAS CRÍTICAS DE INFERÊNCIA
- NÃO ALUCINE TAREFAS. Somente gere comandos para os quais exista suporte comprovado pelo contexto (ex: se não há \`package.json\`, não sugira \`npm install\`).
- Crie tarefas diretas para executáveis e scripts encontrados (incluindo extensões omitidas mapeadas por Shebang). Exemplo: Se há "./scripts/deploy.sh", gere a task que executa o shell script.
- Para comandos do Windows, use a sintaxe correta do powershell (".\\\\script.ps1" ou ".\\\\App.exe").
- Extraia tarefas baseadas em "Make Target" ou "Compose Svc" caso encontre Makefiles ou docker-compose.yml.

## REGRAS OBRIGATÓRIAS DO JSON
1. Retorne SOMENTE o JSON, sem markdown, sem blocos de código, sem comentários.
2. O JSON deve seguir EXATAMENTE este schema:
{
  "name": "string (nome legível do projeto, sem underlines)",
  "description": "string (descrição concisa, max 80 chars)",
  "sobre": "string (descrição técnica rica do projeto mencionando as tecnologias principais da stack, frameworks e ferramentas. Max 400 chars. Deve soar como um banner de boas-vindas profissional.)",
  "ajuda": {
    "categorias": [
      {
        "titulo": "string (emoji + nome da categoria, ex: '🛠 Desenvolvimento')",
        "itens": [
          {
            "comando": "string (comando shell exato)",
            "descricao": "string (o que o comando faz, em linguagem clara)",
            "exemplo": "string (como usar via hrs, ex: 'hrs run → selecionar Watch Mode')",
            "tecnologia": "string (ferramenta/lib que o comando usa, ex: 'tsup', 'Docker')"
          }
        ]
      }
    ],
    "glossario": [
      {
        "simbolo": "string (emoji usado nos labels, ex: '🚀')",
        "significado": "string (o que o símbolo representa na UI, ex: 'Iniciar / Lançar')"
      }
    ]
  },
  "tasks": [
    {
      "label": "string ([Ícone] [Ação Amigável], max 50 chars)",
      "cmd": "string (comando shell exato para executar)",
      "hint": "string (opcional, instrução clara do que isso faz)",
      "group": "string (Desenvolvimento | Build | Qualidade | Testes | Banco de Dados | Docker | Git | Deploy | Automação)"
    }
  ]
}

3. REGRAS DO CAMPO "sobre":
   - OBRIGATÓRIO — sempre gere um texto de branding.
   - Mencione as tecnologias reais detectadas no projeto (ex: "TypeScript", "Prisma", "Docker").
   - Máximo 400 caracteres. Deve soar profissional e acolhedor.

4. REGRAS DO CAMPO "ajuda":
   - OBRIGATÓRIO — gere categorias baseadas nos grupos das tasks.
   - Máximo 8 categorias, máximo 6 itens por categoria.
   - Cada item deve documentar um comando real com descrição, exemplo de uso via hrs, e tecnologia.
   - O glossário deve mapear TODOS os emojis usados nos labels das tasks.

5. Mapeamento de Ícones Obrigatório no "label":
    - 🚀 Iniciar/Subir (Infra ou App)
    - 👁️ Watch/Dev Mode
    - 🏗️ Build/Compilação
    - 🧪 Testes Unitários/E2E
    - 🔍 Lint/Typecheck/Qualidade
    - 📦 Deploy/Release
    - 🗄️ Banco de Dados/Migrações
    - 🐳 Docker
    - 🌱 Git
    - ⚙️  Executável/Script Genérico

6. Gere no máximo 15 tasks relevantes. Omitir as menos importantes.
7. O campo "name" deve ser derivado do contexto ou "${projectName}".
8. NÃO inclua comandos destrutivos (rm -rf, del /s /q, Format C:, etc).
`.trim();
}

// ─── Filtro de Segurança ─────────────────────────────────────────────────────

function auditTasks(
  tasks: Array<{ cmd: string; label: string }>,
): { safe: typeof tasks; warnings: string[] } {
  const safe: typeof tasks = [];
  const warnings: string[] = [];

  for (const task of tasks) {
    const risky = DANGEROUS_PATTERNS.some((pattern) => pattern.test(task.cmd));
    if (risky) {
      warnings.push(`⚠  Comando suspeito removido: "${task.label}" → \`${task.cmd}\``);
    } else {
      safe.push(task);
    }
  }

  return { safe, warnings };
}

// ─── Chamada ao LLM (Lazy-loaded) ────────────────────────────────────────────

async function callAiProvider(prompt: string): Promise<string> {
  const geminiKey = process.env['HORUS_GEMINI_KEY'] ?? process.env['GEMINI_API_KEY'];
  const openRouterKey = process.env['OPENROUTER_API_KEY'];
  const groqKey = process.env['GROQ_API_KEY'];
  const openaiKey = process.env['OPENAI_API_KEY'];
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  const ollamaModel = process.env['OLLAMA_MODEL'];

  if (!geminiKey && !openRouterKey && !groqKey && !openaiKey && !anthropicKey && !ollamaModel) {
    throw Object.assign(new Error('Nenhum provedor de IA encontrado.'), { code: 'no-api-key' });
  }

  let text = '';
  const errors: string[] = [];

  // ── 1. Gemini (Cloud — Prioridade Máxima) ──────────────────────────────────
  if (geminiKey && !text) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey as string);
      const modelName = process.env['GEMINI_MODEL'] || 'gemini-2.0-flash';
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      });
      const result = await model.generateContent(prompt);
      text = result.response.text();
      setProviderStatus('gemini', 'valid');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate')) {
        setProviderStatus('gemini', 'quota_exceeded', 'Cota gratuita esgotada ou Rate Limit');
      } else {
        setProviderStatus('gemini', 'invalid', msg.slice(0, 40));
      }
      errors.push(`[Gemini] ${msg}`);
    }
  }

  // ── 2. OpenRouter (Cloud) ──────────────────────────────────────────────────
  if (openRouterKey && !text) {
    try {
      const model = process.env['OPENROUTER_MODEL'] || 'meta-llama/llama-3.3-70b-instruct:free';
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/KilluaChame/horus-cli',
          'X-Title': 'Horus CLI',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        }),
      });
      if (!response.ok) {
        if (response.status === 429) throw Object.assign(new Error(`OpenRouter HTTP 429: Rate Limit`), { status: 429 });
        if (response.status === 402) throw Object.assign(new Error(`OpenRouter HTTP 402: Payment Required`), { status: 402 });
        throw new Error(`Falha OpenRouter HTTP: ${response.status} - ${await response.text()}`);
      }
      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      text = data.choices?.[0]?.message?.content ?? '';
      setProviderStatus('openrouter', 'valid');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('429') || msg.includes('402') || [429, 402].includes((err as any).status)) {
        setProviderStatus('openrouter', 'quota_exceeded', 'Cota ou Limite atingido');
      } else {
        setProviderStatus('openrouter', 'invalid', msg.slice(0, 40));
      }
      errors.push(`[OpenRouter] ${msg}`);
    }
  }

  // ── 3. Groq (Cloud) ────────────────────────────────────────────────────────
  if (groqKey && !text) {
    try {
      const { Groq } = await import('groq-sdk');
      const groq = new Groq({ apiKey: groqKey as string });
      const model = process.env['GROQ_MODEL'] || 'llama-3.1-8b-instant';
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 2000,
      });
      text = completion.choices[0]?.message?.content ?? '';
      setProviderStatus('groq', 'valid');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('429') || msg.includes('rate limit')) setProviderStatus('groq', 'quota_exceeded', 'Rate Limit de Tokens/Min atingido');
      else setProviderStatus('groq', 'invalid', msg.slice(0, 40));
      errors.push(`[Groq] ${msg}`);
    }
  }

  // ── 4. OpenAI (Cloud) ──────────────────────────────────────────────────────
  if (openaiKey && !text) {
    try {
      const model = process.env['OPENAI_MODEL'] || 'gpt-4o-mini';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        if (response.status === 429) throw Object.assign(new Error(`OpenAI HTTP 429: Rate Limit`), { status: 429 });
        throw new Error(`Falha OpenAI HTTP: ${response.status} - ${await response.text()}`);
      }
      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      text = data.choices?.[0]?.message?.content ?? '';
      setProviderStatus('openai', 'valid');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('429') || msg.includes('rate') || msg.includes('insufficient_quota')) {
        setProviderStatus('openai', 'quota_exceeded', 'Rate Limit ou Cota atingida');
      } else {
        setProviderStatus('openai', 'invalid', msg.slice(0, 40));
      }
      errors.push(`[OpenAI] ${msg}`);
    }
  }

  // ── 5. Anthropic (Cloud) ───────────────────────────────────────────────────
  if (anthropicKey && !text) {
    try {
      const model = process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514';
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) {
        if (response.status === 429) throw Object.assign(new Error(`Anthropic HTTP 429: Rate Limit`), { status: 429 });
        throw new Error(`Falha Anthropic HTTP: ${response.status} - ${await response.text()}`);
      }
      const data = await response.json() as { content: Array<{ text: string }> };
      text = data.content?.[0]?.text ?? '';
      setProviderStatus('anthropic', 'valid');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('429') || msg.includes('rate')) {
        setProviderStatus('anthropic', 'quota_exceeded', 'Rate Limit atingido');
      } else {
        setProviderStatus('anthropic', 'invalid', msg.slice(0, 40));
      }
      errors.push(`[Anthropic] ${msg}`);
    }
  }

  // ── 6. Ollama (Local — Último fallback) ────────────────────────────────────
  if (ollamaModel && !text) {
    try {
      const host = process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434';
      const response = await fetch(`${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt, stream: false, format: 'json',
          options: { temperature: 0.0 }
        }),
      });
      if (!response.ok) {
        if (response.status === 429) throw Object.assign(new Error(`Ollama HTTP 429: Too Many Requests`), { status: 429 });
        throw new Error(`Falha Ollama HTTP: ${response.status}`);
      }
      const data = await response.json() as { response: string };
      text = data.response;
      setProviderStatus('ollama', 'valid');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('429') || (err as any).status === 429) setProviderStatus('ollama', 'quota_exceeded', 'Rate Limit (429)');
      else setProviderStatus('ollama', 'invalid', msg.slice(0, 40));
      errors.push(`[Ollama] ${msg}`);
    }
  }

  if (!text) {
    throw new Error('Todos os provedores configurados falharam em responder.\n' + errors.join('\n'));
  }

  return text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
}

// ─── Entry-point público ─────────────────────────────────────────────────────

export async function runAiDiscovery(cwd: string): Promise<AiAgentOutcome> {
  const projectName = path.basename(cwd);

  // 1. Escanear repositório
  const summary = await scanRepository(cwd);
  const prompt = buildSystemPrompt(summary, projectName);

  // 2. Chamar o LLM
  let rawJson: string;
  try {
    rawJson = await callAiProvider(prompt);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'no-api-key') {
      return {
        ok: false,
        reason: 'no-api-key',
        message:
          'Nenhum provedor de IA configurado.\n' +
          'No seu .env, defina OLLAMA_MODEL, OPENROUTER_API_KEY, GROQ_API_KEY ou GEMINI_API_KEY.',
      };
    }
    return {
      ok: false,
      reason: 'api-error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Parsear JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      ok: false,
      reason: 'parse-error',
      message: `Resposta da IA não é um JSON válido.\n\nResposta recebida:\n${rawJson.slice(0, 300)}`,
    };
  }

  // 4. Auditoria de segurança (antes da validação Zod para remover tasks perigosas)
  const { warnings } = auditTasks(
    ((parsed as { tasks?: Array<{ cmd: string; label: string }> }).tasks ?? [])
  );

  if (warnings.length > 0 && parsed && typeof parsed === 'object' && 'tasks' in parsed) {
    const allTasks = (parsed as { tasks: Array<{ cmd: string; label: string }> }).tasks;
    (parsed as { tasks: typeof allTasks }).tasks = allTasks.filter(
      (t) => !DANGEROUS_PATTERNS.some((p) => p.test(t.cmd)),
    );
  }

  // 5. Validação Zod (fonte de verdade do schema)
  const validation = HorusConfigSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .slice(0, 5)
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    return {
      ok: false,
      reason: 'validation-error',
      message: `JSON gerado não passa na validação do schema:\n${issues}`,
    };
  }

  return {
    ok: true,
    config: validation.data,
    warnings,
  };
}
