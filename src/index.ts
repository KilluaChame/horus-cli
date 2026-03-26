/**
 * index.ts — Entrypoint do sistema horus (Fase 8.5: Context Dashboard V2)
 *
 * Responsabilidades:
 *   - Parsing de argv (hrs add, hrs list, hrs remove, hrs run, hrs init)
 *   - Loop de sessão persistente baseado em Máquina de Estados
 *   - Apenas "Sair" ou Ctrl+C na HOME encerram o processo
 *
 * ⚡ Boot < 300ms: NENHUM I/O acontece antes do banner.
 *    Registry é carregado LAZY — só quando o usuário seleciona uma ação.
 *
 * Máquina de estados (Fase 8.5):
 *   HOME        → Menu principal: Context Bar + lista de ações
 *   RECENT      → Sub-menu "⭐ Mais Acessados" (top 5 por lastAccessed)
 *   PROJECTS    → Sub-menu "≡ Projetos" com busca textual e cd virtual
 *   RUN         → Execução interativa de tarefas (Discovery Engine)
 *   ADD         → Registro de novo projeto (interativo ou argv)
 *   LIST        → Inspeção do registry com badges e metadados
 *   REMOVE      → Remoção de projeto com confirmação
 *   INIT        → Wizard de inicialização do horus.json
 *   HELP        → Tela de ajuda e atalhos
 *   EXIT        → Encerramento gracioso (único ponto de saída)
 *
 * Estratégia de navegação (Navigation Stack via call stack):
 *   HOME loop → await handler() → handler retorna → volta ao HOME
 *   ESC/Ctrl+C em sub-telas = isCancel() → return → volta um nível
 *   processo.exit() NUNCA é chamado em handlers — apenas em HOME config EXIT
 */

import * as path from 'node:path';
import * as url from 'node:url';
import * as dotenv from 'dotenv';

// Carrega .env da raiz do projeto (relativo ao bundle compilado em dist/)
const __bundleDir = url.fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.resolve(__bundleDir, '..', '.env') });

import * as clack from '@clack/prompts';
import {
  renderBanner,
  renderGreeting,
  renderContextBar,
  theme,
} from './ui/theme.js';
import { wasCancelled } from './ui/prompts.js';
import {
  handleAddCommand,
  handleListCommand,
  handleRemoveCommand,
} from './commands/register.js';
import { handleRunCommand }        from './commands/run.js';
import { handleInitCommand }       from './commands/init.js';
import { handleProjectNavigator, handleRecentProjects } from './commands/projects.js';
import { purgeInvalidProjects }    from './core/registry.js';

// ─── Máquina de estados ───────────────────────────────────────────────────────

type AppState =
  | 'HOME'
  | 'RECENT'
  | 'PROJECTS'
  | 'RUN'
  | 'ADD'
  | 'LIST'
  | 'REMOVE'
  | 'INIT'
  | 'HELP'
  | 'EXIT';

// ─── Argv Parser (zero deps) ──────────────────────────────────────────────────

interface ParsedArgs {
  command: string | null;
  flags: string[];
  args: string[];
}

function parseArgv(): ParsedArgs {
  const raw = process.argv.slice(2);
  const command = raw[0]?.startsWith('-') ? null : (raw[0] ?? null);
  const rest = command ? raw.slice(1) : raw;
  return {
    command,
    flags: rest.filter((a) => a.startsWith('-')),
    args:  rest.filter((a) => !a.startsWith('-')),
  };
}

// ─── Subcomandos diretos (one-shot, sem abrir loop) ──────────────────────────

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

// ─── Help ─────────────────────────────────────────────────────────────────────

function showHelp(): void {
  process.stdout.write(
    [
      '',
      `  ${theme.primary('COMANDOS DISPONÍVEIS:')}`,
      '',
      `    ${theme.accent('hrs')}                    Menu interativo (loop contínuo)`,
      `    ${theme.accent('hrs run')}                Descobre e executa tarefas do projeto`,
      `    ${theme.accent('hrs add')} ${theme.muted('[path]')}        Registra um projeto (padrão: cwd)`,
      `    ${theme.accent('hrs list')}               Lista projetos registrados`,
      `    ${theme.accent('hrs remove')}             Remove projeto do registro`,
      `    ${theme.accent('hrs init')}               Inicializa horus.json no projeto atual`,
      `    ${theme.accent('hrs init --ai')}          IA gera o horus.json ideal`,
      `    ${theme.accent('hrs help')}               Esta ajuda`,
      '',
      `  ${theme.primary('ALIASES:')}`,
      '',
      `    ${theme.muted('add → register  |  list → ls  |  remove → rm  |  horus → hrs')}`,
      '',
      `  ${theme.primary('EXEMPLOS:')}`,
      '',
      `    ${theme.muted('$')} hrs                    ${theme.muted('# Abre o Dashboard')}`,
      `    ${theme.muted('$')} hrs run                ${theme.muted('# Executa tarefas do projeto atual')}`,
      `    ${theme.muted('$')} hrs add .              ${theme.muted('# Registra o diretório atual')}`,
      `    ${theme.muted('$')} hrs init --ai          ${theme.muted('# Gera horus.json com IA')}`,
      '',
    ].join('\n'),
  );
}

