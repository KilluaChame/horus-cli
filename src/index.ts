/**
 * index.ts — Entrypoint do sistema horus (Fase 6: Stateful Navigation Loop)
 *
 * Responsabilidades:
 *   - Parsing de argv (hrs add, hrs list, hrs remove, hrs run, hrs init)
 *   - Loop de sessão persistente: o menu principal nunca fecha sozinho
 *   - Apenas a opção "Sair" explícita encerra o processo
 *
 * ⚡ Regra de performance: NENHUM I/O acontece antes do banner.
 *    Registry e parser são carregados LAZY — apenas quando o usuário
 *    seleciona uma ação que precisa deles.
 *
 * Máquina de estados:
 *   O loop é controlado por um simples `while (running)`.
 *   Cada ação retorna ao menu principal ao concluir.
 *   Somente `action === 'exit'` seta `running = false`.
 */

import * as clack from '@clack/prompts';
import { renderBanner, renderGreeting, theme } from './ui/theme.js';
import { wasCancelled } from './ui/prompts.js';
import {
  handleAddCommand,
  handleListCommand,
  handleRemoveCommand,
} from './commands/register.js';
import { handleRunCommand } from './commands/run.js';
import { handleInitCommand } from './commands/init.js';

// ─── Argv Parser (leve, sem dependência) ─────────────────────────────────────

interface ParsedArgs {
  command: string | null;
  flags: string[];    // --flag ou -f
  args: string[];     // argumentos posicionais sem --
}

/**
 * Parser minimalista de argv. Sem dependências externas.
 * Separa flags (--watch), args posicionais e o comando principal.
 */
function parseArgv(): ParsedArgs {
  const raw = process.argv.slice(2);
  const command = raw[0]?.startsWith('-') ? null : (raw[0] ?? null);
  const rest = command ? raw.slice(1) : raw;

  const flags = rest.filter((a) => a.startsWith('-'));
  const args  = rest.filter((a) => !a.startsWith('-'));

  return { command, flags, args };
}

// ─── Subcomandos diretos ─────────────────────────────────────────────────────

/**
 * Executa um subcomando se fornecido via argv.
 * Subcomandos diretos operam em modo one-shot (não abrem o loop).
 * @returns true se processou um subcomando, false se deve exibir o menu.
 */
