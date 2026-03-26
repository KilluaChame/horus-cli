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

  // 1. Arquivos de indicador de stack (nível raiz)
  const ROOT_INDICATORS = [
    'package.json', 'pyproject.toml', 'requirements.txt',
    'Cargo.toml', 'go.mod', 'Makefile', 'Dockerfile',
    'docker-compose.yml', 'docker-compose.yaml',
    '.nvmrc', '.node-version', 'pom.xml', 'build.gradle',
  ];

  for (const indicator of ROOT_INDICATORS) {
    const fullPath = path.join(cwd, indicator);
    if (fs.existsSync(fullPath)) {
      lines.push(`[FILE] ${indicator}`);
    }
  }

  // 2. Scripts do package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        name?: string;
        description?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (pkg.name)        lines.push(`[NAME] ${pkg.name}`);
      if (pkg.description) lines.push(`[DESC] ${pkg.description}`);

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const notableDeps = Object.keys(allDeps)
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
    } catch { /* JSON malformado — ignora silenciosamente */ }
  }

  // 3. Subdiretórios dos 2 primeiros níveis de relevância
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']);
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
      .map((e) => e.name)
      .slice(0, 10);
    if (dirs.length) lines.push(`[DIRS] ${dirs.join(', ')}`);
  } catch { /* sem permissão */ }

  return lines.join('\n');
}

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(projectSummary: string, projectName: string): string {
  return `
Você é um especialista em DevOps e Developer Experience (DX). Analise o seguinte contexto de projeto e gere um objeto JSON válido no formato especificado abaixo.

## Contexto do Projeto
\`\`\`
${projectSummary}
\`\`\`

## Regras Obrigatórias

1. Retorne SOMENTE o JSON, sem markdown, sem blocos de código, sem comentários.
2. O JSON deve seguir EXATAMENTE este schema:
{
  "name": "string (nome legível do projeto)",
  "description": "string (descrição concisa, max 80 chars)",
  "tasks": [
    {
      "label": "string (emoji + nome amigável, max 40 chars)",
      "cmd": "string (comando shell exato)",
      "hint": "string (opcional, o que o comando faz, max 60 chars)",
      "group": "string (opcional, categoria: Desenvolvimento | Build | Testes | Deploy | Docker | Git | Banco de Dados | Utilitários)"
    }
  ]
}

3. Use emojis relevantes à stack: 
   - Node.js / npm → 📦  Next.js → ⚡  React → ⚛️  Python → 🐍
   - Docker → 🐳  Rust → 🦀  Go → 🐹  Git → 🌱  Testes → 🧪
   - Deploy → 🚀  Build → 🏗️  Banco de Dados → 🗄️  Lint → 🔍

4. Agrupe tarefas logicamente usando o campo "group".
5. Filtre scripts de hooks do npm (preinstall, postbuild, etc.).
6. Gere no máximo 20 tasks.
7. O campo "name" deve ser "${projectName}" ou um nome mais legível derivado do contexto.
8. NÃO inclua comandos perigosos como rm -rf /, fork bombs, ou comandos destrutivos irreversíveis.
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
  const groqKey   = process.env['GROQ_API_KEY'];
  const geminiKey = process.env['HORUS_GEMINI_KEY'] ?? process.env['GEMINI_API_KEY'];

  if (!groqKey && !geminiKey) {
    throw Object.assign(new Error('Chave de API não encontrada.'), { code: 'no-api-key' });
  }

  let text = '';

  if (groqKey) {
    // ─── Provedor: Groq (Llama 3) ───────────────────────────────────────────
    const { Groq } = await import('groq-sdk');
    const groq = new Groq({ apiKey: groqKey });
    
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    
    text = completion.choices[0]?.message?.content ?? '{}';
  } else {
    // ─── Provedor: Google Gemini ────────────────────────────────────────────
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(geminiKey!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
      },
    });

    const result = await model.generateContent(prompt);
    text = result.response.text();
  }

  // Remove possível wrapper de markdown inserido pelo LLM (em ambos provedores)
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
          'Variáveis de ambiente GROQ_API_KEY ou GEMINI_API_KEY não encontradas.\n' +
          'Exporte com: export GROQ_API_KEY="sua-chave"',
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
