#!/usr/bin/env node
/**
 * horus — The All-Seeing Gateway
 * Shebang universal: funciona em Unix (Node.js direto) e
 * Windows (npm/yarn criam um .cmd wrapper automaticamente).
 *
 * Este arquivo é INTENCIONALMENTE mínimo — ele apenas dispara
 * a importação do bundle principal. Nenhuma lógica aqui.
 * Objetivo: manter o overhead inicial em microssegundos.
 *
 * NOTA: O tsup compila src/index.ts → dist/index.js.
 * O bin compilado em dist/bin/horus.js importa dist/index.js
 * via caminho relativo '../index.js'.
 *
 * Durante o typecheck (tsc --noEmit), este arquivo importa
 * o src/index.ts via referência relativa para validação de tipos.
 */

// O dynamic import garante parse ultra-rápido deste arquivo pelo V8.
// Em produção (dist/bin/horus.js), este caminho aponta para dist/index.js.
// Durante typecheck, o compilador resolve via paths no tsconfig.
import('../src/index.js').catch((err: unknown) => {
  process.stderr.write(`[horus] Fatal startup error:\n${String(err)}\n`);
  process.exit(1);
});

