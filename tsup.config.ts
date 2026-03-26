import { defineConfig } from 'tsup';

export default defineConfig({
  // Entrypoints — apenas o essencial
  entry: {
    'bin/horus': 'bin/horus.ts',
    index: 'src/index.ts',
  },

  // Formato ESM exclusivo — sem overhead de CJS dual
  format: ['esm'],

  // Bundling agressivo para reduzir syscalls de import em runtime
  bundle: true,

  // Minificação: reduz tamanho e acelera parse do V8
  minify: true,

  // Tree-shaking: remove código morto automaticamente
  treeshake: true,

  // Target: Node.js 18+ — sem polyfills desnecessários
  target: 'node18',

  // Não emitir os node_modules no bundle (são externos)
  // EXCETO: picocolors e @clack/prompts são incluídos para
  // eliminar resolução de módulo em runtime → boot <300ms
  noExternal: ['picocolors', '@clack/prompts', 'zod'],

  // Shims para __dirname e __filename em ESM
  shims: true,

  // Sem declarações de tipo no build final (apenas na lib)
  dts: false,

  // Limpar dist antes de cada build
  clean: true,

  // Source maps apenas em dev (via --watch)
  sourcemap: false,
});
