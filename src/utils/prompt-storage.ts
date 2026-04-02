import * as fs from 'node:fs';
import * as path from 'node:path';
import { HORUS_HOME } from './env.js';

export const PROMPTS_DIR = path.join(HORUS_HOME, 'prompts');
const PROMPTS_META_PATH = path.join(HORUS_HOME, 'prompts_meta.json');

export interface PromptFile {
  name: string;
  path: string;
}

export interface PromptMeta {
  lastAccessed: number;
}

export type PromptsMetaMap = Record<string, PromptMeta>;

/**
 * Lê o mapa paralelo de metadados dos prompts (Tratado com Fail-Silent)
 */
export function getPromptsMeta(): PromptsMetaMap {
  try {
    if (fs.existsSync(PROMPTS_META_PATH)) {
      return JSON.parse(fs.readFileSync(PROMPTS_META_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

/**
 * Persiste o mapa paralelo de acessos
 */
function savePromptsMeta(meta: PromptsMetaMap) {
  try {
    fs.writeFileSync(PROMPTS_META_PATH, JSON.stringify(meta, null, 2), 'utf-8');
  } catch {}
}

/**
 * Hook para ser chamado sempre que um usuário abrir um Prompt na CLI
 */
export function updatePromptAccess(filename: string) {
  const meta = getPromptsMeta();
  meta[filename] = { lastAccessed: Date.now() };
  savePromptsMeta(meta);
}

/**
 * Retorna os X Prompts mais acessados da história do dev (O(N) rápido)
 */
export function getTopPrompts(limit: number = 5): PromptFile[] {
  const allPrompts = listPrompts();
  const meta = getPromptsMeta();

  return allPrompts.sort((a, b) => {
    const aTime = meta[a.name]?.lastAccessed || 0;
    const bTime = meta[b.name]?.lastAccessed || 0;
    return bTime - aTime;     // Decrescente
  }).slice(0, limit);
}

/**
 * Cria o diretório de prompts e popula os templates exigidos caso não existam.
 */
export function ensurePromptsDir() {
  if (!fs.existsSync(PROMPTS_DIR)) {
    fs.mkdirSync(PROMPTS_DIR, { recursive: true });
    
    const templates = [
      { name: 'Agent_API_AUTO.md', body: '# Agent API Automático\n\nDescreva a personalidade do agente...' },
      { name: 'Protocolo_Continuidade.md', body: '# Protocolo de Continuidade\n\nInstruções para salvar e carregar estados...' },
      { name: '1_Prompt_Gerar_PRD.md', body: '# Prompt de Geração de PRD\n\nEspecificação técnica inicial...' },
    ];

    for (const t of templates) {
      fs.writeFileSync(path.join(PROMPTS_DIR, t.name), t.body, 'utf-8');
    }
  }
}

/**
 * Lista todos os prompts na pasta (lazy).
 */
export function listPrompts(): PromptFile[] {
  ensurePromptsDir();
  try {
    const files = fs.readdirSync(PROMPTS_DIR);
    return files
      .filter((f) => f.toLowerCase().endsWith('.md'))
      .map((f) => ({ name: f, path: path.join(PROMPTS_DIR, f) }));
  } catch {
    return [];
  }
}

/**
 * Validação rigorosa do Zod-like convertida pra regex simple para cross-platform integrity.
 */
export function isValidPromptName(name: string): boolean {
  return /^[\w\-. ]+$/.test(name) && name.trim().length > 0;
}

/**
 * Cria ou avisa sobre existência de um novo arquivo MD.
 */
export function createPrompt(name: string): { ok: boolean; path?: string; error?: string } {
  ensurePromptsDir();
  
  const cleanName = name.trim();
  const filename = cleanName.toLowerCase().endsWith('.md') ? cleanName : `${cleanName}.md`;
  
  if (!isValidPromptName(filename)) {
    return { 
      ok: false, 
      error: 'Nome inválido. Use caracteres alfanuméricos, espaços, hifens ou underlines.' 
    };
  }
  
  const fullPath = path.join(PROMPTS_DIR, filename);
  if (fs.existsSync(fullPath)) {
    return { ok: false, error: 'O prompt já existe com este nome.' };
  }
  
  try {
    fs.writeFileSync(fullPath, `# ${cleanName.replace(/\.md$/i, '')}\n\nEscreva seu prompt aqui...`, 'utf-8');
    return { ok: true, path: fullPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Remove com segurança o arquivo
 */
export function deletePrompt(filename: string): boolean {
  try {
    const fullPath = path.join(PROMPTS_DIR, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
