/**
 * projects.ts — Project Navigator + Mais Acessados (Fase 8.5)
 *
 * Navegação Híbrida (select + busca):
 *   - A lista completa aparece imediatamente (navegação por ↑↓)
 *   - Uma opção "🔍 Filtrar por nome" permite entrar no modo busca textual
 *   - O modo busca mostra select filtrado; "← Limpar filtro" volta à lista completa
 *   - Ctrl+C em qualquer ponto retorna ao menu HOME sem alterar o CWD
 *
 * Tratamento de erros do process.chdir():
 *   Guarda 1: fs.existsSync      → pasta existe no disco?
 *   Guarda 2: statSync           → é realmente um diretório?
 *   Guarda 3: process.chdir()    → temos permissão do OS?
 *   Em todas as falhas: log amigável + oferta de remoção do registry + continua o loop
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as clack from '@clack/prompts';
import {
  purgeInvalidProjects,
  getRecentProjects,
  touchProject,
  removeProject,
  updateProjectName,
  type Project,
} from '../core/registry.js';
import { handleRunCommand } from './run.js';
import { getProjectHealth, formatProjectLabel } from '../ui/badges.js';
import { renderContextBar, theme } from '../ui/theme.js';
import { wasCancelled } from '../ui/prompts.js';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ChdirResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'not_directory' | 'permission' | 'unknown'; message: string };

// ─── ⭐ Favoritos (Híbrido) ───────────────────────────────────────────────────

/**
 * Sub-menu "⭐ Favoritos" — top projetos e top prompts.
 * Vai direto para o select (sem prompt de busca prévia).
 */
export async function handleRecentProjects(): Promise<void> {
  const { getTopPrompts } = await import('../utils/prompt-storage.js');
  const { handleAiConfig } = await import('./ai-config.js'); // Necessário mock para não duplicar, mas melhor delegar prompts
  
  while (true) {
    const recentProjects = getRecentProjects(5);
    const recentPrompts = getTopPrompts(5);

    if (recentProjects.length === 0 && recentPrompts.length === 0) {
      clack.note(
        [
          theme.muted('Nenhum projeto ou prompt foi acessado ainda.'),
          '',
          `${theme.muted('→ Acesse')} ${theme.accent('≡ Projetos')} ${theme.muted('para selecionar e entrar em um projeto')}`,
        ].join('\n'),
        theme.primary('⭐ Favoritos'),
      );
      return;
    }

    const options: Array<{ value: string; label: string; hint?: string }> = [];

    if (recentProjects.length > 0) {
      recentProjects.forEach((p, i) => {
        options.push({
          value: `proj:${p.path}`,
          label: `${theme.muted(`${i + 1}.`)}  ${theme.accent('📦')}  ${formatProjectLabel(p.name, getProjectHealth(p.path))}`,
          hint: path.relative(process.cwd(), p.path) || p.path,
        });
      });
    }

    if (recentPrompts.length > 0) {
      recentPrompts.forEach((p, i) => {
        options.push({
           value: `prompt:${p.name}`,
           label: `${theme.muted(`${i + 1}.`)}  ${theme.white('📄')}  ${theme.white(p.name)}`,
        });
      });
    }

    options.push({ value: '__back__', label: theme.muted('←  Voltar') });

    const selected = await clack.select({
      message: theme.primary('⭐ Favoritos — Selecione um atalho:'),
      options
    });

    if (wasCancelled(selected) || selected === '__back__') return;
    const val = selected as string;

    if (val.startsWith('proj:')) {
       const project = recentProjects.find((p) => p.path === val.replace('proj:', '')) as Project;
       await enterProject(project);
    } else if (val.startsWith('prompt:')) {
       const promptName = val.replace('prompt:', '');
       const promptStorage = await import('../utils/prompt-storage.js');
       const { manageSinglePrompt } = await import('./ai-config.js');
       await manageSinglePrompt(promptName, promptStorage);
    }
  }
}

// ─── ≡ Project Navigator com Navegação Híbrida ───────────────────────────────

/**
 * Sub-menu "≡ Projetos" — lista com setas + busca textual sob demanda.
 *
 * Modo padrão (setas):
 *   - select com todos os projetos registrados + badges de saúde
 *   - Opção especial "🔍 Filtrar por nome" → entra no modo busca
 *   - Opção "← Voltar" → retorna ao HOME
 *
 * Modo busca:
 *   - text prompt com o termo de filtro
 *   - select com resultados filtrados + "← Limpar filtro" para sair do modo busca
 *   - Enter vazio no text → volta ao modo setas
 */
