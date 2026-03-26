/**
 * register.ts — Lógica do Registry de Projetos (Fase 6)
 *
 * Melhorias da Fase 6:
 *   - `handleAddCommand`: suporta entrada manual de caminho via text prompt
 *   - `handleListCommand`: exibe metadados ricos (caminho, data, nº de tarefas)
 *   - `handleRemoveCommand`: sem alterações (já era elegante)
 */

import * as clack from '@clack/prompts';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  addProject,
  listProjects,
  removeProject,
  purgeInvalidProjects,
  getRegistryPath,
  type Project,
} from '../core/registry.js';
import { discoverTasksWithFallback } from '../core/parser.js';
import { theme } from '../ui/theme.js';
import { wasCancelled, handleCancel } from '../ui/prompts.js';

// ─── Comando ADD ─────────────────────────────────────────────────────────────

/**
 * Registra um projeto no mapa global.
 *
 * Fluxo (Fase 6):
 *   1. Se `targetPath` vier por argv → usa diretamente
 *   2. Caso contrário → pergunta entre: CWD, Caminho Manual, ou Cancelar
 *   3. Valida o caminho via fs.existsSync (segurança: rejeita arquivos, apenas dirs)
 *   4. Pergunta nome e registra
 */
export async function handleAddCommand(targetPath?: string): Promise<void> {
  let resolvedPath: string;

  if (targetPath) {
    // Modo argv: `hrs add /algum/caminho`
    resolvedPath = path.resolve(targetPath);
  } else {
    // Modo interativo: oferece opções ao usuário
    const cwd = process.cwd();
    const cwdBasename = path.basename(cwd);

    const source = await clack.select({
      message: theme.primary('Qual projeto deseja registrar?'),
      options: [
        {
          value: 'cwd',
          label: `${theme.success('●')}  Diretório atual`,
          hint: `${cwdBasename} — ${cwd}`,
        },
        {
          value: 'manual',
          label: `${theme.accent('✎')}  Informar caminho manualmente`,
          hint: 'Registra qualquer pasta do seu disco',
        },
        {
          value: 'cancel',
          label: `${theme.muted('←')}  Voltar`,
        },
      ],
    });

    if (wasCancelled(source) || source === 'cancel') {
      clack.log.info(theme.muted('Operação cancelada.'));
      return;
    }

    if (source === 'cwd') {
      resolvedPath = cwd;
    } else {
      // Entrada manual de caminho
      const manualInput = await clack.text({
        message: theme.primary('Informe o caminho completo do projeto:'),
        placeholder: `${process.platform === 'win32' ? 'C:\\projetos\\meu-app' : '/home/user/projetos/meu-app'}`,
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'O caminho não pode estar vazio.';
          }

          const resolved = path.resolve(value.trim());

          // Segurança: valida existência antes de persistir
          if (!fs.existsSync(resolved)) {
            return `Caminho não encontrado: ${resolved}`;
          }

          const stat = fs.statSync(resolved);
          if (!stat.isDirectory()) {
            return `O caminho não é um diretório: ${resolved}`;
          }

          return undefined;
        },
      });

      if (wasCancelled(manualInput)) {
        handleCancel();
      }

      resolvedPath = path.resolve((manualInput as string).trim());
    }
  }

  // Valida o caminho final (cobre também o caso argv)
  if (!fs.existsSync(resolvedPath)) {
    clack.log.error(theme.error(`✗ Caminho não encontrado: ${resolvedPath}`));
    return;
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    clack.log.error(theme.error(`✗ O caminho não é um diretório: ${resolvedPath}`));
    return;
  }

  // Pergunta o nome customizado
  const nameInput = await clack.text({
    message: theme.primary('Qual nome dar a este projeto?'),
    placeholder: path.basename(resolvedPath),
    defaultValue: path.basename(resolvedPath),
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return 'O nome não pode estar vazio.';
      }
      return undefined;
    },
  });

  if (wasCancelled(nameInput)) {
    handleCancel();
  }

  const name = (nameInput as string).trim();

  // Spinner visual enquanto processa
  const s = clack.spinner();
  s.start(theme.muted('Registrando projeto...'));

  const result = addProject({ projectPath: resolvedPath, name });

  if (result.success && result.project) {
    s.stop(theme.success('✓ Projeto registrado com sucesso!'));

    clack.note(
      [
        `${theme.bold('Nome:')}    ${theme.accent(result.project.name)}`,
        `${theme.bold('Caminho:')} ${theme.muted(result.project.path)}`,
        `${theme.bold('Salvo em:')} ${theme.muted(getRegistryPath())}`,
      ].join('\n'),
      theme.primary('📁 Projeto adicionado'),
    );
  } else {
    s.stop(theme.error('✗ Falha ao registrar'));
    clack.log.error(theme.error(result.error ?? 'Erro desconhecido'));
  }
}

// ─── Comando LIST (Enriquecido — Fase 6) ────────────────────────────────────

/**
 * Lista todos os projetos registrados com metadados enriquecidos.
 *
 * Para cada projeto exibe:
 *   - Nome e caminho absoluto
 *   - Data de registro formatada (relativa — "há 3 dias")
 *   - Quantidade de tarefas descobertas via Parser
 */
