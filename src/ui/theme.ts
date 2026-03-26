/**
 * theme.ts — Sistema de cores e ASCII art do horus (Fase 8).
 *
 * Usa picocolors exclusivamente:
 *   - Zero dependências transitivas
 *   - ~3x mais rápido no boot que chalk
 *   - Auto-detecta NO_COLOR, CI, e terminais sem suporte ANSI
 */

import pc from 'picocolors';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { execSync } from 'node:child_process';

// ─── Paleta de cores semânticas ─────────────────────────────────────────────

export const theme = {
  /** Cor de destaque principal — ciano bold */
  primary: (text: string) => pc.cyan(pc.bold(text)),

  /** Cor de destaque secundária — âmbar */
  accent: (text: string) => pc.yellow(text),

  /** Texto de sucesso */
  success: (text: string) => pc.green(pc.bold(text)),

  /** Texto de erro */
  error: (text: string) => pc.red(pc.bold(text)),

  /** Texto de aviso */
  warn: (text: string) => pc.yellow(text),

  /** Texto roxo (cota excedida) */
  purple: (text: string) => pc.magenta(pc.bold(text)),

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
 */
export function renderBanner(): void {
  const eye = theme.primary(`
    ██╗  ██╗ ██████╗ ██████╗ ██╗   ██╗███████╗
    ██║  ██║██╔═══██╗██╔══██╗██║   ██║██╔════╝
    ███████║██║   ██║██████╔╝██║   ██║███████╗
    ██╔══██║██║   ██║██╔══██╗██║   ██║╚════██║
    ██║  ██║╚██████╔╝██║  ██║╚██████╔╝███████║
    ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝`);

  const tagline  = theme.muted('  The All-Seeing Gateway · v0.1.0');
  const separator = theme.muted('  ─────────────────────────────────────────────');

  process.stdout.write(`\n${eye}\n${tagline}\n${separator}\n\n`);
}

// ─── Mensagem de boas-vindas ─────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6)  return '🌙 Boa madrugada';
  if (hour < 12) return '🌅 Bom dia';
  if (hour < 18) return '☀️  Boa tarde';
  return '🌆 Boa noite';
}

export function renderGreeting(): void {
  const greeting = getGreeting();
  const hint = theme.muted('  Use as setas ↑↓ para navegar · Enter para selecionar · Ctrl+C para sair');
  process.stdout.write(`  ${theme.accent(greeting)}! ${theme.white('Qual projeto vamos acessar hoje?')}\n`);
  process.stdout.write(`${hint}\n\n`);
}

// ─── Status Bar Dinâmico ──────────────────────────────────────────────────────

export interface ContextBarOptions {
  /** Nome do projeto ativo (se o cwd estiver no registry) */
  projectName?: string;
}

/**
 * Tenta ler o branch git atual do cwd.
 * Silencioso: retorna undefined em qualquer falha (sem git, sem repo, etc.)
 */
export function readGitBranch(cwd: string): string | undefined {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 500,
      encoding: 'utf-8',
    }).trim();
    return branch.length > 0 ? branch : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Renderiza o Status Bar de contexto abaixo do banner.
 *
 * Formato:
 *   ─────────────────────────────────
 *   👁️  LOCAL:   C:\Projetos\App  [branch: main]
 *   🏷️  PROJETO: App [Ativo]
 *   ─────────────────────────────────
 */
export function renderContextBar(options: ContextBarOptions = {}): void {
  const cwd = process.cwd();
  const sep = theme.muted('  ─────────────────────────────────────────────');

  const branch = readGitBranch(cwd);
  const branchLabel = branch ? theme.muted(` [branch: ${branch}]`) : '';

  const localLine = `  ${theme.muted('👁️  LOCAL:')}   ${pc.cyan(cwd)}${branchLabel}`;

  const projectLine = options.projectName
    ? `  ${theme.muted('🏷️  PROJETO:')} ${pc.green(pc.bold(options.projectName))} ${theme.muted('[Ativo]')}`
    : `  ${theme.muted('🏷️  PROJETO:')} ${theme.muted(path.basename(cwd))} ${theme.muted('(não registrado)')}`;

  process.stdout.write(`${sep}\n${localLine}\n${projectLine}\n${sep}\n\n`);
}

// ─── Pausa pós-execução ───────────────────────────────────────────────────────

/**
 * Aguarda qualquer tecla após a execução de um comando delegado.
 * Em vez de fechar o CLI, retorna ao menu principal.
 *
 * Usa raw mode (TTY) com fallback para readline (CI/pipes).
 * ESM-safe: usa import estático de node:readline, sem require().
 */
export async function waitForKeypress(): Promise<void> {
  process.stdout.write(
    `\n  ${theme.muted('▶ Pressione')} ${theme.accent('qualquer tecla')} ${theme.muted('para voltar ao menu...')}\n`,
  );

  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      });
    } else {
      // Fallback ESM-safe: readline importado estaticamente no topo
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', () => {
        rl.close();
        resolve();
      });
    }
  });
}