export async function handleProjectNavigator(): Promise<void> {
  type NavMode = 'browse' | 'search';
  let mode: NavMode = 'browse'; // Inicia com a lista completa, mas com foco no filtro
  let searchQuery = '';

  while (true) {
    const { remaining } = purgeInvalidProjects();

    if (remaining.length === 0) {
      clack.note(
        [
          theme.muted('Nenhum projeto registrado ainda.'),
          '',
          `${theme.muted('→ Use')} ${theme.accent('+ Registrar novo projeto')} ${theme.muted('no menu principal')}`,
        ].join('\n'),
        theme.primary('≡ Projetos'),
      );
      return;
    }

    // ── Modo Busca ─────────────────────────────────────────────────────────
    if (mode === 'search') {
      const searchInput = await clack.text({
        message: theme.primary(`≡ Projetos — Filtrar  ${theme.muted('(Enter vazio = ver todos)')}`),
        placeholder: 'Ex: event, backend, api…',
        defaultValue: searchQuery,
      });

      // Ctrl+C no text → saí do modo busca, volta a browse
      if (wasCancelled(searchInput)) {
        mode = 'browse';
        searchQuery = '';
        continue;
      }

      searchQuery = (searchInput as string).trim().toLowerCase();

      // Enter vazio → volta ao modo browse
      if (searchQuery.length === 0) {
        mode = 'browse';
        continue;
      }

      // Filtra e mostra select com resultados
      const filtered = remaining.filter((p) =>
        p.name.toLowerCase().includes(searchQuery),
      );

      if (filtered.length === 0) {
        clack.log.warn(theme.warn(`Nenhum projeto encontrado para "${theme.bold(searchQuery)}".`));
        continue; // volta ao text prompt
      }

      const searchOptions: Array<{ value: string; label: string; hint?: string }> = [
        ...filtered.map((p) => ({
          value: p.path,
          label: formatProjectLabel(p.name, getProjectHealth(p.path)),
          hint: path.relative(process.cwd(), p.path) || p.path,
        })),
        { value: '__clear__', label: theme.muted('← Limpar filtro  (ver todos)') },
        { value: '__back__',  label: theme.muted('←  Voltar ao menu principal') },
      ];

      const searchSelected = await clack.select({
        message: theme.primary(`${filtered.length} resultado(s) para "${searchQuery}". Selecione:`),
        options: searchOptions,
      });

      if (wasCancelled(searchSelected) || searchSelected === '__back__') return;
      if (searchSelected === '__clear__') {
        mode = 'browse';
        searchQuery = '';
        continue;
      }

      const project = filtered.find((p) => p.path === searchSelected) as Project;
      await enterProject(project);
      continue; // após menu de tarefas, volta ao select filtrado
    }

    // ── Modo Browse (padrão — navegar por setas ↑↓) ────────────────────────
    const browseOptions: Array<{ value: string; label: string; hint?: string }> = [
      { value: '__search__', label: `${theme.accent('🔍')}  Filtrar por nome…` },
      { value: '__register__', label: `${theme.accent('➕')}  Registrar novo projeto` },
      ...remaining.map((p) => ({
        value: p.path,
        label: formatProjectLabel(p.name, getProjectHealth(p.path)),
        hint: p.path,
      })),
      { value: '__back__',   label: theme.muted('←  Voltar ao menu principal') },
    ];

    const browseSelected = await clack.select({
      message: theme.primary(`≡ Projetos  ${theme.muted(`— ${remaining.length} registrado(s)  ·  ↑↓ navegar`)}:`),
      options: browseOptions,
    });

    if (wasCancelled(browseSelected) || browseSelected === '__back__') return;

    if (browseSelected === '__search__') {
      mode = 'search';
      searchQuery = '';
      continue;
    }
    
    if (browseSelected === '__register__') {
      const { handleAddCommand } = await import('./register.js');
      await handleAddCommand();
      continue;
    }

    const project = remaining.find((p) => p.path === browseSelected) as Project;
    await enterProject(project);
    // volta ao browse após retornar do menu de tarefas
  }
}

