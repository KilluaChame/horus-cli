/**
 * docs-manager.ts — Gestão de Documentos do Projeto (Fase Evolução)
 *
 * Substitui o leitor estático de README por um submódulo completo de CRUD documental.
 * Lazy-loaded: importado somente quando o usuário acessa "Documentos do Projeto".
 *
 * Fontes de documentos (scan automático):
 *   1. README.md, CHANGELOG.md, CONTRIBUTING.md na raiz (case-insensitive)
 *   2. Arquivos .md em docs/ (se existir)
 *   3. Referências extras persistidas em .horus/docs.json
 *
 * Persistência: .horus/docs.json com escrita transacional (.tmp → rename)
 * Editor: $EDITOR → code --wait → nano (fallback dinâmico)
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as clack from '@clack/prompts';
import { theme, waitForKeypress } from '../ui/theme.js';
import { wasCancelled } from '../ui/prompts.js';
import { renderMarkdownFile } from './view-readme.js';

// ─── Tipos ────────────────────────────────────────────────────────────────

interface DocsConfig {
  /** Caminhos relativos ao projeto de documentos extras registrados pelo usuário */
  docs: string[];
}

// ─── Constantes ───────────────────────────────────────────────────────────

/** Documentos padrão escaneados na raiz (case-insensitive) */
const ROOT_DOC_NAMES = ['readme.md', 'changelog.md', 'contributing.md', 'license.md'];

// ─── Handler Principal ───────────────────────────────────────────────────

/**
 * Menu de gestão de documentos do projeto.
 * Loop interno: permite visualizar, adicionar e remover documentos sem sair.
 */
export async function handleDocsManager(projectPath: string): Promise<void> {
  while (true) {
    const allDocs = await discoverDocuments(projectPath);

    const options: Array<{ value: string; label: string; hint?: string }> = [];

    if (allDocs.length > 0) {
      options.push({
        value: '__view__',
        label: `${theme.white('📖')}  Visualizar documento`,
        hint: `${allDocs.length} documento(s) encontrado(s)`,
      });
    }

    options.push(
      { value: '__add__', label: `${theme.accent('➕')}  Adicionar documento` },
    );

    if (allDocs.length > 0) {
      options.push(
        { value: '__edit__', label: `${theme.warn('✏️')}  Editar documento` },
        { value: '__remove__', label: `${theme.error('🗑️')}  Remover referência` },
      );
    }

    options.push(
      { value: '__back__', label: `${theme.muted('←')}  Voltar` },
    );

    const action = await clack.select({
      message: theme.primary('📖 Documentos do Projeto'),
      options,
    });

    if (wasCancelled(action) || action === '__back__') break;

    if (action === '__view__') {
      await viewDocument(projectPath, allDocs);
    } else if (action === '__add__') {
      await addDocument(projectPath);
    } else if (action === '__edit__') {
      await editDocument(projectPath, allDocs);
    } else if (action === '__remove__') {
      await removeDocument(projectPath, allDocs);
    }
  }
}

// ─── Descoberta de Documentos ─────────────────────────────────────────────

/**
 * Varre fontes de documentos e retorna lista unificada de caminhos absolutos.
 * Ordem: root docs → docs/ folder → extras persistidos
 */
async function discoverDocuments(projectPath: string): Promise<string[]> {
  const found: Set<string> = new Set();

  // 1. Scan raiz
  try {
    const rootEntries = await fsPromises.readdir(projectPath, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && ROOT_DOC_NAMES.includes(entry.name.toLowerCase())) {
        found.add(path.join(projectPath, entry.name));
      }
    }
  } catch { /* pasta inacessível */ }

  // 2. Scan docs/
  const docsDir = path.join(projectPath, 'docs');
  try {
    if (fs.existsSync(docsDir) && fs.statSync(docsDir).isDirectory()) {
      const docEntries = await fsPromises.readdir(docsDir, { withFileTypes: true });
      for (const entry of docEntries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          found.add(path.join(docsDir, entry.name));
        }
      }
    }
  } catch { /* ignora */ }

  // 3. Extras do .horus/docs.json
  const extras = readDocsConfig(projectPath);
  for (const rel of extras.docs) {
    const abs = path.resolve(projectPath, rel);
    if (fs.existsSync(abs)) {
      found.add(abs);
    }
  }

  return [...found].sort();
}

