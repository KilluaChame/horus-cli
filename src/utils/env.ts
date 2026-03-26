/**
 * env.ts — Gerenciador de I/O de chaves globais e Cache Bypass
 *
 * Garante que a leitura não passe por cache do Node ou de SDKs.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** Constantes de ambiente */
export const PROVIDER_ENV_KEYS = [
  'GEMINI_API_KEY', 'GEMINI_MODEL',
  'OPENROUTER_API_KEY', 'OPENROUTER_MODEL',
  'GROQ_API_KEY', 'GROQ_MODEL',
  'OPENAI_API_KEY', 'OPENAI_MODEL',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
  'OLLAMA_MODEL'
];

/** Diretório global do Horus no HOME do usuário */
export const HORUS_HOME = path.join(os.homedir(), '.horus');

/** Caminho do .env global (nunca salvo em repo local) */
export const GLOBAL_ENV_PATH = path.join(HORUS_HOME, '.env');

/** Lé o .env global e retorna um Map<chave, valor> (Forte I/O Bypass v8 Cache) */
export function readGlobalEnvMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(GLOBAL_ENV_PATH)) return map;

  try {
    const content = fs.readFileSync(GLOBAL_ENV_PATH, { encoding: 'utf-8' });
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      // String vazia = chave inexistente
      if (val && val.length > 0) map.set(key, val);
    }
  } catch { /* silencioso */ }
  return map;
}

/** Insere ou atualiza uma variável no conteúdo do .env. */
export function upsertEnvVar(content: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  const regex = new RegExp(`^${key}\\s*=`);
  const newLine = `${key}=${value}`;

  let found = false;
  const updated = lines.map((line) => {
    if (regex.test(line)) {
      found = true;
      return newLine;
    }
    return line;
  });

  if (!found) {
    const trimmed = updated.filter((l) => l.trim() !== '' || updated.indexOf(l) < updated.length - 1);
    trimmed.push(newLine);
    return trimmed.join('\n') + '\n';
  }

  return updated.join('\n');
}

/** Carrega as variáveis do ~/.horus/.env para process.env. (Usado no Boot) */
export function loadGlobalEnv(): void {
  if (fs.existsSync(GLOBAL_ENV_PATH)) {
    try {
      const content = fs.readFileSync(GLOBAL_ENV_PATH, { encoding: 'utf-8' });
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();

        if (!process.env[key] && val.length > 0) {
          process.env[key] = val;
        }
      }
    } catch { /* Silencioso */ }
  }
}

/** 
 * Limpa o cache de estado interno (process.env) para forçar leitura 
 * que venha unicamente do disco. Atua contra "Chaves Zumbis".
 */
export function clearInternalState(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('HORUS_') || PROVIDER_ENV_KEYS.includes(key)) {
      delete process.env[key];
    }
  }
}
