/**
 * ai-config.ts — Configuração de Provedor de IA (BYOK — Bring Your Own Key)
 *
 * Responsabilidades:
 *   1. Orientar o usuário sobre onde obter API Keys dos provedores suportados.
 *   2. Coletar modelo e chave de forma segura (password masking).
 *   3. Persistir em ~/.horus/.env (GLOBAL — nunca no diretório local do projeto).
 *   4. Carregar variáveis sob demanda via dotenv.
 *
 * ⚡ Performance (RNF2):
 *   - Este módulo é lazy-loaded: importado apenas quando o usuário acessa
 *     "⚙️ Configurar Provedor de IA" no menu de init.
 *   - Zero I/O no boot do Horus.
 *
 * 🔒 Segurança:
 *   - API Keys são salvas em ~/.horus/.env, fora de qualquer repositório Git.
 *   - O input do campo apiKey usa p.password() para ocultar o valor no terminal.
 */

import * as clack from '@clack/prompts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { theme } from '../ui/theme.js';
import { wasCancelled } from '../ui/prompts.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Diretório global do Horus no HOME do usuário */
const HORUS_HOME = path.join(os.homedir(), '.horus');

/** Caminho do .env global (nunca salvo em repo local) */
const GLOBAL_ENV_PATH = path.join(HORUS_HOME, '.env');

/** Provedores suportados com metadados de orientação */
const PROVIDERS = [
  {
    value: 'gemini',
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    url: 'https://aistudio.google.com/apikey',
    hint: 'Gratuito até 2M tokens/min',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'google/gemini-2.5-flash',
    url: 'https://openrouter.ai/keys',
    hint: 'Acesso a 200+ modelos, pague por uso',
  },
  {
    value: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    url: 'https://console.groq.com/keys',
    hint: 'Inferência ultra-rápida, free tier generoso',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    url: 'https://platform.openai.com/api-keys',
    hint: 'GPT-4o, o1, etc.',
  },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-20250514',
    url: 'https://console.anthropic.com/settings/keys',
    hint: 'Claude 3.5 Sonnet, Opus, etc.',
  },
  {
    value: 'ollama',
    label: 'Ollama (Local)',
    envKey: 'OLLAMA_MODEL',
    defaultModel: 'llama3',
    url: 'https://ollama.com/library',
    hint: '100% offline, sem API Key',
  },
] as const;

type ProviderValue = typeof PROVIDERS[number]['value'];

// ─── Handler Principal ────────────────────────────────────────────────────────

