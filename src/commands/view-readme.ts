import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as clack from '@clack/prompts';
import { theme, waitForKeypress } from '../ui/theme.js';

export async function handleReadmeCommand(): Promise<void> {
  const cwd = process.cwd();
  
  try {
    // Escaneia o diretório para encontrar o README.md ignorando case
    const entries = await fs.readdir(cwd, { withFileTypes: true });
    const readmeFile = entries.find((e) => e.isFile() && e.name.toLowerCase() === 'readme.md');
    
    if (!readmeFile) {
      clack.log.warn(theme.warn('Nenhum arquivo README.md encontrado neste diretório.'));
      await waitForKeypress();
      return;
    }

    const content = await fs.readFile(path.join(cwd, readmeFile.name), 'utf-8');
    const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1);

    // Obtém o max width do terminal, limitando por segurança
    const termWidth = process.stdout.columns || 80;
    // Reserva 5 caracteres para a tabulação + barra lateral + margem (ex: "│   ")
    const maxLineLength = Math.max(termWidth - 5, 20);

    // Imprime Top Bar
    clack.log.info(theme.primary(`📖 ${readmeFile.name} (${sizeKB} KB)`));
    console.log(theme.muted('│'));

    // Processa linha a linha formatando o wrap explicitamente
    const rawLines = content.split(/\r?\n/);
    
    for (const rawLine of rawLines) {
      // Regex Markdown coloring super simples (estética IDE)
      let styledLine = rawLine
        // Títulos
        .replace(/^(#{1,6})\s+(.*)/, (match, hashes, text) => `${theme.muted(hashes)} ${theme.success(text)}`)
        // Links formatados: [texto](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, txt, url) => `${theme.white(txt)}(${theme.accent(url)})`)
        // Código inline: `codigo`
        .replace(/`([^`]+)`/g, (match, code) => theme.primary(code));

      // Calcula o "wrapped" manual para não quebrar a barra "│" (ignorando escape ansi é difícil, então aplicamos wrap baseado na linha RAW, mas aplicaremos via chunk size)
      // Como o cálculo com ansi é complexo, usaremos chunks de length pura e aplicaremos estilo depois onde der, ou quebramos a string raw primeiro.
      
      let chunks: string[] = [];
      if (rawLine.length === 0) {
        chunks.push('');
      } else {
        // Simple manual uncolored character wrap
        let currentIndex = 0;
        while (currentIndex < rawLine.length) {
          chunks.push(rawLine.slice(currentIndex, currentIndex + maxLineLength));
          currentIndex += maxLineLength;
        }
      }

      // Se a quebra de string "raw" dividiu ansi escapes no meio, pode bugar cores na borda. 
      // Por estabilidade de terminal pedida, se a linha for enorme, colorimos depois do wrap:
      chunks.forEach((chunk) => {
        let printChunk = chunk
          .replace(/^(#{1,6})\s+(.*)/, (match, hashes, text) => `${theme.muted(hashes)} ${theme.success(text)}`)
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, txt, url) => `${theme.white(txt)}(${theme.accent(url)})`)
          .replace(/`([^`]+)`/g, (match, code) => theme.primary(code));
        
        console.log(`${theme.muted('│')}   ${printChunk}`);
      });
    }

    console.log(theme.muted('│'));
    console.log(theme.muted('╰──────────────────────────────────────────────────────────'));
    
    // Prompt elegante para voltar
    await waitForKeypress();

  } catch (err) {
    clack.log.error(theme.error(`Falha ao ler o README: ${String(err)}`));
    await waitForKeypress();
  }
}
