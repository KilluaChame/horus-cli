import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as clack from '@clack/prompts';
import { theme, waitForKeypress } from '../ui/theme.js';

// ─── Motor de Renderização Markdown ────────────────────────────────────────

/**
 * Renderiza um arquivo Markdown no terminal com syntax highlighting básico.
 * Reutilizado por handleReadmeCommand e docs-manager.
 *
 * @param filePath Caminho absoluto do arquivo .md
 */
export async function renderMarkdownFile(filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1);

  const termWidth = process.stdout.columns || 80;
  const maxLineLength = Math.max(termWidth - 5, 20);

  clack.log.info(theme.primary(`📖 ${fileName} (${sizeKB} KB)`));
  console.log(theme.muted('│'));

  const rawLines = content.split(/\r?\n/);

  for (const rawLine of rawLines) {
    let chunks: string[] = [];
    if (rawLine.length === 0) {
      chunks.push('');
    } else {
      let currentIndex = 0;
      while (currentIndex < rawLine.length) {
        chunks.push(rawLine.slice(currentIndex, currentIndex + maxLineLength));
        currentIndex += maxLineLength;
      }
    }

    chunks.forEach((chunk) => {
      const printChunk = chunk
        .replace(/^(#{1,6})\s+(.*)/, (_match: string, hashes: string, text: string) => `${theme.muted(hashes)} ${theme.success(text)}`)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match: string, txt: string, url: string) => `${theme.white(txt)}(${theme.accent(url)})`)
        .replace(/`([^`]+)`/g, (_match: string, code: string) => theme.primary(code));

      console.log(`${theme.muted('│')}   ${printChunk}`);
    });
  }

  console.log(theme.muted('│'));
  console.log(theme.muted('╰──────────────────────────────────────────────────────────'));
}

// ─── Comando legado (retrocompat) ──────────────────────────────────────────

export async function handleReadmeCommand(): Promise<void> {
  const cwd = process.cwd();

  try {
    const entries = await fs.readdir(cwd, { withFileTypes: true });
    const readmeFile = entries.find((e) => e.isFile() && e.name.toLowerCase() === 'readme.md');

    if (!readmeFile) {
      clack.log.warn(theme.warn('Nenhum arquivo README.md encontrado neste diretório.'));
      await waitForKeypress();
      return;
    }

    await renderMarkdownFile(path.join(cwd, readmeFile.name));
    await waitForKeypress();
  } catch (err) {
    clack.log.error(theme.error(`Falha ao ler o README: ${String(err)}`));
    await waitForKeypress();
  }
}
