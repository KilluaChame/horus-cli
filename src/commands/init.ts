/**
 * init.ts — Comando `hrs init` (Fase 6 / Pré-Fase 8: Horus IA Agent)
 *
 * Modos de operação:
 *   `hrs init`       → Gera horus.json interativamente baseado nos scripts existentes
 *   `hrs init --ai`  → Analisa a stack do projeto e gera horus.json com IA (esqueleto Fase 8)
 *
 * O arquivo gerado segue o schema HorusConfigSchema do parser.ts.
 */

import * as clack from '@clack/prompts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { theme } from '../ui/theme.js';
import { wasCancelled, handleCancel } from '../ui/prompts.js';
import { HorusConfigSchema } from '../core/parser.js';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface TaskDraft {
  label: string;
  cmd: string;
  hint?: string;
  group?: string;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function handleInitCommand(flags: string[]): Promise<void> {
  const isAiMode = flags.includes('--ai');
  const cwd      = process.cwd();
  const outPath  = path.join(cwd, 'horus.json');

  // Aviso se já existe
  if (fs.existsSync(outPath)) {
    const overwrite = await clack.confirm({
      message: theme.warn('⚠  horus.json já existe neste diretório. Sobrescrever?'),
      initialValue: false,
    });

    if (wasCancelled(overwrite) || !overwrite) {
      clack.log.info(theme.muted('Init cancelado. Arquivo existente preservado.'));
      return;
    }
  }

  if (isAiMode) {
    await runAiInit(cwd, outPath);
  } else {
    await runInteractiveInit(cwd, outPath);
  }
}

// ─── Modo Interativo ─────────────────────────────────────────────────────────

async function runInteractiveInit(cwd: string, outPath: string): Promise<void> {
  clack.log.info(theme.muted(`📁 Inicializando horus.json em: ${cwd}`));

  // Detecta scripts do package.json para oferecer como ponto de partida
  const suggestedTasks = detectExistingScripts(cwd);

  if (suggestedTasks.length > 0) {
    clack.log.info(
      theme.muted(`💡 Detectei ${suggestedTasks.length} script(s) no package.json. Eles foram pré-preenchidos.`),
    );
  }

  // Nome do projeto
  const nameInput = await clack.text({
    message: theme.primary('Nome do projeto:'),
    placeholder: path.basename(cwd),
    defaultValue: path.basename(cwd),
    validate: (v) => (!v?.trim() ? 'O nome é obrigatório.' : undefined),
  });

  if (wasCancelled(nameInput)) handleCancel();

  // Descrição (opcional)
  const descInput = await clack.text({
    message: theme.primary('Descrição do projeto (opcional):'),
    placeholder: 'Ex: API backend do meu app',
  });

  if (wasCancelled(descInput)) handleCancel();

  // Monta o horus.json com as tasks sugeridas
  const config = buildHorusConfig(
    (nameInput as string).trim(),
    descInput ? (descInput as string).trim() : undefined,
    suggestedTasks,
  );

  writeAndReport(config, outPath);
}

// ─── Modo IA (Esqueleto Fase 8) ──────────────────────────────────────────────

/**
 * Analisa a stack do projeto e planeja o horus.json ideal.
 *
 * FASE 8 — Integração com LLM:
 * O prompt abaixo será enviado à API de IA quando integrada.
 * Por ora, o modo --ai executa uma análise heurística local (sem API externa).
 *
 * ─── PROMPT DO SISTEMA (para referência da Fase 8) ───────────────────────────
 *
 * Você é um assistente de configuração de projetos de software.
 * Analisando a estrutura de arquivos e scripts do projeto, gere um horus.json
 * seguindo estas regras:
 *
 *   1. Identifique a stack tecnológica (Node.js, Python, Rust, Go, Docker, etc.)
 *   2. Crie labels descritivos com emojis relevantes à stack:
 *         Node.js/npm  → 📦  Python → 🐍  Docker → 🐳  Git → 🌱  Teste → 🧪
 *   3. Agrupe tarefas por contexto: "Desenvolvimento", "Build", "Testes", "Deploy", "Git"
 *   4. Adicione hints que expliquem o que o comando faz
 *   5. Filtre comandos internos/hooks (preinstall, postbuild, etc.)
 *   6. Retorne SOMENTE o JSON válido, sem comentários ou markdown
 *
 * Input: { scripts: {...}, files: [...], dependencies: {...} }
 * Output: { name, description, tasks: [{label, cmd, hint, group}] }
 *
 * ─── FIM DO PROMPT ───────────────────────────────────────────────────────────
 */
async function runAiInit(cwd: string, outPath: string): Promise<void> {
  const s = clack.spinner();
  s.start(theme.muted('🤖 Analisando estrutura do projeto...'));

  // Análise heurística local (substituída pela API de IA na Fase 8)
  const stackInfo = analyzeProjectStack(cwd);
  await sleep(800); // Simula latência de análise

  s.stop(theme.success(`✓ Stack detectada: ${stackInfo.stackLabel}`));

  // Gera tarefas baseadas na heurística
  const aiTasks = generateAiTasks(stackInfo);

  clack.log.info(
    theme.muted(`💡 Geradas ${aiTasks.length} tarefa(s) baseadas na stack detectada.`),
  );

  // Mostra preview antes de salvar
  const preview = aiTasks
    .slice(0, 4)
    .map((t) => `  ${theme.accent(t.label)} → ${theme.muted(t.cmd)}`)
    .join('\n');

  clack.note(
    preview + (aiTasks.length > 4 ? `\n  ${theme.muted(`... e mais ${aiTasks.length - 4} tarefa(s)`)}` : ''),
    theme.primary('🔮 Preview do horus.json gerado'),
  );

  const confirm = await clack.confirm({
    message: theme.primary('Salvar este horus.json?'),
    initialValue: true,
  });

  if (wasCancelled(confirm) || !confirm) {
    clack.log.info(theme.muted('Init cancelado.'));
    return;
  }

  const config = buildHorusConfig(
    stackInfo.projectName,
    `Gerado pelo horus IA Agent — stack: ${stackInfo.stackLabel}`,
    aiTasks,
  );

  writeAndReport(config, outPath);
}

// ─── Análise de Stack (heurística local) ────────────────────────────────────

interface StackInfo {
  projectName: string;
  stackLabel: string;
  hasDocker: boolean;
  hasMakefile: boolean;
  hasPackageJson: boolean;
  hasPyproject: boolean;
  hasCargoToml: boolean;
  hasGoMod: boolean;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
}

function analyzeProjectStack(cwd: string): StackInfo {
  const exists = (f: string) => fs.existsSync(path.join(cwd, f));
  const projectName = path.basename(cwd);

  // Detecta arquivos de projeto
  const hasDocker     = exists('Dockerfile') || exists('docker-compose.yml');
  const hasMakefile   = exists('Makefile');
  const hasPackageJson = exists('package.json');
  const hasPyproject  = exists('pyproject.toml') || exists('requirements.txt');
  const hasCargoToml  = exists('Cargo.toml');
  const hasGoMod      = exists('go.mod');

  // Lê scripts e deps do package.json
  let scripts: Record<string, string> = {};
  let dependencies: Record<string, string> = {};

  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      scripts = pkg.scripts ?? {};
      dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    } catch { /* ignora JSON malformado */ }
  }

  // Identifica a stack principal
  const hasNext    = 'next' in dependencies;
  const hasVite    = 'vite' in dependencies;
  const hasExpo    = 'expo' in dependencies;
  const hasNest    = '@nestjs/core' in dependencies;
  const hasPrisma  = '@prisma/client' in dependencies || 'prisma' in dependencies;
  const hasVitest  = 'vitest' in dependencies;
  const hasJest    = 'jest' in dependencies;

  const stackParts: string[] = [];
  if (hasNext)   stackParts.push('Next.js');
  if (hasVite)   stackParts.push('Vite');
  if (hasExpo)   stackParts.push('Expo');
  if (hasNest)   stackParts.push('NestJS');
  if (hasPrisma) stackParts.push('Prisma');
  if (hasDocker) stackParts.push('Docker');
  if (hasPyproject) stackParts.push('Python');
  if (hasCargoToml) stackParts.push('Rust');
  if (hasGoMod)  stackParts.push('Go');
  if (stackParts.length === 0 && hasPackageJson) stackParts.push('Node.js');

  return {
    projectName,
    stackLabel: stackParts.join(' + ') || 'Genérico',
    hasDocker,
    hasMakefile,
    hasPackageJson,
    hasPyproject,
    hasCargoToml,
    hasGoMod,
    scripts,
    dependencies,
  };
}