export async function handleListCommand(): Promise<void> {
  const s = clack.spinner();
  s.start(theme.muted('Verificando projetos registrados...'));

  // Auto-limpeza lazy
  const { removed, remaining } = purgeInvalidProjects();

  s.stop(theme.success('✓ Registry verificado'));

  // Informa sobre projetos removidos automaticamente
  if (removed.length > 0) {
    clack.log.warn(
      theme.warn(`⚠ ${removed.length} projeto(s) removido(s) automaticamente (diretório não encontrado):`),
    );
    for (const p of removed) {
      clack.log.info(theme.muted(`  ✕ ${p.name} → ${p.path}`));
    }
  }

  if (remaining.length === 0) {
    clack.note(
      `${theme.muted('Nenhum projeto registrado.')}\n` +
      `${theme.muted('→ Use')} ${theme.accent('hrs add .')} ${theme.muted('para adicionar o projeto atual')}.`,
      theme.primary('Registry vazio'),
    );
    return;
  }

  // Enriquece com metadados do Discovery Engine
  const enrichedLines = remaining.map((p, i) => {
    const index    = theme.muted(`${String(i + 1).padStart(2)}.`);
    const name     = theme.accent(p.name);
    const dirPath  = theme.muted(p.path);
    const addedAt  = formatRelativeDate(p.addedAt);
    const taskInfo = getTaskCount(p.path);

    return [
      `${index} ${name}`,
      `   ${theme.muted('📂')} ${dirPath}`,
      `   ${theme.muted('🕐')} Registrado ${theme.muted(addedAt)}  ${theme.muted('·')}  ${taskInfo}`,
    ].join('\n');
  });

  clack.note(
    enrichedLines.join('\n\n'),
    theme.primary(`📋 ${remaining.length} projeto(s) registrado(s)`),
  );
}

// ─── Comando REMOVE ──────────────────────────────────────────────────────────

/**
 * Remove um projeto do registry.
 * Apresenta um select interativo para o usuário escolher qual remover.
 */
export async function handleRemoveCommand(): Promise<void> {
  const projects = listProjects();

  if (projects.length === 0) {
    clack.log.warn(theme.warn('Nenhum projeto para remover. O registry está vazio.'));
    return;
  }

  // Opção de voltar + lista de projetos
  const options = [
    ...projects.map((p) => ({
      value: p.path,
      label: `${theme.accent(p.name)}`,
      hint: p.path,
    })),
    {
      value: '__back__',
      label: theme.muted('← Voltar'),
    },
  ];

  const selected = await clack.select({
    message: theme.primary('Qual projeto deseja remover?'),
    options,
  });

  if (wasCancelled(selected) || selected === '__back__') {
    clack.log.info(theme.muted('Operação cancelada.'));
    return;
  }

  const selectedPath = selected as string;

  // Confirmação
  const confirm = await clack.confirm({
    message: theme.warn(`Remover "${path.basename(selectedPath)}" do registry?`),
    initialValue: false,
  });

  if (wasCancelled(confirm)) {
    clack.log.info(theme.muted('Operação cancelada.'));
    return;
  }

  if (!confirm) {
    clack.log.info(theme.muted('Operação cancelada.'));
    return;
  }

  const removed = removeProject(selectedPath);

  if (removed) {
    clack.log.success(theme.success('✓ Projeto removido do registry.'));
  } else {
    clack.log.error(theme.error('✗ Projeto não encontrado no registry.'));
  }
}

// ─── Select de projeto (para uso em run.ts) ──────────────────────────────────

/**
 * Exibe o menu de seleção de projeto registrado.
 * Usado quando o usuário invoca `hrs` fora de um diretório mapeado.
 */
export async function selectRegisteredProject(): Promise<Project | null> {
  const { remaining } = purgeInvalidProjects();

  if (remaining.length === 0) {
    return null;
  }

  const selected = await clack.select({
    message: theme.primary('Selecione um projeto:'),
    options: remaining.map((p) => ({
      value: p.path,
      label: `${theme.accent(p.name)}`,
      hint: p.path,
    })),
  });

  if (wasCancelled(selected)) {
    handleCancel();
  }

  const selectedPath = selected as string;
  return remaining.find((p) => p.path === selectedPath) ?? null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formata uma data ISO como texto relativo ("há 3 dias", "há 1 hora").
 */
function formatRelativeDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now  = new Date();
    const diffMs = now.getTime() - date.getTime();

    const mins  = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days  = Math.floor(diffMs / 86_400_000);

    if (mins < 1)   return 'agora mesmo';
    if (mins < 60)  return `há ${mins} min`;
    if (hours < 24) return `há ${hours}h`;
    if (days === 1) return 'ontem';
    if (days < 30)  return `há ${days} dias`;
    return date.toLocaleDateString('pt-BR');
  } catch {
    return 'data desconhecida';
  }
}

/**
 * Descobre quantas tarefas estão disponíveis num projeto.
 * Usa o Discovery Engine da Fase 3 — zero I/O redundante.
 */
function getTaskCount(projectPath: string): string {
  try {
    const { result } = discoverTasksWithFallback(projectPath);
    if (result.ok) {
      const src = result.source === 'horus.json'
        ? theme.success('horus.json')
        : theme.muted('package.json');
      return `${theme.accent(String(result.tasks.length))} tarefa(s) · ${src}`;
    }
    return theme.muted('sem tarefas configuradas');
  } catch {
    return theme.muted('erro ao descobrir tarefas');
  }
}
