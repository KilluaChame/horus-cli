/**
 * help-viewer.ts — Visualizador de ajuda contextual (Menu de categorias)
 *
 * Renderiza o conteúdo do campo `ajuda` do horus.json como um menu
 * interativo navegável com @clack/prompts. Dois níveis de navegação:
 *
 *   Nível 1: Lista de categorias + Glossário + Voltar
 *   Nível 2: Itens da categoria selecionada (renderizados inline)
 *
 * Máquina de estados:
 *   CATEGORIES → DETAIL/GLOSSARY → CATEGORIES → (← Voltar ao menu de tarefas)
 */

import * as clack from '@clack/prompts';
import { theme, waitForKeypress } from '../ui/theme.js';
import { wasCancelled } from '../ui/prompts.js';
import type { HorusAjuda } from '../core/parser.js';

// ─── Entry-point público ─────────────────────────────────────────────────────

/**
 * Exibe o menu de ajuda contextual com navegação por categorias.
 * Retorna ao chamador quando o usuário seleciona "← Voltar" ou ESC/Ctrl+C.
 *
 * @param ajuda Objeto validado pelo AjudaSchema do parser.ts
 */
export async function showHelpMenu(ajuda: HorusAjuda): Promise<void> {
  while (true) {
    // ── Nível 1: Menu de categorias ────────────────────────────────────────
    const options: Array<{ value: string; label: string; hint?: string }> = [];

    for (let i = 0; i < ajuda.categorias.length; i++) {
      const cat = ajuda.categorias[i]!;
      options.push({
        value: `cat_${i}`,
        label: cat.titulo,
        hint: `${cat.itens.length} comando(s)`,
      });
    }

    // Glossário (se existir)
    if (ajuda.glossario && ajuda.glossario.length > 0) {
      options.push({
        value: '__glossario__',
        label: `${theme.accent('📚')} Glossário de Símbolos`,
        hint: `${ajuda.glossario.length} símbolo(s)`,
      });
    }

    // Voltar
    options.push({
      value: '__back__',
      label: theme.muted('← Voltar ao menu de tarefas'),
    });

    const selected = await clack.select({
      message: theme.primary('❓ Ajuda — Selecione uma categoria:'),
      options,
    });

    // ESC/Ctrl+C → volta ao menu de tarefas
    if (wasCancelled(selected)) {
      break;
    }

    if (selected === '__back__') {
      break;
    }

    if (selected === '__glossario__') {
      renderGlossario(ajuda.glossario ?? []);
      await waitForKeypress();
      continue;
    }

    // ── Nível 2: Detalhe da categoria ────────────────────────────────────
    const catIndex = parseInt((selected as string).replace('cat_', ''), 10);
    const categoria = ajuda.categorias[catIndex];

    if (categoria) {
      renderCategoriaDetail(categoria.titulo, categoria.itens);
      await waitForKeypress();
    }

    // Volta ao nível 1 (loop continua)
  }
}

// ─── Renderização: Detalhe de Categoria ──────────────────────────────────────

interface AjudaItemRenderable {
  comando: string;
  descricao: string;
  exemplo: string;
  tecnologia: string;
}

/**
 * Renderiza os itens de uma categoria de ajuda no terminal.
 *
 * Formato visual:
 *   │ 📖 Desenvolvimento
 *   │
 *   │   npm run dev
 *   │   ├─ Inicia o servidor com hot reload
 *   │   ├─ Exemplo: hrs run → selecionar 'Watch Mode'
 *   │   └─ Tecnologia: tsup
 */
function renderCategoriaDetail(titulo: string, itens: AjudaItemRenderable[]): void {
  const bar = theme.muted('│');

  console.log('');
  clack.log.info(theme.primary(`📖 ${titulo}`));
  console.log(bar);

  for (const item of itens) {
    console.log(`${bar}   ${theme.accent(item.comando)}`);
    console.log(`${bar}   ${theme.muted('├─')} ${item.descricao}`);
    console.log(`${bar}   ${theme.muted('├─')} ${theme.muted('Exemplo:')} ${theme.white(item.exemplo)}`);
    console.log(`${bar}   ${theme.muted('└─')} ${theme.muted('Tecnologia:')} ${theme.success(item.tecnologia)}`);
    console.log(bar);
  }

  console.log(theme.muted('╰──────────────────────────────────────────────────────────'));
}

// ─── Renderização: Glossário ─────────────────────────────────────────────────

interface GlossarioRenderable {
  simbolo: string;
  significado: string;
}

/**
 * Renderiza o glossário de símbolos e emojis do projeto.
 *
 * Formato visual:
 *   │ 📚 Glossário de Símbolos
 *   │
 *   │   👁️   Watch / Dev Mode — monitoramento contínuo
 *   │   🏗️   Build / Compilação
 *   │   ...
 */
function renderGlossario(itens: GlossarioRenderable[]): void {
  const bar = theme.muted('│');

  console.log('');
  clack.log.info(theme.primary('📚 Glossário de Símbolos'));
  console.log(bar);

  for (const item of itens) {
    console.log(`${bar}   ${item.simbolo}   ${theme.white(item.significado)}`);
  }

  console.log(bar);
  console.log(theme.muted('╰──────────────────────────────────────────────────────────'));
}