// ─── Geração de tarefas com emojis por stack ─────────────────────────────────

function generateAiTasks(info: StackInfo): TaskDraft[] {
  const tasks: TaskDraft[] = [];
  const NPM_HOOKS = /^(pre|post)\w+$/;
  const hasScript = (name: string) => name in info.scripts;

  // Node.js: scripts do package.json com labels inteligentes
  if (info.hasPackageJson) {
    const emojiMap: Record<string, string> = {
      dev:       '👁️  Watch Mode',
      start:     '🚀 Iniciar',
      build:     '🏗️  Build',
      test:      '🧪 Testes',
      lint:      '🔍 Lint',
      typecheck: '🔍 Typecheck',
      preview:   '👀 Preview',
      generate:  '⚙️  Gerar',
      migrate:   '🗄️  Migrar DB',
      seed:      '🌱 Seed DB',
      studio:    '🎨 Studio',
      export:    '📦 Exportar',
      deploy:    '🚀 Deploy',
      release:   '🏷️  Release',
      format:    '✨ Formatar',
      clean:     '🧹 Limpar',
    };

    const groupMap: Record<string, string> = {
      dev: 'Desenvolvimento', start: 'Desenvolvimento', preview: 'Desenvolvimento',
      build: 'Build', export: 'Build', deploy: 'Deploy', release: 'Deploy',
      test: 'Testes', lint: 'Qualidade', typecheck: 'Qualidade', format: 'Qualidade',
      migrate: 'Banco de Dados', seed: 'Banco de Dados', studio: 'Banco de Dados', generate: 'Banco de Dados',
      clean: 'Utilitários',
    };

    for (const [scriptName, scriptCmd] of Object.entries(info.scripts)) {
      if (NPM_HOOKS.test(scriptName)) continue;

      // Encontra emoji e grupo pelo nome do script (ou pelo sufixo)
      const key = Object.keys(emojiMap).find((k) => scriptName === k || scriptName.endsWith(`:${k}`));
      const baseKey = key ?? scriptName.split(':').pop() ?? scriptName;
      const label = emojiMap[baseKey] ?? `📦 ${scriptName}`;
      const group = groupMap[baseKey] ?? 'Scripts';

      tasks.push({
        label,
        cmd: `npm run ${scriptName}`,
        // exactOptionalPropertyTypes: omite propriedades quando undefined
        ...(scriptCmd.length < 60 ? { hint: scriptCmd } : {}),
        ...(group !== 'Scripts' ? { group } : {}),
      });
    }
  }

  // Docker
  if (info.hasDocker) {
    const composeFile = fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'));
    if (composeFile) {
      tasks.push(
        { label: '🐳 Docker: Up',   cmd: 'docker-compose up -d',    hint: 'Sobe os serviços em background', group: 'Docker' },
        { label: '🐳 Docker: Down', cmd: 'docker-compose down',      hint: 'Para e remove os containers',   group: 'Docker' },
        { label: '🐳 Docker: Logs', cmd: 'docker-compose logs -f',   hint: 'Monitora os logs dos serviços', group: 'Docker' },
      );
    } else {
      const name = info.projectName.toLowerCase().replace(/\s+/g, '-');
      tasks.push(
        { label: '🐳 Docker: Build', cmd: `docker build -t ${name} .`, hint: 'Constrói a imagem', group: 'Docker' },
        { label: '🐳 Docker: Run',   cmd: `docker run -p 3000:3000 ${name}`, group: 'Docker' },
      );
    }
  }

  // Git (sempre útil)
  tasks.push(
    { label: '🌱 Git: Status', cmd: 'git status',                   group: 'Git' },
    { label: '🌱 Git: Pull',   cmd: 'git pull',                     hint: 'Atualiza o repositório',      group: 'Git' },
    { label: '🌱 Git: Log',    cmd: 'git log --oneline -10',        hint: 'Últimos 10 commits',          group: 'Git' },
  );

  // Python
  if (info.hasPyproject) {
    tasks.push(
      { label: '🐍 Python: Instalar', cmd: 'pip install -r requirements.txt', group: 'Python' },
      { label: '🐍 Python: Run',      cmd: 'python main.py',                  group: 'Python' },
      { label: '🐍 Python: Testes',   cmd: 'pytest',                          group: 'Python' },
    );
  }

  // Rust
  if (info.hasCargoToml) {
    tasks.push(
      { label: '🦀 Rust: Build', cmd: 'cargo build',         group: 'Rust' },
      { label: '🦀 Rust: Run',   cmd: 'cargo run',           group: 'Rust' },
      { label: '🦀 Rust: Test',  cmd: 'cargo test',          group: 'Rust' },
      { label: '🦀 Rust: Check', cmd: 'cargo check --all',   group: 'Rust' },
    );
  }

  // Go
  if (info.hasGoMod) {
    tasks.push(
      { label: '🐹 Go: Run',   cmd: 'go run .',       group: 'Go' },
      { label: '🐹 Go: Build', cmd: 'go build .',     group: 'Go' },
      { label: '🐹 Go: Test',  cmd: 'go test ./...',  group: 'Go' },
    );
  }

  return tasks;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detecta scripts do package.json para pré-preenchimento no modo interativo */
function detectExistingScripts(cwd: string): TaskDraft[] {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };

    const NPM_HOOKS = /^(pre|post)\w+$/;
    return Object.entries(pkg.scripts ?? {})
      .filter(([name]) => !NPM_HOOKS.test(name))
      .map(([name, cmd]) => ({
        label: `📦 ${name}`,
        cmd: `npm run ${name}`,
        // exactOptionalPropertyTypes: omite hint quando muito longo
        ...(cmd.length < 60 ? { hint: cmd } : {}),
      }));
  } catch {
    return [];
  }
}