export async function handleAiConfig(): Promise<void> {
  // 1. Nota informativa sobre provedores e onde obter chaves
  const providerGuide = PROVIDERS
    .map((p) => `  ${theme.success('●')} ${theme.white(p.label.padEnd(22))} ${theme.muted('→')} ${theme.accent(p.url)}`)
    .join('\n');

  clack.note(
    `${theme.white('Onde obter sua API Key:')}\n\n` +
    providerGuide + '\n\n' +
    `${theme.muted('💡 Dica: O Ollama roda 100% local e não precisa de API Key.')}\n` +
    `${theme.muted('🔒 Sua chave será salva em')} ${theme.accent('~/.horus/.env')} ${theme.muted('(fora do Git).')}`,
    theme.primary('⚙️  Configuração de Provedor de IA')
  );

  // 2. Selecionar provedor
  const selectedProvider = await clack.select({
    message: theme.primary('Qual provedor deseja configurar?'),
    options: PROVIDERS.map((p) => ({
      value: p.value,
      label: `${p.label}`,
      hint: p.hint,
    })),
  });

  if (wasCancelled(selectedProvider)) {
    clack.log.info(theme.muted('Configuração cancelada.'));
    return;
  }

  const provider = PROVIDERS.find((p) => p.value === selectedProvider)!;
  const isOllama = provider.value === 'ollama';

  // 3. Coletar modelo e API Key via p.group()
  const config = await clack.group(
    {
      modelName: () =>
        clack.text({
          message: theme.white(`Nome do modelo para ${provider.label}:`),
          placeholder: provider.defaultModel,
          defaultValue: provider.defaultModel,
          validate: (v) => {
            if (!v.trim()) return 'O nome do modelo não pode ser vazio.';
          },
        }),

      apiKey: () => {
        if (isOllama) {
          // Ollama não precisa de chave API
          return Promise.resolve('__ollama_local__');
        }
        return clack.password({
          message: theme.white(`API Key para ${provider.label}:`),
          validate: (v) => {
            if (!v || v.trim().length < 8) return 'A chave deve ter no mínimo 8 caracteres.';
          },
        });
      },
    },
    {
      onCancel: () => {
        clack.log.info(theme.muted('Configuração cancelada.'));
      },
    },
  );

  // Segurança: se cancelado internamente, config pode ser symbol
  if (!config || wasCancelled(config.modelName) || wasCancelled(config.apiKey)) {
    clack.log.info(theme.muted('Configuração cancelada.'));
    return;
  }

  const modelName = (config.modelName as string).trim();
  const apiKey = (config.apiKey as string).trim();

  // 4. Persistir no ~/.horus/.env (GLOBAL)
  const s = clack.spinner();
  s.start(theme.muted('Salvando configuração segura...'));

  try {
    // Garante que ~/.horus existe
    if (!fs.existsSync(HORUS_HOME)) {
      fs.mkdirSync(HORUS_HOME, { recursive: true });
    }

    // Lê .env existente ou cria novo
    let envContent = '';
    if (fs.existsSync(GLOBAL_ENV_PATH)) {
      envContent = fs.readFileSync(GLOBAL_ENV_PATH, 'utf-8');
    }

    // Atualiza ou adiciona variáveis (upsert line-by-line)
    envContent = upsertEnvVar(envContent, 'HORUS_AI_PROVIDER', provider.value);
    envContent = upsertEnvVar(envContent, 'HORUS_AI_MODEL', modelName);

    if (!isOllama) {
      envContent = upsertEnvVar(envContent, provider.envKey, apiKey);
    } else {
      envContent = upsertEnvVar(envContent, 'OLLAMA_MODEL', modelName);
    }

    // Escrita atômica: .tmp → rename
    const tmpPath = GLOBAL_ENV_PATH + '.tmp';
    fs.writeFileSync(tmpPath, envContent, 'utf-8');
    fs.renameSync(tmpPath, GLOBAL_ENV_PATH);

    s.stop(theme.success('✔ Configuração salva com sucesso!'));

    // 5. Feedback visual
    console.log();
    clack.log.success(theme.white('Resumo da configuração:'));
    console.log(`  ${theme.muted('│')}  ${theme.muted('Provedor:')}   ${theme.accent(provider.label)}`);
    console.log(`  ${theme.muted('│')}  ${theme.muted('Modelo:')}     ${theme.accent(modelName)}`);
    console.log(`  ${theme.muted('│')}  ${theme.muted('Chave:')}      ${isOllama ? theme.muted('(local — sem chave)') : theme.success('●●●●●●●●' + apiKey.slice(-4))}`);
    console.log(`  ${theme.muted('│')}  ${theme.muted('Salvo em:')}   ${theme.accent(GLOBAL_ENV_PATH)}`);
    console.log();

    clack.log.info(
      theme.muted('Execute ') +
      theme.accent('hrs init --ai') +
      theme.muted(' para gerar seu horus.json com IA!')
    );

  } catch (err) {
    s.stop(theme.error('✗ Falha ao salvar configuração.'));
    clack.log.error(theme.error(`Erro: ${String(err)}`));
  }
}

// ─── Utilitários de .env ──────────────────────────────────────────────────────

/**
 * Insere ou atualiza uma variável no conteúdo do .env.
 * Não utiliza bibliotecas externas — parsing manual line-by-line.
 */
function upsertEnvVar(content: string, key: string, value: string): string {
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
    // Adiciona ao final, garantindo uma linha vazia antes se necessário
    const trimmed = updated.filter((l) => l.trim() !== '' || updated.indexOf(l) < updated.length - 1);
    trimmed.push(newLine);
    return trimmed.join('\n') + '\n';
  }

  return updated.join('\n');
}

// ─── Loader do .env Global ────────────────────────────────────────────────────

/**
 * Carrega as variáveis do ~/.horus/.env para process.env.
 * Chamado no boot do Horus. Silencioso se o arquivo não existir.
 */
export function loadGlobalEnv(): void {
  if (fs.existsSync(GLOBAL_ENV_PATH)) {
    try {
      const content = fs.readFileSync(GLOBAL_ENV_PATH, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();

        // Não sobrescreve se já estiver definida (prioridade: env do SO > .env global)
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    } catch { /* Silencioso */ }
  }
}
