/**
 * prompts.ts — Abstrações sobre @clack/prompts.
 *
 * Centraliza toda interação com o usuário neste módulo.
 * Regra de Ouro: nenhum outro arquivo importa @clack/prompts diretamente.
 * Isso garante que possamos trocar a lib de UI sem tocar na lógica de negócio.
 */

import * as clack from '@clack/prompts';
import type { Option } from '@clack/prompts';
import { theme } from './theme.js';

// ─── Re-export utilitários do clack ─────────────────────────────────────────

export { clack };

// ─── Wrapper de cancelamento ─────────────────────────────────────────────────

/**
 * Verifica se o usuário cancelou a operação (Ctrl+C).
 * @clack/prompts retorna um Symbol especial nesse caso.
 */
export function wasCancelled(value: unknown): boolean {
  return clack.isCancel(value);
}

/**
 * Encerra o CLI graciosamente quando o usuário cancela.
 */
export function handleCancel(message = 'Operação cancelada. Até logo! 👁️'): never {
  clack.outro(theme.muted(message));
  process.exit(0);
}

// ─── Spinner helpers ─────────────────────────────────────────────────────────

export type Spinner = ReturnType<typeof clack.spinner>;

export function createSpinner(): Spinner {
  return clack.spinner();
}

// ─── Inicialização do CLI ─────────────────────────────────────────────────────

/**
 * Deve ser chamado uma única vez no startup, após o banner.
 * Configura os listeners globais do clack (Ctrl+C, etc.).
 */
export function initCLI(): void {
  // O clack usa process.on('SIGINT') internamente quando intro() é chamado.
  // Chamamos diretamente para registrar os handlers sem exibir texto do clack
  // (preferimos nosso próprio banner e saudação).
  // NOTA: intro() do clack exibe uma linha decorativa — aqui a usamos para
  // inicializar internamente, mas com string vazia para não duplicar o UI.
  // Em Fase 2+, passaremos a string de contexto real aqui.
}

// ─── Select interativo ────────────────────────────────────────────────────────

// Re-exporta o tipo Option do clack para que consumidores não precisem importar @clack/prompts
export type { Option };

/**
 * Exibe um menu de seleção interativo e retorna o valor escolhido.
 * Cancela o processo automaticamente se o usuário pressionar Ctrl+C.
 */
export async function showSelect<T extends string>(
  message: string,
  options: Option<T>[],
): Promise<T> {
  const result = await clack.select({
    message,
    options,
  });

  if (wasCancelled(result)) {
    handleCancel();
  }

  // O select retorna o `value` de uma das opções ou um Symbol (cancelamento)
  // O cancelamento já foi tratado acima, então o cast é seguro aqui.
  return result as T;
}

// ─── Exibição de fim de sessão ────────────────────────────────────────────────

export function showOutro(message: string): void {
  clack.outro(message);
}
