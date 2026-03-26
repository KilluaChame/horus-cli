// Teste programático do Discovery Engine
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  discoverTasksWithFallback,
  formatZodErrors,
  HorusConfigSchema,
} from '../src/core/parser.js';

const projectDir = path.join(os.homedir(), 'Projetos', 'Horus');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 TEST 1: horus.json válido');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const r1 = discoverTasksWithFallback(projectDir);
if (r1.result.ok) {
  console.log(`✅ Source:      ${r1.result.source}`);
  console.log(`   Project:     ${r1.result.projectName}`);
  console.log(`   Tasks found: ${r1.result.tasks.length}`);
  r1.result.tasks.forEach((t, i) => {
    console.log(`   [${i + 1}] label: "${t.label}" | cmd: "${t.cmd}"`);
  });
} else {
  console.log(`❌ Error: ${r1.result.message}`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 TEST 2: horus.json inválido (tasks: [] vazio)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const invalidConfig = { name: 'Projeto Ruim', tasks: [] };
const r2 = HorusConfigSchema.safeParse(invalidConfig);
if (!r2.success) {
  console.log('✅ Zod bloqueou corretamente!');
  console.log(formatZodErrors(r2.error.issues));
} else {
  console.log('❌ Zod deveria ter rejeitado!');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 TEST 3: horus.json inválido (label vazio, cmd ausente)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const invalidTasks = {
  name: 'Projeto',
  tasks: [
    { label: '', cmd: 'npm run dev' },  // label vazio
    { label: 'Start' },                  // cmd ausente
  ]
};
const r3 = HorusConfigSchema.safeParse(invalidTasks);
if (!r3.success) {
  console.log('✅ Zod bloqueou corretamente!');
  console.log(formatZodErrors(r3.error.issues));
} else {
  console.log('❌ Zod deveria ter rejeitado!');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 TEST 4: Fallback package.json (dir sem horus.json)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Simula com diretório temporário
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'horus-test-'));
const fakePkgJson = {
  name: 'fake-project',
  scripts: {
    dev:         'vite',
    build:       'vite build',
    test:        'vitest run',
    preinstall:  'echo pre',   // deve ser filtrado
    postbuild:   'echo post',  // deve ser filtrado
    'db:seed':   'prisma db seed',
    lint:        'eslint src',
  }
};
fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(fakePkgJson, null, 2));

const r4 = discoverTasksWithFallback(tmpDir);
if (r4.result.ok) {
  console.log(`✅ Source:      ${r4.result.source}`);
  console.log(`   Project:     ${r4.result.projectName}`);
  console.log(`   Tasks found: ${r4.result.tasks.length} (esperado: 5, filtrados preinstall e postbuild)`);
  r4.result.tasks.forEach((t, i) => {
    console.log(`   [${i + 1}] "${t.label}" | hint: "${t.hint ?? 'n/a'}"`);
  });
} else {
  console.log(`❌ Error: ${r4.result.message}`);
}

// cleanup
fs.rmSync(tmpDir, { recursive: true });

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Todos os testes concluídos!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