async function handleSubcommand(parsed: ParsedArgs): Promise<boolean> {
  switch (parsed.command) {
    case 'run': {
      renderBanner();
      await handleRunCommand(parsed.args);
      clack.outro(theme.muted('👁️  horus encerrado. Até a próxima!'));
      return true;
    }

    case 'add':
    case 'register': {
      renderBanner();
      await handleAddCommand(parsed.args[0]);
      clack.outro(theme.muted('👁️  horus encerrado. Até a próxima!'));
      return true;
    }

    case 'list':
    case 'ls': {
      renderBanner();
      await handleListCommand();
      clack.outro(theme.muted('👁️  horus encerrado. Até a próxima!'));
      return true;
    }

    case 'remove':
    case 'rm': {
      renderBanner();
      await handleRemoveCommand();
      clack.outro(theme.muted('👁️  horus encerrado. Até a próxima!'));
      return true;
    }

    case 'init': {
      renderBanner();
      await handleInitCommand(parsed.flags);
      clack.outro(theme.muted('👁️  horus encerrado. Até a próxima!'));
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
      return false;
  }
}

// ─── Help ────────────────────────────────────────────────────────────────────

function showHelp(): void {
  const lines = [
    '',
    `  ${theme.primary('COMANDOS DISPONÍVEIS:')}`,
    '',
    `    ${theme.accent('hrs')}                    Menu interativo (loop contínuo)`,
    `    ${theme.accent('hrs run')}                Descobre e executa tarefas do projeto`,
    `    ${theme.accent('hrs add')} ${theme.muted('[path]')}        Registra um projeto (padrão: diretório atual)`,
    `    ${theme.accent('hrs list')}               Lista projetos registrados`,
    `    ${theme.accent('hrs remove')}             Remove projeto do registro`,
    `    ${theme.accent('hrs init')}               Inicializa um horus.json no projeto atual`,
    `    ${theme.accent('hrs init --ai')}          Usa IA para gerar o horus.json ideal`,
    `    ${theme.accent('hrs help')}               Exibe esta ajuda`,
    '',
    `  ${theme.primary('ALIASES:')}`,
    '',
    `    ${theme.muted('add → register  |  list → ls  |  remove → rm  |  horus → hrs')}`,
    '',
    `  ${theme.primary('EXEMPLOS:')}`,
    '',
    `    ${theme.muted('$')} hrs                    ${theme.muted('# Menu interativo persistente')}`,
    `    ${theme.muted('$')} hrs run                ${theme.muted('# Descobre tarefas do projeto atual')}`,
    `    ${theme.muted('$')} hrs run -- --watch     ${theme.muted('# Repassa a flag --watch ao comando')}`,
    `    ${theme.muted('$')} hrs add .              ${theme.muted('# Registra o diretório atual')}`,
    `    ${theme.muted('$')} hrs add ~/projetos/api ${theme.muted('# Registra diretório específico')}`,
    `    ${theme.muted('$')} hrs init --ai          ${theme.muted('# Gera horus.json com IA')}`,
    '',
  ];

  process.stdout.write(lines.join('\n') + '\n');
}

// ─── Menu de Ajuda embutido (exibido inline no loop) ────────────────────────

function showInlineHelp(): void {
  clack.note(
    [
      `${theme.primary('NAVEGAÇÃO')}`,
      `  Use ${theme.accent('↑ ↓')} para navegar  ·  ${theme.accent('Enter')} para selecionar`,
      `  Selecione ${theme.accent('"Sair"')} ou pressione ${theme.accent('Ctrl+C')} para encerrar`,
      '',
      `${theme.primary('ATALHOS DIRETOS (sem menu)')}`,
      `  ${theme.accent('hrs run')}         → Executa tarefas do projeto atual`,
      `  ${theme.accent('hrs add .')}       → Registra o projeto atual`,
      `  ${theme.accent('hrs add [path]')}  → Registra um caminho específico`,
      `  ${theme.accent('hrs ls')}          → Lista projetos registrados`,
      `  ${theme.accent('hrs rm')}          → Remove projeto do registro`,
      `  ${theme.accent('hrs init --ai')}   → Gera horus.json com IA`,
      '',
      `${theme.primary('DISCOVERY ENGINE')}`,
      `  Prioridade: ${theme.success('horus.json')} > ${theme.muted('package.json (fallback)')}`,
      `  Hooks npm (pre*/post*) são filtrados automaticamente`,
    ].join('\n'),
    theme.primary('📖 Ajuda — horus CLI'),
  );
}

// ─── Menu interativo principal com Loop de Sessão ────────────────────────────

async function showInteractiveMenu(): Promise<void> {
  // 1. Banner ASCII — zero I/O antes disso
  renderBanner();

  // 2. Saudação contextual (exibida apenas uma vez)
  renderGreeting();

  // 3. Loop de Sessão Infinito (Fase 6: Stateful Navigation)
  //    O menu só fecha quando o usuário escolher explicitamente "Sair".
  let running = true;

  while (running) {
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
          value: 'init',
          label: `${theme.accent('✦')}  Inicializar horus.json`,
          hint: 'Gera o arquivo de configuração no projeto atual',
        },
        {
          value: 'help',
          label: `${theme.muted('?')}  Ajuda / Comandos`,
          hint: 'Atalhos, discovery engine e exemplos',
        },
        {
          value: 'exit',
          label: `${theme.muted('✕')}  Sair`,
        },
      ],
    });

    // Ctrl+C no menu principal → confirma saída em vez de quebrar
    if (wasCancelled(action)) {
      const confirmExit = await clack.confirm({
        message: theme.warn('Deseja encerrar o horus?'),
        initialValue: false,
      });

      if (wasCancelled(confirmExit) || confirmExit) {
        running = false;
      }

      continue; // Volta ao topo do loop
    }

    // ─── Dispatch por ação ───────────────────────────────────────────────────
    switch (action) {
      case 'run':
        await handleRunCommand([]);
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

      case 'init':
        await handleInitCommand([]);
        break;

      case 'help':
        showInlineHelp();
        break;

      case 'exit':
        running = false;
        break;
    }
  }

  // 4. Encerramento gracioso — só chega aqui se o usuário escolheu "Sair"
  clack.outro(
    `${theme.muted('👁️  horus encerrado.')} ${theme.muted('Até a próxima!')}`,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed = parseArgv();

  // Tenta executar subcomando direto (hrs add, hrs list, etc.) — one-shot
  const handled = await handleSubcommand(parsed);

  // Se nenhum subcomando foi processado, abre o loop interativo persistente
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