// ─── Visualizar ───────────────────────────────────────────────────────────

async function viewDocument(projectPath: string, docs: string[]): Promise<void> {
  const selected = await selectDocument(docs, projectPath, 'Qual documento deseja visualizar?');
  if (!selected) return;

  try {
    await renderMarkdownFile(selected);
  } catch (err) {
    clack.log.error(theme.error(`Falha ao ler o documento: ${String(err)}`));
  }
  await waitForKeypress();
}

// ─── Adicionar ────────────────────────────────────────────────────────────

async function addDocument(projectPath: string): Promise<void> {
  const input = await clack.text({
    message: theme.primary('Caminho do documento (relativo ao projeto):'),
    placeholder: 'Ex: docs/API.md, DEPLOY.md',
    validate: (value) => {
      if (!value?.trim()) return 'O caminho não pode estar vazio.';
      const abs = path.resolve(projectPath, value.trim());
      if (!fs.existsSync(abs)) return `Arquivo não encontrado: ${abs}`;
      if (!fs.statSync(abs).isFile()) return `O caminho não é um arquivo: ${abs}`;
      return undefined;
    },
  });

  if (wasCancelled(input)) return;

  const relPath = (input as string).trim();
  const config = readDocsConfig(projectPath);

  if (!config.docs.includes(relPath)) {
    config.docs.push(relPath);
    writeDocsConfig(projectPath, config);
    clack.log.success(theme.success(`✓ Documento "${relPath}" registrado.`));
  } else {
    clack.log.info(theme.muted('Documento já está registrado.'));
  }
}

// ─── Editar ───────────────────────────────────────────────────────────────

/**
 * Abre o editor com fallback dinâmico:
 *   1. $EDITOR (ex: vim, nano, code --wait)
 *   2. code --wait (VS Code)
 *   3. notepad (Windows) / nano (Unix)
 */
async function editDocument(projectPath: string, docs: string[]): Promise<void> {
  const selected = await selectDocument(docs, projectPath, 'Qual documento deseja editar?');
  if (!selected) return;

  const editor = resolveEditor();
  const s = clack.spinner();
  s.start(theme.muted(`Abrindo ${path.basename(selected)} em ${editor.label}...`));

  const success = await openInEditor(editor.cmd, selected);
  if (success) {
    s.stop(theme.success(`✓ Documento salvo via ${editor.label}.`));
  } else {
    s.stop(theme.error(`✗ Falha ao abrir editor: ${editor.label}`));

    // Tenta fallback
    if (editor.fallback) {
      clack.log.info(theme.muted(`Tentando fallback: ${editor.fallback.label}...`));
      const fallbackSuccess = await openInEditor(editor.fallback.cmd, selected);
      if (fallbackSuccess) {
        clack.log.success(theme.success(`✓ Documento salvo via ${editor.fallback.label}.`));
      } else {
        clack.log.error(theme.error(`✗ Nenhum editor disponível.`));
      }
    }
  }
}

// ─── Spawn de Editor (child_process nativo) ────────────────────────────────

/**
 * Abre um arquivo no editor especificado usando child_process.spawn.
 * Suporta comandos com args (ex: "code --wait").
 * Retorna true se o editor fechou com código 0, false caso contrário.
 */