// ─── Utilitário compartilhado: entrar em um projeto ──────────────────────────

/**
 * Valida, faz cd virtual, atualiza Context Bar e abre o Menu Interno do Projeto.
 * @returns true se o fluxo foi executado com sucesso, false em erro de chdir.
 */
export async function enterProject(projectInfo: Project): Promise<boolean> {
  const cdResult = tryChdir(projectInfo.path);

  if (!cdResult.ok) {
    clack.log.error(theme.error(`✗ ${cdResult.message}`));

    if (cdResult.reason === 'not_found') {
      const shouldRemove = await clack.confirm({
        message: theme.warn(`Remover "${projectInfo.name}" do registry?`),
        initialValue: true,
      });
      if (!wasCancelled(shouldRemove) && shouldRemove === true) {
        removeProject(projectInfo.path);
        clack.log.success(theme.success('✓ Projeto removido do registry.'));
      }
    }
    return false;
  }

  touchProject(projectInfo.path);

  while (true) {
    renderContextBar({ projectName: projectInfo.name });

    const menuAction = await clack.select({
      message: theme.primary(`O que deseja fazer no projeto ${theme.accent(projectInfo.name)}?`),
      options: [
        { value: 'run', label: `${theme.success('▶')}  Executar comandos` },
        { value: 'readme', label: `${theme.white('📖')}  Ler README do Projeto` },
        { value: 'init', label: `${theme.accent('✦')}  Inicializar horus.json` },
        { value: 'edit', label: `${theme.warn('⚙️')}  Editar projeto` },
        { value: 'back', label: `${theme.muted('←')}  Voltar` },
      ]
    });

    if (wasCancelled(menuAction) || menuAction === 'back') break;

    if (menuAction === 'run') {
      await handleRunCommand([]);
    } else if (menuAction === 'readme') {
      const { handleReadmeCommand } = await import('./view-readme.js');
      await handleReadmeCommand();
    } else if (menuAction === 'init') {
      const { handleInitCommand } = await import('./init.js');
      await handleInitCommand([]);
    } else if (menuAction === 'edit') {
      const editAction = await clack.select({
        message: theme.warn(`Configurações de ${theme.accent(projectInfo.name)}`),
        options: [
          { value: 'rename', label: `${theme.white('✏️')}  Renomear projeto` },
          { value: 'remove', label: `${theme.error('🗑️')}  Remover projeto` },
          { value: 'back', label: `${theme.muted('←')}  Voltar` },
        ]
      });

      if (!wasCancelled(editAction) && editAction === 'rename') {
        const newName = await clack.text({
          message: 'Digite o novo nome do projeto:',
          defaultValue: projectInfo.name
        });
        if (!wasCancelled(newName) && (newName as string).trim()) {
           updateProjectName(projectInfo.path, newName as string);
           projectInfo.name = newName as string; // Atualiza a ref atual da memória
           clack.log.success(theme.success(`Projeto renomeado para ${projectInfo.name}`));
        }
      } else if (!wasCancelled(editAction) && editAction === 'remove') {
        const confirm = await clack.confirm({
          message: theme.error(`Tem certeza que deseja remover ${projectInfo.name} permanentemente do registro?`),
          initialValue: false
        });
        if (!wasCancelled(confirm) && confirm === true) {
           removeProject(projectInfo.path);
           clack.log.success(theme.success(`Projeto removido.`));
           break; // Se remover, sai da tela do projeto
        }
      }
    }
  }

  return true;
}

// ─── CD Virtual com validação em três camadas ─────────────────────────────────

function tryChdir(targetPath: string): ChdirResult {
  const resolved = path.resolve(targetPath);

  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: 'not_found', message: `Diretório não encontrado: ${resolved}` };
  }

  try {
    if (!fs.statSync(resolved).isDirectory()) {
      return { ok: false, reason: 'not_directory', message: `O caminho não é um diretório: ${resolved}` };
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    return { ok: false, reason: 'permission', message: `Sem permissão para inspecionar (${code}): ${resolved}` };
  }

  try {
    process.chdir(resolved);
    return { ok: true };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    const reason = (code === 'EPERM' || code === 'EACCES') ? 'permission' : 'unknown';
    return { ok: false, reason, message: `Acesso negado (${code}): ${resolved}` };
  }
}
