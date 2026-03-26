/**
 * register.ts — Lógica do comando `hrs add`
 *
 * Subcomandos do Registry:
 *   hrs add [path]  → Registra um diretório de projeto
 *   hrs list        → Lista projetos registrados (com auto-limpeza)
 *   hrs remove      → Remove projeto do registro (interativo)
 *
 * Todas as operações usam @clack/prompts para UX consistente.
 */

import * as clack from '@clack/prompts';
import * as path from 'node:path';
import {
  addProject,
  listProjects,
  removeProject,
  purgeInvalidProjects,
  getRegistryPath,
  type Project,
} from '../core/registry.js';
import { theme } from '../ui/theme.js';
import { wasCancelled, handleCancel } from '../ui/prompts.js';

// ─── Comando ADD ─────────────────────────────────────────────────────────────

/**
 * Registra um projeto no mapa global.
 * Se `targetPath` não for informado, usa o diretório atual (cwd).
 */
export async function handleAddCommand(targetPath?: string): Promise<void> {
  const projectPath = targetPath ?? process.cwd();

  // Pergunta o nome customizado
  const nameInput = await clack.text({
    message: theme.primary('Qual nome dar a este projeto?'),
    placeholder: path.basename(path.resolve(projectPath)),
    defaultValue: path.basename(path.resolve(projectPath)),
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

  const result = addProject({ projectPath, name });

  if (result.success && result.project) {
    s.stop(theme.success('✓ Projeto registrado com sucesso!'));

    clack.note(
      [
        `${theme.bold('Nome:')}   ${theme.accent(result.project.name)}`,
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

// ─── Comando LIST ────────────────────────────────────────────────────────────

/**
 * Lista todos os projetos registrados.
 * Executa auto-limpeza antes de exibir (remove diretórios deletados).
 */
export async function handleListCommand(): Promise<void> {
  const s = clack.spinner();
  s.start(theme.muted('Verificando projetos registrados...'));

  // Auto-limpeza lazy — roda aqui e não no boot
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

  // Lista os projetos válidos
  if (remaining.length === 0) {
    clack.note(
      `${theme.muted('Nenhum projeto registrado.')}\n` +
      `${theme.muted('→ Use')} ${theme.accent('hrs add .')} ${theme.muted('para adicionar o projeto atual')}.`,
      theme.primary('Registry vazio'),
    );
    return;
  }

  // Formata a tabela de projetos
  const lines = remaining.map((p, i) => {
    const index = theme.muted(`${String(i + 1).padStart(2)}.`);
    const name = theme.accent(p.name);
    const projectPath = theme.muted(p.path);
    return `${index} ${name}\n    ${projectPath}`;
  });

  clack.note(
    lines.join('\n\n'),
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

  // Menu de seleção
  const selected = await clack.select({
    message: theme.primary('Qual projeto deseja remover?'),
    options: projects.map((p) => ({
      value: p.path,
      label: `${theme.accent(p.name)}`,
      hint: p.path,
    })),
  });

  if (wasCancelled(selected)) {
    handleCancel();
  }

  const selectedPath = selected as string;

  // Confirmação
  const confirm = await clack.confirm({
    message: theme.warn(`Remover "${path.basename(selectedPath)}" do registry?`),
    initialValue: false,
  });

  if (wasCancelled(confirm)) {
    handleCancel();
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

// ─── Select de projeto (para uso na tela principal) ──────────────────────────

/**
 * Exibe o menu de seleção de projeto registrado.
 * Usado quando o usuário invoca `hrs` fora de um diretório mapeado.
 *
 * @returns O projeto selecionado ou null se não houver projetos.
 */
export async function selectRegisteredProject(): Promise<Project | null> {
  // Auto-limpeza antes de listar
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
