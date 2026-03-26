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

import * as fs   from 'node:fs';
import * as path from 'node:path';
import * as os   from 'node:os';
import { z }     from 'zod';
import { HorusConfigSchema } from './parser.js';

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
  /rm\s+-rf?\s+\/(?!\w)/,         // rm -rf /
  /:\(\)\{.*\|.*&\};:/,           // fork bomb
  /dd\s+if=\/dev\/zero/,          // dd nuke
  /mkfs\./,                       // formatar partição
  /shutdown|halt|reboot/,
  /curl.*\|.*sh/,                  // pipe-to-shell
  /wget.*\|.*sh/,
  /chmod\s+777\s+\//,
  />\s*\/etc\/passwd/,
];

// ─── Scanner de Repositório ──────────────────────────────────────────────────

/**
 * Produz um sumário compacto do projeto para enviar ao LLM.
 * Varre apenas 2 níveis de profundidade para manter o payload pequeno.
 */
export function scanRepository(cwd: string): string {
  const lines: string[] = [];
  const entries = (() => {
    try {
      return fs.readdirSync(cwd, { withFileTypes: true });
    } catch {
      return [];
    }
  })();

  // 1. Arquivos de indicador de stack (nível raiz)
  const ROOT_INDICATORS = new Set([
    'package.json', 'pyproject.toml', 'requirements.txt',
    'Cargo.toml', 'go.mod', 'Makefile', 'Dockerfile',
    'docker-compose.yml', 'docker-compose.yaml',
    'pom.xml', 'build.gradle',
  ]);

  const indicatorsFound: string[] = [];
  const executablesFound: string[] = [];
  
  // Extensões que costumam representar entrypoints ou scripts
  const EXEC_EXT = new Set(['.exe', '.bat', '.ps1', '.sh', '.py', '.au3', '.cmd']);

  for (const e of entries) {
    if (e.isFile()) {
      if (ROOT_INDICATORS.has(e.name)) {
        indicatorsFound.push(e.name);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (EXEC_EXT.has(ext)) {
          executablesFound.push(e.name);
        }
      }
    }
  }

  if (indicatorsFound.length) lines.push(`[STACK FILES] ${indicatorsFound.join(', ')}`);
  if (executablesFound.length) lines.push(`[EXECUTABLES] ${executablesFound.join(', ')}`);

  // Extrair resumo do README se existir para contexto
  const readmePath = entries.find((e) => e.name.toLowerCase().startsWith('readme.md'))?.name;
  if (readmePath) {
    try {
      const readme = fs.readFileSync(path.join(cwd, readmePath), 'utf-8');
      const snippet = readme.slice(0, 2500); // Passamos até 2500 chars do README real
      lines.push(`[README EXTRACT]\n${snippet}\n[END README]`);
    } catch { /* Ignora erro ao ler README */ }
  }

  // 2. Scripts do package.json (se existir)
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        name?: string;
        description?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      if (pkg.name)        lines.push(`[NAME] ${pkg.name}`);
      if (pkg.description) lines.push(`[DESC] ${pkg.description}`);

      const notableDeps = Object.keys(pkg.dependencies ?? {})
        .filter((d) => !d.startsWith('@types/'))
        .slice(0, 30);
      if (notableDeps.length) lines.push(`[DEPS] ${notableDeps.join(', ')}`);

      const NPM_HOOKS = /^(pre|post)\w+$/;
      const scripts = Object.entries(pkg.scripts ?? {})
        .filter(([k]) => !NPM_HOOKS.test(k))
        .map(([k, v]) => `  "${k}": "${v}"`);
      if (scripts.length) {
        lines.push('[SCRIPTS]');
        lines.push(...scripts);
      }
    } catch { /* JSON malformado ignora */ }
  }

  // 3. Subdiretórios dos 2 primeiros níveis
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']);
  const dirs = entries
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map((e) => e.name)
    .slice(0, 10);
    
  if (dirs.length) lines.push(`[DIRS] ${dirs.join(', ')}`);

  return lines.join('\n');
}

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(projectSummary: string, projectName: string): string {
  return `
Você é um especialista em DevOps e Developer Experience (DX). Analise o seguinte contexto de projeto e gere um objeto JSON válido no formato especificado abaixo.

## Contexto Extraído do Diretório
\`\`\`
${projectSummary}
\`\`\`

## REGRAS CRÍTICAS DE INFERÊNCIA
- NÃO ALUCINE TAREFAS. Se você NÃO ver um "package.json", NÃO gere comandos como "npm install" ou "npm run dev".
- Se você NÃO ver um "Dockerfile", NÃO gere "docker run" ou "docker build".
- Se o projeto possuir arquivos em [EXECUTABLES] (.exe, .bat, .au3, .sh, .py), CRIE tarefas diretas que executem ou manipulem esses arquivos! Exemplo: Para um arquivo "Launcher_GUI_1.1.exe", crie a task "Launcher_GUI_1.1.exe" no Windows.
- Para abrir executáveis no Windows powershell, o comando muitas vezes é apenas o nome do executável, ex: ".\\Launcher_GUI_1.1.exe".

## Regras Obrigatórias do JSON
1. Retorne SOMENTE o JSON, sem markdown, sem blocos de código, sem comentários.
2. O JSON deve seguir EXATAMENTE este schema:
{
  "name": "string (nome legível do projeto, sem underlines)",
  "description": "string (descrição concisa, max 80 chars, use Dicas do README se houver)",
  "tasks": [
    {
      "label": "string (emoji + nome amigável, max 40 chars)",
      "cmd": "string (comando shell exato para executar)",
      "hint": "string (opcional, instrução clara do que isso faz)",
      "group": "string (opcional: Desenvolvimento | Executáveis | Build | Testes | Deploy | Utilidades)"
    }
  ]
}

3. Use emojis relevantes: Executável = ⚙️  | Python = 🐍 | JS/TS = 📦 | Shell/Bat = 🪟 | Docker = 🐳
4. Gere no máximo 15 tasks relevantes. Filtre as inúteis.
5. O campo "name" deve ser derivado do contexto ou "${projectName}".
6. NÃO inclua comandos destrutivos (rm -rf, etc).
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
  const ollamaModel   = process.env['OLLAMA_MODEL'];
  const openRouterKey = process.env['OPENROUTER_API_KEY'];
  const groqKey       = process.env['GROQ_API_KEY'];
  const geminiKey     = process.env['HORUS_GEMINI_KEY'] ?? process.env['GEMINI_API_KEY'];

  if (!ollamaModel && !openRouterKey && !groqKey && !geminiKey) {
    throw Object.assign(new Error('Nenhum provedor de IA encontrado.'), { code: 'no-api-key' });
  }

  let text = '';
  const errors: string[] = [];

  // 1. Provedor Local (Ollama)
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
      if (!response.ok) throw new Error(`Falha Ollama HTTP: ${response.status}`);
      const data = await response.json() as { response: string };
      text = data.response;
    } catch (err) {
      errors.push(`[Ollama] ${(err as Error).message}`);
    }
  }

  // 2. Provedor Nuvem (OpenRouter)
  if (openRouterKey && !text) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/KilluaChame/horus-cli',
          'X-Title': 'Horus CLI',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          response_format: { type: 'json_object' }
        }),
      });
      if (!response.ok) throw new Error(`Falha OpenRouter HTTP: ${response.status} - ${await response.text()}`);
      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      text = data.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      errors.push(`[OpenRouter] ${(err as Error).message}`);
    }
  }

  // 3. Provedor Nuvem (Groq)
  if (groqKey && !text) {
    try {
      const { Groq } = await import('groq-sdk');
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.1-8b-instant',
        response_format: { type: 'json_object' },
        temperature: 0,
      });
      text = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      errors.push(`[Groq] ${(err as Error).message}`);
    }
  }

  // 4. Provedor Nuvem (Gemini)
  if (geminiKey && !text) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      });
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch (err) {
      errors.push(`[Gemini] ${(err as Error).message}`);
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
  const summary = scanRepository(cwd);
  const prompt  = buildSystemPrompt(summary, projectName);

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
