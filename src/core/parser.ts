/**
 * parser.ts — Discovery Engine: lê e valida horus.json ou package.json
 *
 * Fase 3 — Implementação completa.
 *
 * Estratégia de performance:
 *   - Este módulo é importado LAZILY (só quando o usuário solicita "Executar")
 *   - fs.readFileSync é usado intencionalmente: para JSONs <50KB é ~0.3ms,
 *     mais rápido que async (evita overhead de microtask queue)
 *   - existsSync antes de readFileSync: fail-fast sem custo de exceção
 *   - Zod safeParse: nunca lança exceção, retorna Result type
 *
 * Regras de Ouro implementadas:
 *   ✅  Nenhum caminho fixo — sempre path.join + parâmetros
 *   ✅  Validação Zod obrigatória antes de usar qualquer dado do JSON
 *   ✅  Suporte a pipes e operadores de shell nos campos `cmd`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

// ─── Schemas Zod ──────────────────────────────────────────────────────────────

/**
 * Schema de uma tarefa individual no horus.json.
 * O campo `cmd` aceita qualquer string — incluindo pipes (|), operadores (&&, ||)
 * e variáveis de ambiente inline. A validação de shell é responsabilidade do executor.
 */
export const TaskSchema = z.object({
  label: z.string().min(1, 'O label da tarefa não pode estar vazio'),
  cmd:   z.string().min(1, 'O comando não pode estar vazio'),
  hint:  z.string().optional(),
  group: z.string().optional(),
});

/**
 * Schema do arquivo horus.json completo.
 * `tasks` deve ter pelo menos 1 entrada — um horus.json vazio é considerado inválido.
 */
export const HorusConfigSchema = z.object({
  name:        z.string().min(1, 'O nome do projeto não pode estar vazio'),
  description: z.string().optional(),
  tasks:       z.array(TaskSchema).min(1, 'Defina pelo menos 1 tarefa em "tasks"'),
});

/**
 * Schema mínimo do package.json para o fallback.
 * Apenas a chave `scripts` nos interessa; o resto é ignorado.
 */
const PackageJsonSchema = z.object({
  name:    z.string().optional(),
  scripts: z.record(z.string(), z.string()).optional(),
});

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type Task        = z.infer<typeof TaskSchema>;
export type HorusConfig = z.infer<typeof HorusConfigSchema>;

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Prefixos de hooks npm que devem ser filtrados no fallback */
const NPM_HOOK_PREFIXES = ['pre', 'post'] as const;

/**
 * Scripts internos do npm que não fazem sentido como tarefas de usuário.
 * Ex: o `install` em si não é invocável via `npm run install`.
 */
const NPM_INTERNAL_SCRIPTS = new Set([
  'install',
  'publish',
  'pack',
  'restart',
  'stop',
]);

// ─── Resultado da descoberta ──────────────────────────────────────────────────

export type DiscoverySource = 'horus.json' | 'package.json';

export interface DiscoverySuccess {
  ok: true;
  source: DiscoverySource;
  projectName: string;
  tasks: Task[];
}

export interface DiscoveryFailure {
  ok: false;
  reason: 'no-files-found' | 'horus-invalid' | 'no-scripts';
  /** Mensagem legível para exibição no UI */
  message: string;
  /** Se horus.json existia mas era inválido, guarda os erros para log */
  zodErrors?: z.ZodIssue[];
}

export type DiscoveryResult = DiscoverySuccess | DiscoveryFailure;

// ─── Discovery Engine Principal ───────────────────────────────────────────────

/**
 * Ponto de entrada do Discovery Engine.
 *
 * Tenta ler e validar, em ordem:
 *   1. `<projectPath>/horus.json`  → schema HorusConfigSchema
 *   2. `<projectPath>/package.json` → extrai e converte `scripts`
 *
 * @param projectPath Caminho absoluto ao diretório do projeto
 */
export function discoverTasks(projectPath: string): DiscoveryResult {
  const horusJsonPath   = path.join(projectPath, 'horus.json');
  const packageJsonPath = path.join(projectPath, 'package.json');

  // ── Tentativa 1: horus.json ──────────────────────────────────────────────
  if (fs.existsSync(horusJsonPath)) {
    return parseHorusJson(horusJsonPath);
  }

  // ── Tentativa 2: fallback package.json ──────────────────────────────────
  if (fs.existsSync(packageJsonPath)) {
    return parsePackageJson(packageJsonPath);
  }

  // ── Nenhum arquivo encontrado ────────────────────────────────────────────
  return {
    ok: false,
    reason: 'no-files-found',
    message:
      'Nenhum arquivo de configuração encontrado neste diretório.\n' +
      'Crie um horus.json ou certifique-se de estar em um projeto Node.js.',
  };
}

// ─── Parser: horus.json ───────────────────────────────────────────────────────

function parseHorusJson(filePath: string): DiscoveryResult {
  const raw = readJsonFile(filePath);

  if (raw === null) {
    return {
      ok: false,
      reason: 'horus-invalid',
      message: 'O arquivo horus.json não é um JSON válido.',
    };
  }

  const result = HorusConfigSchema.safeParse(raw);

  if (!result.success) {
    // horus.json existe mas é inválido → reporta erros e tenta fallback implícito
    // (o chamador pode decidir se usa package.json como fallback secundário)
    return {
      ok: false,
      reason: 'horus-invalid',
      message: formatZodErrors(result.error.issues),
      zodErrors: result.error.issues,
    };
  }

  return {
    ok: true,
    source: 'horus.json',
    projectName: result.data.name,
    tasks: result.data.tasks,
  };
}

// ─── Parser: package.json (fallback) ─────────────────────────────────────────

