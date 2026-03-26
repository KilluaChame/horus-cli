/**
 * run.ts — Lógica principal de execução interativa (Fase 8)
 *
 * Orquestra o fluxo completo:
 *   1. Detecta o projeto alvo (cwd ou seleção do registry)
 *   2. Roda o Discovery Engine (parser.ts)
 *   3. Apresenta o menu de tarefas via @clack/prompts
 *   4. Delega ao Executor Proxy (executor.ts) com stdio: 'inherit'
 *   5. Após execução, pausa com waitForKeypress() e volta ao menu de tarefas
 *
 * Regra de performance: este módulo é importado LAZILY no index.ts
 * (só quando o usuário escolhe "Executar" no menu principal).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as clack from '@clack/prompts';
import { discoverTasksWithFallback, type Task } from '../core/parser.js';
import { purgeInvalidProjects, touchProject } from '../core/registry.js';
import { executeCommand, reportExecutionResult } from '../core/executor.js';
import { theme, waitForKeypress } from '../ui/theme.js';
import { wasCancelled } from '../ui/prompts.js';
import { handleInitCommand } from './init.js';

// ─── Handler principal ────────────────────────────────────────────────────────

/**
 * Ponto de entrada do fluxo "Executar".
 * Chamado tanto pelo menu interativo quanto pelo subcomando `hrs run`.
 */
export async function handleRunCommand(extraArgs: string[] = []): Promise<void> {
  // 1. Resolve o diretório do projeto alvo
  const projectPath = await resolveProjectPath();

  if (!projectPath) {
    return; // Usuário cancelou ou sem projetos disponíveis
  }

  // 2. Discovery Engine — lê horus.json ou package.json
  const spinner = clack.spinner();
  spinner.start(theme.muted(`Analisando ${path.basename(projectPath)}...`));

  const { result, horusWarning } = discoverTasksWithFallback(projectPath);

  spinner.stop('');

  // 3. Trata warnings de horus.json inválido (mas com fallback disponível)
  if (horusWarning) {
    clack.log.warn(
      theme.warn('⚠  horus.json inválido — usando fallback package.json:\n') +
      theme.muted(horusWarning),
    );
  }

  // 4. Falha total do Discovery Engine — aciona Smart Init
  if (!result.ok) {
    clack.log.warn(theme.warn(`⚠  ${result.message}`));

    const shouldInit = await clack.confirm({
      message: theme.primary('Deseja inicializar o horus.json agora?'),
      initialValue: true,
    });

    if (!wasCancelled(shouldInit) && shouldInit === true) {
      // Redireciona para o wizard de init (muda cwd para o projeto primeiro)
      const prevCwd = process.cwd();
      if (prevCwd !== projectPath) {
        try { process.chdir(projectPath); } catch { /* ignora — init tentativo */ }
      }
      await handleInitCommand([]);
    } else {
      clack.note(
        [
          `  ${theme.accent('1.')} Crie um ${theme.bold('horus.json')} na raiz do projeto`,
          `  ${theme.accent('2.')} Adicione ${theme.bold('scripts')} ao ${theme.bold('package.json')}`,
          `  ${theme.accent('3.')} Ou registre outro projeto com ${theme.bold('hrs add <path>')}`,
        ].join('\n'),
        theme.primary('📖 Como configurar'),
      );
    }
    return;
  }

  // 5. Exibe o menu de tarefas descobertas
  await showTaskMenu(result.projectName, result.tasks, result.source, projectPath, extraArgs);
}

// ─── Resolução do projeto alvo ─────────────────────────────────────────────

/**
 * Determina o projeto alvo:
 *   1. Se o cwd está registrado no registry → usa automaticamente
 *   2. Se o cwd possui horus.json ou package.json → usa cwd diretamente
 *   3. Se há projetos registrados → abre menu de seleção
 *   4. Se não há projetos → sugere `hrs add .`
 *
 * @returns Caminho absoluto do projeto, ou null se o usuário cancelou.
 */
