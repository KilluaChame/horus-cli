/**
 * index.ts — Entrypoint do sistema horus.
 *
 * Responsabilidades:
 *   - Parsing de argv (hrs add, hrs list, hrs remove, hrs run)
 *   - Menu interativo principal (quando invocado sem subcomando)
 *   - Orquestração de banner e saudação
 *
 * ⚡ Regra de performance: NENHUM I/O acontece antes do banner.
 *    Registry e parser são carregados LAZY — apenas quando o usuário
 *    seleciona uma ação que precisa deles.
 */

import * as clack from '@clack/prompts';
import { renderBanner, renderGreeting, theme } from './ui/theme.js';
import { wasCancelled, handleCancel } from './ui/prompts.js';
import {
  handleAddCommand,
  handleListCommand,
  handleRemoveCommand,
} from './commands/register.js';
import { handleRunCommand } from './commands/run.js';

// ─── Argv Parser (leve, sem dependência) ─────────────────────────────────────

interface ParsedArgs {
  command: string | null;
  args: string[];
}

/**
 * Parser minimalista de argv. Sem dependências externas.
 * process.argv = ['node', 'horus.js', ...subcommand, ...args]
 */
function parseArgv(): ParsedArgs {
  const raw = process.argv.slice(2); // Remove 'node' e o script path
  const command = raw[0] ?? null;
  const args = raw.slice(1);
  return { command, args };
}

// ─── Subcomandos diretos ─────────────────────────────────────────────────────

/**
 * Executa um subcomando se fornecido via argv.
 * @returns true se processou um subcomando, false se deve exibir o menu.
 */
async function handleSubcommand(parsed: ParsedArgs): Promise<boolean> {
  switch (parsed.command) {
    case 'run': {
      renderBanner();
      await handleRunCommand();
      clack.outro(theme.muted('👁️  horus encerrado. Até a próxima!'));
      return true;
    }

    case 'add':
    case 'register': {
      renderBanner();
      // hrs add [path] — se não informar path, usa cwd
      await handleAddCommand(parsed.args[0]);
      return true;
    }

    case 'list':
    case 'ls': {
      renderBanner();
      await handleListCommand();
      return true;
    }

    case 'remove':
    case 'rm': {
      renderBanner();
      await handleRemoveCommand();
      return true;
    }

    case 'help':
    case '--help':
    case '-h': {
      renderBanner();
      showHelp();
      return true;
    }

    default:
      return false; // Nenhum subcomando reconhecido → menu interativo
  }
}

// ─── Help ────────────────────────────────────────────────────────────────────

function showHelp(): void {
  const lines = [
    '',
    `  ${theme.primary('COMANDOS DISPONÍVEIS:')}`,
    '',
    `    ${theme.accent('hrs')}                    Menu interativo principal`,
    `    ${theme.accent('hrs run')}                Descobre e executa tarefas do projeto`,
    `    ${theme.accent('hrs add')} ${theme.muted('[path]')}        Registra um projeto (padrão: diretório atual)`,
    `    ${theme.accent('hrs list')}               Lista projetos registrados`,
    `    ${theme.accent('hrs remove')}             Remove projeto do registro`,
    `    ${theme.accent('hrs help')}               Exibe esta ajuda`,
    '',
    `  ${theme.primary('ALIASES:')}`,
    '',
    `    ${theme.muted('add → register  |  list → ls  |  remove → rm')}`,
    '',
    `  ${theme.primary('EXEMPLOS:')}`,
    '',
    `    ${theme.muted('$')} hrs                    ${theme.muted('# Menu interativo')}`,
    `    ${theme.muted('$')} hrs run                ${theme.muted('# Descobre tarefas do projeto atual')}`,
    `    ${theme.muted('$')} hrs add .              ${theme.muted('# Registra o projeto do diretório atual')}`,
    `    ${theme.muted('$')} hrs add ~/projetos/api ${theme.muted('# Registra um projeto específico')}`,
    '',
  ];

  process.stdout.write(lines.join('\n') + '\n');
}

// ─── Menu interativo principal ───────────────────────────────────────────────

async function showInteractiveMenu(): Promise<void> {
  // 1. Banner ASCII — zero I/O antes disso
  renderBanner();

  // 2. Saudação contextual
  renderGreeting();

  // 3. Menu principal
  const action = await clack.select({
    message: theme.primary('O que deseja fazer?'),
    options: [
      {
        value: 'run',
        label: `${theme.success('▶')}  Executar comando de um projeto`,
        hint: 'Detecta horus.json ou package.json',
      },
      {
        value: 'add',
        label: `${theme.accent('+')}  Registrar projeto`,
        hint: 'Salva o caminho em ~/.horus/registry.json',
      },
      {
        value: 'list',
        label: `${theme.white('≡')}  Listar projetos registrados`,
        hint: 'Todos os projetos mapeados globalmente',
      },
      {
        value: 'remove',
        label: `${theme.warn('−')}  Remover projeto do registro`,
        hint: 'Desvincula sem apagar o diretório',
      },
      {
        value: 'exit',
        label: `${theme.muted('✕')}  Sair`,
      },
    ],
  });

  // Ctrl+C
  if (wasCancelled(action)) {
    handleCancel();
  }

  // ─── Handlers por ação ──────────────────────────────────────────────────

  switch (action) {
    case 'run':
      await handleRunCommand();
      break;

    case 'add':
      await handleAddCommand();
      break;

    case 'list':
      await handleListCommand();
      break;

    case 'remove':
      await handleRemoveCommand();
      break;

    case 'exit':
    default:
      break;
  }

  // 4. Encerramento gracioso
  clack.outro(
    `${theme.muted('👁️  horus encerrado.')} ${theme.muted('Até a próxima!')}`,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed = parseArgv();

  // Tenta executar subcomando direto (hrs add, hrs list, etc.)
  const handled = await handleSubcommand(parsed);

  // Se nenhum subcomando foi processado, exibe o menu interativo
  if (!handled) {
    await showInteractiveMenu();
  }
}

// ─── Execução com tratamento de erro global ──────────────────────────────────

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n${theme.error('✗ Erro fatal:')} ${message}\n`);
  process.exit(1);
});
