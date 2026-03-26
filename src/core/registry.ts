/**
 * registry.ts — CRUD do ~/.horus/registry.json
 *
 * Responsável pelo mapa global de projetos do horus.
 * Princípios de design:
 *   1. Lazy I/O: leitura só ocorre quando necessário, nunca no boot
 *   2. Escrita atômica: write → .tmp, depois rename (previne corrupção)
 *   3. Auto-limpeza: diretórios deletados são removidos automaticamente
 *   4. Validação total: Zod valida antes de qualquer write
 *   5. Caminhos universais: sempre via os.homedir() + path.join()
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';

// ─── Constantes de caminho ───────────────────────────────────────────────────

/** Diretório de configuração do horus (~/.horus) */
const HORUS_DIR = path.join(os.homedir(), '.horus');

/** Caminho completo para o registry.json */
const REGISTRY_PATH = path.join(HORUS_DIR, 'registry.json');

// ─── Schema Zod ──────────────────────────────────────────────────────────────

/**
 * Schema de um projeto individual no registry.
 *
 * Campos:
 *   - `name`: Nome legível do projeto (label para menus)
 *   - `path`: Caminho absoluto no filesystem
 *   - `addedAt`: ISO timestamp de quando foi registrado
 */
const ProjectSchema = z.object({
  name: z.string().min(1, 'Nome do projeto não pode estar vazio'),
  path: z.string().min(1, 'Caminho do projeto não pode estar vazio'),
  addedAt: z.string().datetime({ message: 'addedAt deve ser um ISO timestamp válido' }),
});

/**
 * Schema do registry completo.
 * É um objeto com versão (para migrações futuras) e array de projetos.
 */
const RegistrySchema = z.object({
  version: z.number().int().min(1),
  projects: z.array(ProjectSchema),
});

// ─── Tipagem derivada ────────────────────────────────────────────────────────

export type Project = z.infer<typeof ProjectSchema>;
export type Registry = z.infer<typeof RegistrySchema>;

// ─── Registry padrão ─────────────────────────────────────────────────────────

function createEmptyRegistry(): Registry {
  return {
    version: 1,
    projects: [],
  };
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Carrega o registry do disco. Cria o arquivo se não existir.
 *
 * Performance: fs.readFileSync é mais rápido que async para
 * arquivos pequenos (<10KB) — evita overhead do event loop.
 *
 * @throws {Error} Se o JSON existir mas estiver corrompido e irrecuperável.
 */
export function loadRegistry(): Registry {
  // Se o diretório ~/.horus não existe, cria e retorna registry vazio
  if (!fs.existsSync(HORUS_DIR)) {
    fs.mkdirSync(HORUS_DIR, { recursive: true });
    const empty = createEmptyRegistry();
    saveRegistry(empty);
    return empty;
  }

  // Se o arquivo não existe, cria vazio
  if (!fs.existsSync(REGISTRY_PATH)) {
    const empty = createEmptyRegistry();
    saveRegistry(empty);
    return empty;
  }

  // Lê e valida
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON corrompido — recria do zero
    const empty = createEmptyRegistry();
    saveRegistry(empty);
    return empty;
  }

  // Validação pelo Zod — se falhar, recria sem perder silêncio
  const result = RegistrySchema.safeParse(parsed);
  if (!result.success) {
    // Tenta preservar projetos válidos se possível
    const empty = createEmptyRegistry();
    saveRegistry(empty);
    return empty;
  }

  return result.data;
}

// ─── Escrita atômica ─────────────────────────────────────────────────────────

/**
 * Salva o registry no disco de forma atômica.
 *
 * Estratégia: write → .tmp, depois rename.
 * Se o processo for interrompido durante o write, o .tmp parcial
 * não corrompe o registry original.
 *
 * @throws {Error} Se a validação Zod falhar (programmatic safeguard).
 */
export function saveRegistry(registry: Registry): void {
  // Validação antes de qualquer escrita — regra de ouro
  const validation = RegistrySchema.safeParse(registry);
  if (!validation.success) {
    throw new Error(
      `[horus] Registry inválido. Recusando escrita.\nErros: ${JSON.stringify(validation.error.issues, null, 2)}`,
    );
  }

  // Garante que o diretório existe
  if (!fs.existsSync(HORUS_DIR)) {
    fs.mkdirSync(HORUS_DIR, { recursive: true });
  }

  const content = JSON.stringify(validation.data, null, 2);
  const tmpPath = `${REGISTRY_PATH}.tmp`;

  // Escrita atômica: tmp → rename
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, REGISTRY_PATH);
}

