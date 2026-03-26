/**
 * run.ts — Lógica principal de execução interativa (Fase 3)
 *
 * Orquestra o fluxo completo:
 *   1. Detecta o projeto alvo (cwd ou seleção do registry)
 *   2. Roda o Discovery Engine (parser.ts)
 *   3. Apresenta o menu de tarefas via @clack/prompts
 *   4. Stub de execução (Fase 4 implementará execa)
 *
 * Regra de performance: este módulo é importado LAZILY no index.ts
 * (só quando o usuário escolhe "Executar" no menu principal).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as clack from '@clack/prompts';
import { discoverTasksWithFallback, type Task } from '../core/parser.js';
import { listProjects, purgeInvalidProjects } from '../core/registry.js';
import { theme } from '../ui/theme.js';
import { wasCancelled, handleCancel } from '../ui/prompts.js';

// ─── Handler principal ────────────────────────────────────────────────────────

/**
 * Ponto de entrada do fluxo "Executar".
 * Chamado tanto pelo menu interativo quanto pelo subcomando `hrs run`.
 */
export async function handleRunCommand(): Promise<void> {
  // 1. Resolve o diretório do projeto alvo
  const projectPath = await resolveProjectPath();

  if (!projectPath) {
    // Usuário cancelou ou não há projetos — handleCancel() já foi chamado
    return;
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

  // 4. Trata falha total de discovery
  if (!result.ok) {
    clack.log.error(theme.error(`✗ ${result.message}`));

    // Sugere próximos passos ao usuário
    clack.note(
      [
        `${theme.muted('Opções disponíveis:')}`,
        `  ${theme.accent('1.')} Crie um ${theme.bold('horus.json')} na raiz do projeto`,
        `  ${theme.accent('2.')} Adicione scripts ao ${theme.bold('package.json')} do projeto`,
        `  ${theme.accent('3.')} Registre outro projeto com ${theme.bold('hrs add <path>')}`,
      ].join('\n'),
      theme.primary('Como configurar'),
    );
    return;
  }

  // 5. Exibe o menu de tarefas descobertas
  await showTaskMenu(result.projectName, result.tasks, result.source, projectPath);
}

// ─── Resolução do projeto alvo ────────────────────────────────────────────────

/**
 * Determina o projeto alvo:
 *   1. Se o cwd está registrado no registry → usa automaticamente
 *   2. Se há projetos registrados → abre menu de seleção
 *   3. Se não há projetos → sugere `hrs add .`
 *
 * @returns Caminho absoluto do projeto, ou null se o usuário cancelou.
 */
async function resolveProjectPath(): Promise<string | null> {
  const cwd = process.cwd();

  // Verifica se o diretório atual está no registry
  const { remaining } = purgeInvalidProjects();
  const cwdNormalized = normalizePath(cwd);
  const cwdProject = remaining.find(
    (p) => normalizePath(p.path) === cwdNormalized,
  );

  // Caso 1: cwd está registrado — usa diretamente (zero interação)
  if (cwdProject) {
    clack.log.info(
      theme.muted(`📁 Projeto detectado: `) + theme.accent(cwdProject.name),
    );
    return cwd;
  }

  // Caso 2: cwd não está registrado, mas tem horus.json ou package.json → usa cwd
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

  // Menu de seleção de projeto
  const selected = await clack.select({
    message: theme.primary('Selecione o projeto:'),
    options: remaining.map((p) => ({
      value: p.path,
      label: theme.accent(p.name),
      hint:  p.path,
    })),
  });

  if (wasCancelled(selected)) {
    handleCancel();
  }

  return selected as string;
}

// ─── Menu de tarefas ──────────────────────────────────────────────────────────

/**
 * Exibe o menu de seleção de tarefas e aguarda a escolha do usuário.
 * Após seleção, delega para o executor (Fase 4).
 */
async function showTaskMenu(
  projectName: string,
  tasks: Task[],
  source: 'horus.json' | 'package.json',
  projectPath: string,
): Promise<void> {
  const sourceLabel = source === 'horus.json'
    ? theme.success('horus.json')
    : theme.muted('package.json (fallback)');

  // Cabeçalho do projeto
  clack.log.info(
    `${theme.primary(projectName)} ${theme.muted('·')} ${sourceLabel} ${theme.muted(`· ${tasks.length} tarefa(s)`)}`
  );

  // Loop de sessão — permite executar múltiplas tarefas sem reiniciar o CLI
  while (true) {
    const options = [
      ...tasks.map((task) => ({
        value: task.cmd,
        label: task.label,
        // Omite hint quando undefined — exactOptionalPropertyTypes exige omissão total
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

    if (wasCancelled(selected)) {
      handleCancel();
    }

    if (selected === '__back__') {
      break;
    }

    const cmd = selected as string;
    const task = tasks.find((t) => t.cmd === cmd);

    // Delega para o executor
    await executeTask(cmd, task?.label ?? cmd, projectPath);

    // Após execução, pergunta se deseja continuar (loop de sessão — R5 do PRD)
    const continueSession = await clack.confirm({
      message: theme.primary('Deseja executar outra tarefa?'),
      initialValue: true,
    });

    if (wasCancelled(continueSession) || !continueSession) {
      break;
    }
  }
}

// ─── Executor (stub Fase 3 → implementado na Fase 4) ─────────────────────────

/**
 * Executa o comando selecionado.
 *
 * ⚠️  FASE 3 — Stub: exibe o comando e simula execução.
 *     A Fase 4 substituirá por: execa(cmd, { stdio: 'inherit', shell: true, cwd })
 *
 * @param cmd         Comando shell completo (suporta pipes, &&, etc.)
 * @param label       Label legível para exibição
 * @param projectPath Diretório de trabalho para execução
 */
async function executeTask(
  cmd: string,
  label: string,
  projectPath: string,
): Promise<void> {
  clack.log.step(
    `${theme.success('▶')} ${theme.bold(label)}\n` +
    `   ${theme.muted('$')} ${theme.accent(cmd)}\n` +
    `   ${theme.muted('cwd:')} ${theme.muted(projectPath)}`,
  );

  // TODO: Fase 4 — substituir por:
  // await execa(cmd, { stdio: 'inherit', shell: true, cwd: projectPath });

  clack.note(
    [
      theme.muted('Executor ainda não implementado.'),
      `${theme.muted('→ Será ativado na')} ${theme.accent('Fase 4')} ${theme.muted('(execa + stdio: inherit)')}`,
      '',
      `${theme.muted('Comando que seria executado:')}`,
      `${theme.accent('$')} ${cmd}`,
    ].join('\n'),
    theme.primary('🔮 Fase 4'),
  );
}

// ─── Utilitário ───────────────────────────────────────────────────────────────

/**
 * Normaliza caminhos para comparação cross-platform.
 * Windows é case-insensitive; Unix é case-sensitive.
 */
function normalizePath(p: string): string {
  const resolved = path.resolve(p).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