function parsePackageJson(filePath: string): DiscoveryResult {
  const raw = readJsonFile(filePath);

  if (raw === null) {
    return {
      ok: false,
      reason: 'no-scripts',
      message: 'O arquivo package.json não é um JSON válido.',
    };
  }

  const result = PackageJsonSchema.safeParse(raw);

  // package.json malformado sem "scripts" → trata como se não houvesse scripts
  const scripts = result.success ? (result.data.scripts ?? {}) : {};
  const projectName = result.success ? (result.data.name ?? 'Projeto') : 'Projeto';

  const tasks = convertScriptsToTasks(scripts);

  if (tasks.length === 0) {
    return {
      ok: false,
      reason: 'no-scripts',
      message:
        'Nenhum script executável encontrado no package.json.\n' +
        'Adicione scripts na chave "scripts" ou crie um horus.json.',
    };
  }

  return {
    ok: true,
    source: 'package.json',
    projectName,
    tasks,
  };
}

// ─── Conversão de scripts do package.json ────────────────────────────────────

/**
 * Converte o objeto `scripts` do package.json em um array de Task.
 *
 * Regras de filtragem (conforme docs/tasks.md):
 *   - Scripts com prefixo "pre" ou "post" são ignorados (hooks npm internos)
 *   - Scripts da lista NPM_INTERNAL_SCRIPTS são ignorados
 *
 * Regra de formatação:
 *   - "start:dev" → label: "📦 Run start:dev"
 *   - "build"     → label: "📦 Run build"
 *   - O cmd é sempre "npm run <script-name>"
 */
function convertScriptsToTasks(scripts: Record<string, string>): Task[] {
  return Object.entries(scripts)
    .filter(([name]) => !isNpmHook(name) && !NPM_INTERNAL_SCRIPTS.has(name))
    .map(([name, originalCmd]) => ({
      label: `📦 Run ${name}`,
      // O cmd usa npm run para garantir que o script seja executado
      // no contexto correto do projeto (PATH, variáveis, etc.)
      cmd:   `npm run ${name}`,
      // Exibe o comando original como hint para transparência
      hint:  originalCmd.length <= 60
        ? originalCmd
        : `${originalCmd.slice(0, 57)}…`,
    }));
}

/**
 * Verifica se um nome de script é um hook npm (pre* ou post*).
 * Apenas hooks "verdadeiros" são filtrados — ex: "preinstall", "postbuild".
 * Scripts que apenas começam com "pre" ou "post" mas não correspondem a
 * nenhum script base são mantidos para não filtrar demais.
 *
 * Estratégia conservadora: filtra tudo com prefixo pre/post.
 * O desenvolvedor pode overridar via horus.json se precisar expor algum.
 */
function isNpmHook(scriptName: string): boolean {
  return NPM_HOOK_PREFIXES.some((prefix) => scriptName.startsWith(prefix));
}

// ─── Utilitário: leitura segura de JSON ──────────────────────────────────────

/**
 * Lê e parseia um arquivo JSON de forma segura.
 * @returns O objeto parseado, ou `null` se o arquivo for inválido.
 *
 * Performance: readFileSync é preferível a readFile async para arquivos
 * pequenos (<50KB) — evita overhead de `await` e microtask scheduling.
 */
function readJsonFile(filePath: string): unknown {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// ─── Formatação de erros Zod ──────────────────────────────────────────────────

/**
 * Converte os erros do Zod em uma string legível para o usuário.
 *
 * Exemplo de saída:
 *   horus.json inválido:
 *     • tasks: Defina pelo menos 1 tarefa em "tasks"
 *     • tasks[0].label: O label da tarefa não pode estar vazio
 */
export function formatZodErrors(issues: z.ZodIssue[]): string {
  const lines = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    return `  • ${path}: ${issue.message}`;
  });

  return `horus.json inválido:\n${lines.join('\n')}`;
}

// ─── Discovery com fallback duplo ─────────────────────────────────────────────

/**
 * Versão do Discovery com fallback automático:
 * Se horus.json existir mas for INVÁLIDO, tenta package.json como segundo fallback.
 *
 * Fluxo:
 *   1. horus.json válido → usa
 *   2. horus.json inválido → avisa + tenta package.json
 *   3. package.json → usa (se tiver scripts)
 *   4. Nada → retorna failure
 *
 * @returns { result, horusWarning? }
 */
export function discoverTasksWithFallback(projectPath: string): {
  result: DiscoveryResult;
  horusWarning?: string;
} {
  const horusJsonPath   = path.join(projectPath, 'horus.json');
  const packageJsonPath = path.join(projectPath, 'package.json');

  // Tentativa 1: horus.json
  if (fs.existsSync(horusJsonPath)) {
    const horusResult = parseHorusJson(horusJsonPath);

    if (horusResult.ok) {
      return { result: horusResult };
    }

    // horus.json inválido → guarda warning e tenta package.json como fallback
    const horusWarning = horusResult.message;

    if (fs.existsSync(packageJsonPath)) {
      const pkgResult = parsePackageJson(packageJsonPath);
      return { result: pkgResult, horusWarning };
    }

    // Sem fallback disponível
    return { result: horusResult, horusWarning };
  }

  // Tentativa 2: só package.json
  if (fs.existsSync(packageJsonPath)) {
    return { result: parsePackageJson(packageJsonPath) };
  }

  // Nada encontrado
  return {
    result: {
      ok: false,
      reason: 'no-files-found',
      message:
        'Nenhum arquivo de configuração encontrado neste diretório.\n' +
        'Crie um horus.json ou certifique-se de estar em um projeto Node.js.',
    },
  };
}
