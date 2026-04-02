import { theme } from './theme.js';

/**
 * Remove código de escape ANSI de uma string para contar o tamanho visual real
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[\d+;?\d*m/g, '');
}

/**
 * Desenha um painel ASCII vertical estilo "Dashboard", que continua a barra `|`
 * Mesclando perfeitamente a leitura das sessões de Configuração e Prompts.
 *
 * @param title Título do painel (Pode conter coloração do picocolors)
 * @param lines Array de linhas de texto (podem conter coloração do theme)
 */
export function drawAsciiPanel(title: string, lines: string[]): void {
  const terminalWidth = process.stdout.columns ?? 80;
  // Limitar em 80 para manter o look padronizado dos clack notes
  const boxWidth = Math.min(terminalWidth, 80); 
  
  const rawTitle = stripAnsi(title);
  const dashCount = Math.max(1, boxWidth - rawTitle.length - 2); 
  const headerDash = '-'.repeat(dashCount);

  // Header 
  console.log(`${title} ${theme.muted(headerDash + '+')}`);
  console.log(theme.muted('|'));

  // Content
  for (const line of lines) {
    console.log(`${theme.muted('|')}  ${line}`);
  }

  // Footer
  console.log(theme.muted('|'));
  console.log(theme.muted('+' + '-'.repeat(boxWidth - 1) + '+'));
  
  // A barra solta continua para anexar ao `clack.select( ... )`
  console.log(theme.muted('|')); 
}
