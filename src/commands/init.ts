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
import { selectRegisteredProject } from './register.js';

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

  // Seleção de diretório alvo (Smart Init v2)
  const targetCwd = await promptTargetDirectory();
  if (!targetCwd) return; // cancelado

  const outPath = path.join(targetCwd, 'horus.json');

  // Muda o contexto virtualmente antes de prosseguir
  if (process.cwd() !== targetCwd) {
    try {
      process.chdir(targetCwd);
    } catch {
      clack.log.error(theme.error(`✗ Erro ao acessar o diretório: ${targetCwd}`));
      return;
    }
  }

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
    await runAiInit(targetCwd, outPath);
  } else {
    await runInteractiveInit(targetCwd, outPath);
  }
}

// ─── Seleção de Diretório ───────────────────────────────────────────────────

async function promptTargetDirectory(): Promise<string | null> {
  const cwd = process.cwd();
  const cwdBasename = path.basename(cwd);

  const source = await clack.select({
    message: theme.primary('Onde deseja inicializar o horus.json?'),
    options: [
      {
        value: 'cwd',
        label: `${theme.success('●')}  Utilizar diretório atual`,
        hint: `${cwdBasename} — ${cwd}`,
      },
      {
        value: 'registry',
        label: `${theme.accent('≡')}  Escolher de um projeto registrado`,
        hint: 'Navega e inicializa em um projeto existente',
      },
      {
        value: 'manual',
        label: `${theme.accent('✎')}  Informar outro caminho manualmente`,
        hint: 'Validação de caminho via FS',
      },
      {
        value: 'cancel',
        label: theme.muted('← Cancelar inicialização'),
      },
    ],
  });

  if (wasCancelled(source) || source === 'cancel') {
    clack.log.info(theme.muted('Inicialização cancelada.'));
    return null;
  }

  if (source === 'cwd') {
    return cwd;
  }

  if (source === 'registry') {
    const project = await selectRegisteredProject();
    if (!project) {
      clack.log.info(theme.muted('Inicialização cancelada (Nenhum projeto selecionado).'));
      return null;
    }
    return project.path;
  }

  // Entrada manual de caminho
  const manualInput = await clack.text({
    message: theme.primary('Informe o caminho completo do projeto:'),
    placeholder: `${process.platform === 'win32' ? 'C:\\projetos\\meu-app' : '/home/user/projetos/meu-app'}`,
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return 'O caminho não pode estar vazio.';
      }

      const resolved = path.resolve(value.trim());

      if (!fs.existsSync(resolved)) {
        return `Caminho não encontrado: ${resolved}`;
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return `O caminho não é um diretório: ${resolved}`;
      }

      return undefined;
    },
  });

  if (wasCancelled(manualInput)) {
    clack.log.info(theme.muted('Inicialização cancelada.'));
    return null;
  }

  return path.resolve((manualInput as string).trim());
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

// ─── Modo IA (Fase 9 — AI Discovery Agent) ──────────────────────────────────

/**
 * Integração real com o Google Gemini (Fase 9).
 *
 * Fluxo:
 *   1. Escaneia o repositório via ai-agent.ts (lazy import)
 *   2. Envia contexto ao LLM com system prompt estruturado
 *   3. Valida o JSON retornado com HorusConfigSchema (Zod)
 *   4. Aplica filtro de segurança @security-auditor
 *   5. Exibe preview + prompt de confirmação: Salvar / Editar / Cancelar
 *   6. Em caso de falha de API → fallback para a heurística local
 */
async function runAiInit(cwd: string, outPath: string): Promise<void> {
  const s = clack.spinner();
  s.start(theme.muted('🤖 Conectando ao AI Discovery Agent (Gemini)…'));

  // Lazy-import: garante que o SDK de IA não infle o bundle de boot (RNF2)
  const { runAiDiscovery } = await import('../core/ai-agent.js');
  const outcome = await runAiDiscovery(cwd).catch((err: unknown) => ({
    ok: false as const,
    reason: 'unknown' as const,
    message: err instanceof Error ? err.message : String(err),
  }));

  s.stop(
    outcome.ok
      ? theme.success('✓ horus.json gerado com IA!')
      : theme.warn(`⚠  Fallback para heurística local — ${outcome.message.split('\n')[0]}`),
  );

  // ── Fallback para heurística local em caso de erro ──────────────────────────
  if (!outcome.ok) {
    if (outcome.reason === 'no-api-key') {
      clack.note(
        [
          `${theme.muted('Para usar o AI Agent, exporte a chave da Groq (Llama 3) ou Google Gemini:')}`,
          `  ${theme.accent('$')} ${theme.bold('export GROQ_API_KEY="sua-chave-aqui"')}`,
          `  ${theme.muted('→ Groq (Grátis & Muito Rápido): https://console.groq.com/')}`,
          `  ${theme.muted('→ Gemini (Grátis): https://aistudio.google.com/')}`,
          '',
          `${theme.muted('Continuando com a heurística local…')}`,
        ].join('\n'),
        theme.warn('🔑 Chave de API de IA não encontrada'),
      );
    } else {
      clack.log.warn(theme.warn(outcome.message));
    }

    // Ativa fallback heurístico
    const stackInfo = analyzeProjectStack(cwd);
    const aiTasks   = generateAiTasks(stackInfo);
    const config    = buildHorusConfig(
      stackInfo.projectName,
      `Gerado pelo horus (heurística local) — stack: ${stackInfo.stackLabel}`,
      aiTasks,
    );
    writeAndReport(config, outPath);
    return;
  }

  // ── Exibir alertas de segurança ──────────────────────────────────────────────
  if (outcome.warnings.length > 0) {
    clack.log.warn(theme.warn('🛡  Comandos suspeitos foram removidos pelo filtro de segurança:'));
    for (const w of outcome.warnings) {
      clack.log.info(theme.muted(`  ${w}`));
    }
  }

  // ── Preview do contrato gerado pela IA ─────────────────────────────────────
  const tasks   = outcome.config.tasks ?? [];
  const preview = tasks
    .slice(0, 6)
    .map((t) => `  ${theme.accent(t.label)}  ${theme.muted('→')}  ${theme.muted(t.cmd)}${t.hint ? `  ${theme.muted('·')} ${theme.muted(t.hint)}` : ''}`)
    .join('\n');

  clack.note(
    [
      `${theme.bold('Nome:')}    ${theme.accent(outcome.config.name)}`,
      outcome.config.description ? `${theme.bold('Desc:')}    ${theme.muted(outcome.config.description)}` : '',
      `${theme.bold('Tasks:')}   ${theme.accent(String(tasks.length))} tarefa(s)`,
      '',
      preview,
      tasks.length > 6 ? `  ${theme.muted(`… e mais ${tasks.length - 6} tarefa(s)`)}` : '',
    ].filter(Boolean).join('\n'),
    theme.primary('🔮 Contrato gerado pela IA'),
  );

  // ── Confirmação: Salvar / Cancelar ─────────────────────────────────────────
  const action = await clack.select({
    message: theme.primary('Este contrato reflete bem o seu projeto?'),
    options: [
      { value: 'save',   label: `${theme.success('✓')}  Salvar horus.json` },
      { value: 'cancel', label: theme.muted('✕  Cancelar') },
    ],
  });

  if (wasCancelled(action) || action === 'cancel') {
    clack.log.info(theme.muted('Init cancelado.'));
    return;
  }

  // Converte para Record<string, unknown> para writeAndReport
  writeAndReport(outcome.config as unknown as Record<string, unknown>, outPath);
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