async function resolveProjectPath(): Promise<string | null> {
  const cwd = process.cwd();

  const { remaining } = purgeInvalidProjects();
  const cwdNormalized = normalizePath(cwd);
  const cwdProject = remaining.find(
    (p) => normalizePath(p.path) === cwdNormalized,
  );

  // Caso 1: cwd está registrado — usa diretamente
  if (cwdProject) {
    clack.log.info(
      theme.muted(`📁 Projeto detectado: `) + theme.accent(cwdProject.name),
    );
    touchProject(cwd);
    return cwd;
  }

  // Caso 2: cwd tem config local → usa cwd sem registrar
  const hasCwdConfig =
    fs.existsSync(path.join(cwd, 'horus.json')) ||
    fs.existsSync(path.join(cwd, 'package.json'));

  if (hasCwdConfig) {
    const basename = path.basename(cwd);
    clack.log.info(
      theme.muted(`📁 Usando diretório atual: `) + theme.accent(basename),
    );
    return cwd;
  }

  // Caso 3: Sem projeto local → seleciona do registry
  if (remaining.length === 0) {
    clack.note(
      [
        theme.muted('Nenhum projeto registrado e o diretório atual não'),
        theme.muted('possui horus.json nem package.json.'),
        '',
        `${theme.muted('→ Navegue até um projeto e rode:')} ${theme.accent('hrs add .')}`,
      ].join('\n'),
      theme.warn('⚠ Sem projetos disponíveis'),
    );
    return null;
  }

  // Menu de seleção de projeto com badges
  const options = remaining.map((p) => ({
    value: p.path,
    label: theme.accent(p.name),
    hint:  p.path,
  }));

  const selected = await clack.select({
    message: theme.primary('Selecione o projeto:'),
    options,
  });

  if (wasCancelled(selected)) {
    return null; // Volta ao menu principal sem fechar o processo
  }

  const selectedPath = selected as string;
  touchProject(selectedPath);
  return selectedPath;
}

// ─── Menu de tarefas ──────────────────────────────────────────────────────────

/**
 * Exibe o menu de seleção de tarefas.
 * Loop interno: permite executar múltiplas tarefas sem reiniciar a CLI.
 * Após cada execução, exibe waitForKeypress() e volta à lista de tarefas.
 * Sair do loop: selecionar "← Voltar" ou pressionar Ctrl+C.
 */
async function showTaskMenu(
  projectName: string,
  tasks: Task[],
  source: 'horus.json' | 'package.json',
  projectPath: string,
  extraArgs: string[] = [],
): Promise<void> {
  const sourceLabel = source === 'horus.json'
    ? theme.success('horus.json')
    : theme.muted('package.json (fallback)');

  clack.log.info(
    `${theme.primary(projectName)} ${theme.muted('·')} ${sourceLabel} ${theme.muted(`· ${tasks.length} tarefa(s)`)}`,
  );

  while (true) {
    const options = [
      ...tasks.map((task) => ({
        value: task.cmd,
        label: task.label,
        ...(task.hint !== undefined ? { hint: task.hint } : {}),
      })),
      {
        value: '__back__',
        label: theme.muted('← Voltar ao menu principal'),
      },
    ];

    const selected = await clack.select({
      message: theme.primary('Qual tarefa executar?'),
      options,
    });

    // Ctrl+C dentro do menu de tarefas → volta ao menu principal sem fechar o processo
    if (wasCancelled(selected)) {
      clack.log.info(theme.muted('Voltando ao menu principal...'));
      break;
    }

    if (selected === '__back__') {
      break;
    }

    const cmd = selected as string;
    const task = tasks.find((t) => t.cmd === cmd);
    const label = task?.label ?? cmd;

    const argsLabel = extraArgs.length > 0 ? ` ${theme.muted(extraArgs.join(' '))}` : '';
    clack.log.step(
      `${theme.success('▶')} ${theme.bold(label)}\n` +
      `   ${theme.muted('$')} ${theme.accent(cmd)}${argsLabel}\n` +
      `   ${theme.muted('cwd:')} ${theme.muted(projectPath)}`,
    );

    // Executa via executor proxy (stdio: 'inherit' preserva TTY e progress bars)
    const result = await executeCommand(cmd, { cwd: projectPath, extraArgs });
    reportExecutionResult(result, label);

    // Aguarda keypress e volta ao loop de tarefas (não fecha o CLI)
    await waitForKeypress();
    // Sem break aqui → volta ao início do while e mostra o menu de tarefas novamente
  }
}

// ─── Utilitário ──────────────────────────────────────────────────────────────

function normalizePath(p: string): string {
  const resolved = path.resolve(p).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
