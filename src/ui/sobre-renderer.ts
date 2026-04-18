/**
 * sobre-renderer.ts — Renderizador ANSI do banner de branding "sobre".
 *
 * Aplica cores programáticas em palavras-chave de tecnologia detectadas
 * no texto do campo `sobre` do horus.json, gerando um banner visualmente
 * rico sem usar caixas envolventes (clack.note).
 *
 * Padrão de renderização: hint compacto com ícone 💡 (consistente com UX).
 */

import { theme } from './theme.js';

// ─── Mapa de cores por tecnologia ─────────────────────────────────────────────

interface TechColor {
  pattern: RegExp;
  colorize: (text: string) => string;
}

/**
 * Mapeamento de palavras-chave de tecnologia para cores ANSI.
 * Regras de prioridade: padrões mais específicos primeiro.
 */
const TECH_COLORS: TechColor[] = [
  // Azul (cyan) — TypeScript e derivados
  { pattern: /\b(TypeScript|TS|TSX)\b/gi,                  colorize: theme.primary },
  // Verde — Node.js e runtime
  { pattern: /\b(Node\.js|Node|Deno|Bun)\b/gi,             colorize: theme.success },
  // Magenta — Databases e ORMs
  { pattern: /\b(Prisma|Supabase|PostgreSQL|Postgres|MongoDB|MySQL|SQLite|Redis)\b/gi, colorize: theme.purple },
  // Cyan bold — Infraestrutura
  { pattern: /\b(Docker|Kubernetes|K8s|Terraform|Nginx)\b/gi, colorize: theme.primary },
  // Amarelo (accent) — Frameworks frontend
  { pattern: /\b(React|Next\.js|Vite|Vue|Svelte|Angular|Expo|Astro)\b/gi, colorize: theme.accent },
  // Verde bold — Frameworks backend
  { pattern: /\b(NestJS|Express|Fastify|Hono|Koa)\b/gi,    colorize: theme.success },
  // Branco bold — Ferramentas de build
  { pattern: /\b(tsup|esbuild|webpack|Rollup|Turbo|pnpm|npm|yarn)\b/gi, colorize: theme.bold },
  // Amarelo — Linguagens secundárias
  { pattern: /\b(Python|Go|Rust|Java|C#|\.NET|Ruby|PHP)\b/gi, colorize: theme.accent },
  // Verde — Testing
  { pattern: /\b(Jest|Vitest|Playwright|Cypress|pytest)\b/gi, colorize: theme.success },
  // Muted bold — Qualidade
  { pattern: /\b(ESLint|Prettier|Biome|Zod)\b/gi,          colorize: theme.bold },
];

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Renderiza o campo `sobre` como um banner de boas-vindas colorizado.
 *
 * Comportamento:
 *   1. Trunca o texto em 400 caracteres com `…`
 *   2. Aplica cores ANSI nas palavras-chave de tecnologia
 *   3. Renderiza no estilo hint compacto (💡) sem caixas delimitadoras
 *   4. Quebra de linha preservada via indentação de 5 espaços
 *
 * @param text Conteúdo bruto do campo `sobre` no horus.json
 */
export function renderSobreBanner(text: string): void {
  const MAX_LEN = 400;
  const truncated = text.length > MAX_LEN
    ? text.slice(0, MAX_LEN).trim() + '…'
    : text.trim();

  // Aplica colorização de tecnologias
  const colorized = colorizeTechKeywords(truncated);

  // Renderiza no estilo compact hint (consistente com o padrão do run.ts)
  const indented = colorized.replace(/\r?\n/g, `\n     `);
  console.log(`  ${theme.accent('💡')} ${theme.muted(indented)}`);
  console.log(theme.muted(' '));
}

// ─── Colorização de keywords ──────────────────────────────────────────────────

/**
 * Aplica cores ANSI em palavras-chave de tecnologia encontradas no texto.
 * Cada match é envolvido pela função de cor correspondente do theme engine.
 *
 * Nota: como picocolors não suporta "reset parcial", a cor substitui
 * o dim() do muted — isso é intencional para destacar visualmente.
 */
function colorizeTechKeywords(text: string): string {
  let result = text;

  for (const { pattern, colorize } of TECH_COLORS) {
    result = result.replace(pattern, (match) => colorize(match));
  }

  return result;
}