function showInlineHelp(): void {
  clack.note(
    [
      `${theme.primary('NAVEGAÇÃO')}`,
      `  ${theme.accent('↑ ↓')}       Navegar entre opções`,
      `  ${theme.accent('Enter')}     Selecionar`,
      `  ${theme.accent('Ctrl+C')}    Voltar um nível  (ESC no menu HOME = confirmar saída)`,
      '',
      `${theme.primary('ATALHOS DIRETOS (sem menu)')}`,
      `  ${theme.accent('hrs run')}         → Executa tarefas do projeto atual`,
      `  ${theme.accent('hrs add .')}       → Registra o projeto atual`,
      `  ${theme.accent('hrs add [path]')}  → Registra um caminho específico`,
      `  ${theme.accent('hrs ls')}          → Inspeciona o registry`,
      `  ${theme.accent('hrs rm')}          → Remove projeto do registry`,
      `  ${theme.accent('hrs init --ai')}   → Gera horus.json com IA`,
      '',
      `${theme.primary('DISCOVERY ENGINE')}`,
      `  Prioridade: ${theme.success('horus.json')} > ${theme.muted('package.json (fallback)')}`,
      `  Hooks npm (pre*/post*) são filtrados automaticamente`,
    ].join('\n'),
    theme.primary('📖 Ajuda — horus CLI'),
  );
}

// ─── Utilitário de path ───────────────────────────────────────────────────────

function normalizePath(p: string): string {
  const resolved = path.resolve(p).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// ─── Menu principal — Máquina de Estados ─────────────────────────────────────

async function showInteractiveMenu(): Promise<void> {
  // 1. Banner ASCII — zero I/O antes deste render
  renderBanner();

  // 2. Saudação uma única vez
  renderGreeting();

  // 3. Estado inicial
  let appState: AppState = 'HOME';

  // ─── Loop principal ──────────────────────────────────────────────────────
  while (appState !== 'EXIT') {

    // ── Estado HOME: Context Bar + Menu Principal ────────────────────────
    if (appState === 'HOME') {
      // Lazy: lê o registry e determina o projeto do cwd
      const { remaining } = purgeInvalidProjects();
      const cwd     = process.cwd();
      const cwdNorm = normalizePath(cwd);
      const cwdProject = remaining.find((p) => normalizePath(p.path) === cwdNorm);

      // Renderiza Context Bar dinâmico
      renderContextBar(cwdProject ? { projectName: cwdProject.name } : {});

      // ── Opções do menu — spec exata do PRD ──────────────────────────────
      type MenuValue =
        | 'recent' | 'projects' | 'run' | 'add' | 'list' | 'remove' | 'init' | 'help' | 'exit';

      const menuOptions: Array<{ value: MenuValue; label: string; hint?: string }> = [
        {
          value: 'recent',
          label: `${theme.accent('⭐')}  Mais Acessados`,
          hint: 'Acesso rápido',
        },
        {
          value: 'projects',
          label: `${theme.white('≡')}  Projetos`,
          hint: 'Navegar e filtrar',
        },
        {
          value: 'run',
          label: `${theme.success('▶')}  Executar comando rápido`,
          hint: 'Descobre scripts no projeto atual',
        },
        {
          value: 'add',
          label: `${theme.accent('+')}  Registrar novo projeto`,
          hint: 'Adicionar pasta atual ou manual',
        },
        {
          value: 'remove',
          label: `${theme.warn('−')}  Remover projeto`,
          hint: 'Desvincular do registro',
        },
        {
          value: 'init',
          label: `${theme.accent('✦')}  Inicializar horus.json`,
          hint: 'Configuração flexível',
        },
        {
          value: 'help',
          label: `${theme.muted('?')}  Ajuda & Atalhos`,
          hint: 'Manual do sistema',
        },
        {
          value: 'exit',
          label: `${theme.muted('✕')}  Sair`,
        },
      ];

      const action = await clack.select({
        message: theme.primary('O que deseja fazer?'),
        options: menuOptions,
      });

      // Ctrl+C na HOME → pergunta se quer sair
      if (wasCancelled(action)) {
        const confirmExit = await clack.confirm({
          message: theme.warn('Deseja encerrar o horus?'),
          initialValue: false,
        });
        if (wasCancelled(confirmExit) || confirmExit === true) {
          appState = 'EXIT';
        }
        continue;
      }

      // Dispatch: string lowercase → estado uppercase
      const stateMap: Record<string, AppState> = {
        recent:  'RECENT',
        projects: 'PROJECTS',
        run:     'RUN',
        add:     'ADD',
        list:    'LIST',
        remove:  'REMOVE',
        init:    'INIT',
        help:    'HELP',
        exit:    'EXIT',
      };
      appState = stateMap[action as string] ?? 'HOME';
      continue;
    }

    // ── Estados de Ação: cada handler await-a e retorna; appState volta a HOME ──
    switch (appState) {
      case 'RECENT':
        await handleRecentProjects();
        appState = 'HOME';
        break;

      case 'PROJECTS':
        await handleProjectNavigator();
        appState = 'HOME';
        break;

      case 'RUN':
        await handleRunCommand([]);
        appState = 'HOME';
        break;

      case 'ADD':
        await handleAddCommand();
        appState = 'HOME';
        break;

      case 'LIST':
        await handleListCommand();
        appState = 'HOME';
        break;

      case 'REMOVE':
        await handleRemoveCommand();
        appState = 'HOME';
        break;

      case 'INIT':
        await handleInitCommand([]);
        appState = 'HOME';
        break;

      case 'HELP':
        showInlineHelp();
        appState = 'HOME';
        break;

      default:
        appState = 'HOME';
        break;
    }
  }

  // Encerramento gracioso — só chega aqui via EXIT explícito
  clack.outro(
    `${theme.muted('👁️  horus encerrado.')} ${theme.muted('Até a próxima!')}`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed  = parseArgv();
  const handled = await handleSubcommand(parsed);
  if (!handled) {
    await showInteractiveMenu();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n${theme.error('✗ Erro fatal:')} ${message}\n`);
  process.exit(1);
});
