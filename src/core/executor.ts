/**
 * executor.ts — Proxy de Execução com execa (Fase 4)
 *
 * Responsabilidades:
 *   - Executar comandos shell de forma transparente (stdio: 'inherit')
 *   - Gerenciar sinais do sistema (SIGINT/SIGTERM) sem deixar processos órfãos
 *   - Classificar e reportar erros com distinção entre cancelamento e falha real
 *   - Suportar passagem de argumentos extras (passthrough de flags)
 *
 * Regras de Ouro implementadas:
 *   ✅  stdio: 'inherit'  — logs, spinners e cores do processo filho chegam intactos
 *   ✅  Lazy import      — módulo não carregado antes da interação do usuário
 *   ✅  Zero process.exit() — retorna ao menu; caller decide próximo passo
 *
 * Chain of Thought — Gerenciamento de Sinais:
 *   1. stdio: 'inherit' faz o terminal ser COMPARTILHADO com o filho.
 *      O SIGINT (Ctrl+C) vai DIRETAMENTE ao filho via o grupo de processos do SO.
 *      O filho morre — o pai (horus) recebe ExecaError com signal: 'SIGINT'.
 *   2. No catch, verificamos: signal === 'SIGINT' → cancelamento voluntário, não falha.
 *      Exibimos mensagem amigável. O loop de sessão volta ao menu normalmente.
 *   3. Nunca registramos um handler process.on('SIGINT') — isso interferiria com o
 *      comportamento natural do @clack/prompts que já usa SIGINT para cancelar prompts.
 */

import { execa, ExecaError } from 'execa';
import * as clack from '@clack/prompts';
import { theme } from '../ui/theme.js';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ExecuteOptions {
  /** Diretório de trabalho para o processo filho. Deve ser caminho absoluto. */
  cwd: string;
  /**
   * Argumentos extras a serem repassados ao comando (passthrough de flags).
   * Ex: `['--force', '--env=prod']`
   * Só funciona quando o comando não usa pipes ou operadores shell (&&, ||).
   * Quando há pipes, os args são ignorados com um aviso.
   */
  extraArgs?: string[];
}

export type ExecuteResult =
  | { ok: true; durationMs: number }
  | { ok: false; reason: 'cancelled' | 'error'; exitCode?: number; message: string };

// ─── Executor Principal ───────────────────────────────────────────────────────

/**
 * Executa um comando shell com total transparência de I/O.
 *
 * Segurança: apenas comandos validados pelo Discovery Engine (parser.ts)
 * devem chegar aqui. O Executor não valida a origem — essa responsabilidade
 * é do caller (run.ts). A validação Zod no parser é a barreira de segurança.
 *
 * @param cmd     Comando completo (pode conter pipes e operadores shell)
 * @param options Opções de execução
 */
export async function executeCommand(
  cmd: string,
  options: ExecuteOptions,
): Promise<ExecuteResult> {
  const { cwd, extraArgs = [] } = options;

  // Detecta se o comando é complexo (pipes/operadores) — não suporta extraArgs nesses casos
  const isComplexCommand = /[|&;]/.test(cmd);

  if (extraArgs.length > 0 && isComplexCommand) {
    clack.log.warn(
      theme.warn('⚠  Argumentos extras ignorados: pipes e operadores (|, &&, ||) não suportam passthrough de flags.'),
    );
  }

  // Para pipes e operadores: usa shell nativo. Para comandos simples: divide em args.
  const execOptions = {
    stdio: 'inherit' as const,
    cwd,
    shell: isComplexCommand || process.platform === 'win32',
    ...(isComplexCommand ? {} : { reject: true }),
  };

  // Constrói o array de argumentos finais
  // Se for comando simples e tiver extraArgs, appenda-os
  const finalCmd = (!isComplexCommand && extraArgs.length > 0)
    ? `${cmd} ${extraArgs.join(' ')}`
    : cmd;

  const startMs = Date.now();

  try {
    if (isComplexCommand) {
      // Modo shell: executa como string única para preservar pipes
      await execa(finalCmd, { ...execOptions, shell: true });
    } else {
      // Modo args: split seguro para comandos simples
      const [bin, ...args] = finalCmd.split(/\s+/).filter(Boolean);
      if (!bin) throw new Error('Comando vazio');
      await execa(bin, args, execOptions);
    }

    const durationMs = Date.now() - startMs;
    return { ok: true, durationMs };

  } catch (error: unknown) {
    const durationMs = Date.now() - startMs;
    return classifyError(error, durationMs);
  }
}

// ─── Classificação de Erros ───────────────────────────────────────────────────

/**
 * Distingue entre cancelamento voluntário (SIGINT) e falha real do comando.
 *
 * Tipos de erro do execa:
 *   - signal === 'SIGINT': usuário apertou Ctrl+C no comando filho
 *   - exitCode !== 0: comando completou com falha (ex: tsc encontrou erros)
 *   - exitCode === undefined: o processo foi morto por sinal (SIGKILL, SIGTERM)
 */
function classifyError(error: unknown, _durationMs: number): ExecuteResult {
  // ExecaError tem shape conhecido — fazemos type guard manual
  if (isExecaError(error)) {
    // Ctrl+C no processo filho
    if (error.signal === 'SIGINT' || error.signal === 'SIGTERM') {
      return {
        ok: false,
        reason: 'cancelled',
        message: 'Comando interrompido pelo usuário.',
      };
    }

    const exitCode = error.exitCode ?? 1;
    return {
      ok: false,
      reason: 'error',
      exitCode,
      message: `Comando encerrou com código ${exitCode}.`,
    };
  }

  // Erro não relacionado ao execa (ex: bin inválido, permissão negada)
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    reason: 'error',
    message,
  };
}

/**
 * Type guard para ExecaError.
 * Evita usar `instanceof` que pode falhar com versões diferentes do execa.
 */
function isExecaError(error: unknown): error is ExecaError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    'command' in error
  );
}

// ─── UI Helper: Exibe resultado da execução ───────────────────────────────────

/**
 * Exibe o resultado de uma execução de forma elegante.
 * Chamado por run.ts após executeCommand() retornar.
 */
export function reportExecutionResult(
  result: ExecuteResult,
  label: string,
): void {
  if (result.ok) {
    const seconds = (result.durationMs / 1000).toFixed(1);
    clack.log.success(
      `${theme.success('✓')} ${theme.bold(label)} ${theme.muted(`concluído em ${seconds}s`)}`,
    );
    return;
  }

  if (result.reason === 'cancelled') {
    clack.log.warn(
      theme.warn(`⚠  ${label} — ${result.message}`),
    );
    return;
  }

  // Falha real: mostra o exit code e orienta o usuário
  clack.log.error(
    theme.error(`✗ ${label} falhou`) +
    (result.exitCode !== undefined
      ? theme.muted(` (exit code: ${result.exitCode})`)
      : ''),
  );
}