function openInEditor(editorCmd: string, filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = editorCmd.split(/\s+/);
    const cmd = parts[0]!;
    const args = [...parts.slice(1), filePath];

    try {
      const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

// ─── Remover ──────────────────────────────────────────────────────────────

async function removeDocument(projectPath: string, docs: string[]): Promise<void> {
  // Somente permite remover referências extras (não os docs auto-descobertos)
  const config = readDocsConfig(projectPath);

  if (config.docs.length === 0) {
    clack.log.info(theme.muted('Nenhuma referência extra para remover. Documentos auto-descobertos não podem ser removidos.'));
    await waitForKeypress();
    return;
  }

  const options = config.docs.map((rel) => ({
    value: rel,
    label: theme.white(rel),
    hint: fs.existsSync(path.resolve(projectPath, rel)) ? theme.success('existe') : theme.error('não encontrado'),
  }));

  options.push({ value: '__back__', label: theme.muted('← Cancelar'), hint: '' });

  const selected = await clack.select({
    message: theme.warn('Qual referência deseja remover?'),
    options,
  });

  if (wasCancelled(selected) || selected === '__back__') return;

  const confirm = await clack.confirm({
    message: theme.warn(`Remover referência "${String(selected)}"? (O arquivo NÃO será deletado)`),
    initialValue: false,
  });

  if (wasCancelled(confirm) || !confirm) return;

  config.docs = config.docs.filter((d) => d !== selected);
  writeDocsConfig(projectPath, config);
  clack.log.success(theme.success(`✓ Referência removida.`));
}

// ─── Selector Compartilhado ───────────────────────────────────────────────

async function selectDocument(docs: string[], projectPath: string, message: string): Promise<string | null> {
  const options = docs.map((absPath) => ({
    value: absPath,
    label: theme.white(path.basename(absPath)),
    hint: path.relative(projectPath, absPath) || path.basename(absPath),
  }));

  options.push({ value: '__back__', label: theme.muted('← Cancelar'), hint: '' });

  const selected = await clack.select({
    message: theme.primary(message),
    options,
  });

  if (wasCancelled(selected) || selected === '__back__') return null;
  return selected as string;
}

// ─── Persistência (.horus/docs.json) ──────────────────────────────────────

function getDocsConfigPath(projectPath: string): string {
  return path.join(projectPath, '.horus', 'docs.json');
}

function readDocsConfig(projectPath: string): DocsConfig {
  const configPath = getDocsConfigPath(projectPath);
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
      if (raw && typeof raw === 'object' && 'docs' in raw && Array.isArray((raw as DocsConfig).docs)) {
        return raw as DocsConfig;
      }
    }
  } catch { /* ignora JSON malformado */ }
  return { docs: [] };
}

/**
 * Escrita transacional: escreve em .tmp e renomeia para evitar corrupção.
 */
function writeDocsConfig(projectPath: string, config: DocsConfig): void {
  const configPath = getDocsConfigPath(projectPath);
  const horusDir = path.dirname(configPath);
  const tmpPath = configPath + '.tmp';

  if (!fs.existsSync(horusDir)) {
    fs.mkdirSync(horusDir, { recursive: true });
  }

  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmpPath, configPath);
}

// ─── Resolução de Editor ──────────────────────────────────────────────────

interface EditorInfo {
  cmd: string;
  label: string;
  fallback?: EditorInfo;
}

function resolveEditor(): EditorInfo {
  const envEditor = process.env['EDITOR'];

  // Prioridade 1: $EDITOR
  if (envEditor && envEditor.trim().length > 0) {
    return {
      cmd: envEditor.trim(),
      label: path.basename(envEditor.trim().split(' ')[0] ?? envEditor.trim()),
      fallback: getSystemFallback(),
    };
  }

  // Prioridade 2: VS Code
  return {
    cmd: 'code --wait',
    label: 'VS Code',
    fallback: getSystemFallback(),
  };
}

function getSystemFallback(): EditorInfo {
  if (process.platform === 'win32') {
    return { cmd: 'notepad', label: 'Notepad' };
  }
  return { cmd: 'nano', label: 'nano' };
}