// ─── Adicionar projeto ───────────────────────────────────────────────────────

export interface AddProjectOptions {
  /** Caminho do projeto (absoluto ou relativo — será resolvido) */
  projectPath: string;
  /** Nome customizado (se omitido, usa o nome do diretório) */
  name?: string;
}

export interface AddProjectResult {
  success: boolean;
  project?: Project;
  error?: string;
}

/**
 * Adiciona um projeto ao registry. Resolve caminhos relativos automaticamente.
 * Não permite duplicatas (mesmo caminho absoluto).
 */
export function addProject(options: AddProjectOptions): AddProjectResult {
  const absolutePath = path.resolve(options.projectPath);

  // Verifica se o diretório existe
  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      error: `Diretório não encontrado: ${absolutePath}`,
    };
  }

  // Verifica se é realmente um diretório
  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) {
    return {
      success: false,
      error: `O caminho não é um diretório: ${absolutePath}`,
    };
  }

  const registry = loadRegistry();

  // Normaliza o caminho para comparação cross-platform
  const normalizedPath = normalizePath(absolutePath);

  // Verifica duplicata
  const isDuplicate = registry.projects.some(
    (p) => normalizePath(p.path) === normalizedPath,
  );
  if (isDuplicate) {
    return {
      success: false,
      error: `Projeto já registrado: ${absolutePath}`,
    };
  }

  // Monta o projeto
  const project: Project = {
    name: options.name ?? path.basename(absolutePath),
    path: absolutePath,
    addedAt: new Date().toISOString(),
  };

  registry.projects.push(project);
  saveRegistry(registry);

  return { success: true, project };
}

// ─── Remover projeto ─────────────────────────────────────────────────────────

/**
 * Remove um projeto do registry pelo caminho absoluto.
 * @returns true se removeu, false se não encontrou.
 */
export function removeProject(projectPath: string): boolean {
  const registry = loadRegistry();
  const normalizedTarget = normalizePath(path.resolve(projectPath));

  const before = registry.projects.length;
  registry.projects = registry.projects.filter(
    (p) => normalizePath(p.path) !== normalizedTarget,
  );

  if (registry.projects.length === before) {
    return false; // Nada removido
  }

  saveRegistry(registry);
  return true;
}

// ─── Listar projetos ─────────────────────────────────────────────────────────

/**
 * Retorna todos os projetos registrados.
 * Não faz auto-limpeza — use `purgeInvalidProjects()` antes se necessário.
 */
export function listProjects(): readonly Project[] {
  return loadRegistry().projects;
}

// ─── Auto-limpeza (Lazy) ─────────────────────────────────────────────────────

export interface PurgeResult {
  /** Projetos que foram removidos automaticamente */
  removed: Project[];
  /** Projetos que permanecem válidos */
  remaining: Project[];
}

/**
 * Remove projetos cujos diretórios não existem mais no disco.
 *
 * ⚡ PERFORMANCE: Esta função NÃO roda no boot. Deve ser chamada
 * apenas em comandos explícitos (list, add) — nunca no caminho
 * crítico de inicialização.
 *
 * Cada fs.existsSync custa ~0.1ms, então 100 projetos = ~10ms.
 * Aceitável para uma operação interativa.
 */
export function purgeInvalidProjects(): PurgeResult {
  const registry = loadRegistry();
  const removed: Project[] = [];
  const remaining: Project[] = [];

  for (const project of registry.projects) {
    if (fs.existsSync(project.path)) {
      remaining.push(project);
    } else {
      removed.push(project);
    }
  }

  // Só escreve se houve remoções
  if (removed.length > 0) {
    registry.projects = remaining;
    saveRegistry(registry);
  }

  return { removed, remaining };
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Normaliza caminhos para comparação cross-platform.
 * Windows usa backslash, Unix usa forward slash.
 * Converte tudo para forward slash e lowercase (case-insensitive no Windows).
 */
function normalizePath(p: string): string {
  const normalized = path.resolve(p).replace(/\\/g, '/');

  // Windows é case-insensitive
  if (process.platform === 'win32') {
    return normalized.toLowerCase();
  }

  return normalized;
}

/**
 * Retorna o caminho do diretório de configuração do horus.
 * Útil para logs/debug.
 */
export function getHorusDir(): string {
  return HORUS_DIR;
}

/**
 * Retorna o caminho do arquivo registry.
 * Útil para logs/debug.
 */
export function getRegistryPath(): string {
  return REGISTRY_PATH;
}