/** Monta o objeto de configuração e valida com Zod */
function buildHorusConfig(
  name: string,
  description: string | undefined,
  tasks: TaskDraft[],
): Record<string, unknown> {
  const config = {
    name,
    ...(description ? { description } : {}),
    tasks: tasks.map((t) => ({
      label: t.label,
      cmd:   t.cmd,
      ...(t.hint  ? { hint: t.hint }   : {}),
      ...(t.group ? { group: t.group } : {}),
    })),
  };

  // Valida com o mesmo schema do Discovery Engine
  const result = HorusConfigSchema.safeParse(config);
  if (!result.success) {
    // Fallback seguro: garante ao menos 1 task stub
    config.tasks = [{ label: '📦 Iniciar', cmd: 'npm start' }];
  }

  return config;
}

/** Escreve o arquivo e reporta na UI */
function writeAndReport(config: Record<string, unknown>, outPath: string): void {
  try {
    fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    const taskItems = config['tasks'];
  const tasksCount = Array.isArray(taskItems) ? taskItems.length : 0;

    clack.log.success(theme.success(`✓ horus.json criado com ${tasksCount} tarefa(s)!`));
    clack.note(
      [
        `${theme.bold('Arquivo:')} ${theme.muted(outPath)}`,
        '',
        `${theme.muted('Próximos passos:')}`,
        `  ${theme.accent('hrs run')}   ${theme.muted('→ Execute suas tarefas agora')}`,
        `  ${theme.accent('hrs add .')} ${theme.muted('→ Registre este projeto globalmente')}`,
      ].join('\n'),
      theme.primary('✨ Inicialização concluída'),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    clack.log.error(theme.error(`✗ Erro ao salvar horus.json: ${msg}`));
  }
}

/** Delay mínimo para UX do spinner de IA */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
