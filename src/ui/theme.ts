/**
 * theme.ts — Sistema de cores e ASCII art do horus.
 *
 * Usa picocolors exclusivamente:
 *   - Zero dependências transitivas
 *   - ~3x mais rápido no boot que chalk
 *   - Auto-detecta NO_COLOR, CI, e terminais sem suporte ANSI
 */

import pc from 'picocolors';

// ─── Paleta de cores semânticas ─────────────────────────────────────────────

export const theme = {
  /** Cor de destaque principal — índigo vibrante */
  primary: (text: string) => pc.cyan(pc.bold(text)),

  /** Cor de destaque secundária — âmbar */
  accent: (text: string) => pc.yellow(text),

  /** Texto de sucesso */
  success: (text: string) => pc.green(pc.bold(text)),

  /** Texto de erro */
  error: (text: string) => pc.red(pc.bold(text)),

  /** Texto de aviso */
  warn: (text: string) => pc.yellow(text),

  /** Texto apagado / metadata */
  muted: (text: string) => pc.dim(text),

  /** Texto branco puro */
  white: (text: string) => pc.white(text),

  /** Bold simples */
  bold: (text: string) => pc.bold(text),
} as const;

// ─── Banner ASCII ────────────────────────────────────────────────────────────

/**
 * Renderiza o banner ASCII do horus no stdout.
 * O design usa o olho de Horus como metáfora visual.
 */
export function renderBanner(): void {
  const eye = theme.primary(`
    ██╗  ██╗ ██████╗ ██████╗ ██╗   ██╗███████╗
    ██║  ██║██╔═══██╗██╔══██╗██║   ██║██╔════╝
    ███████║██║   ██║██████╔╝██║   ██║███████╗
    ██╔══██║██║   ██║██╔══██╗██║   ██║╚════██║
    ██║  ██║╚██████╔╝██║  ██║╚██████╔╝███████║
    ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝`);

  const tagline = theme.muted('  The All-Seeing Gateway · v0.1.0');
  const separator = theme.muted('  ─────────────────────────────────────────────');

  process.stdout.write(`\n${eye}\n${tagline}\n${separator}\n\n`);
}

// ─── Mensagem de boas-vindas ─────────────────────────────────────────────────

/**
 * Retorna a saudação contextual baseada no horário local.
 * Usa Date para evitar dependências externas.
 */
function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 6) return '🌙 Boa madrugada';
  if (hour < 12) return '🌅 Bom dia';
  if (hour < 18) return '☀️  Boa tarde';
  return '🌆 Boa noite';
}

/**
 * Exibe a saudação inicial com hint de atalho de teclado.
 */
export function renderGreeting(): void {
  const greeting = getGreeting();
  const hint = theme.muted('  Use as setas ↑↓ para navegar · Enter para selecionar · Ctrl+C para sair');

  process.stdout.write(`  ${theme.accent(greeting)}! ${theme.white('Qual projeto vamos acessar hoje?')}\n`);
  process.stdout.write(`${hint}\n\n`);
}
