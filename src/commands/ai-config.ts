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

// ─── Handler Principal (Loop Visual com Status) ──────────────────────────────

export async function handleAiConfig(): Promise<void> {
  // Nota informativa inicial (exibida uma vez)
  const providerGuide = PROVIDERS
    .map((p) => `  ${theme.accent('●')} ${theme.white(p.label.padEnd(22))} ${theme.muted('→')} ${theme.accent(p.url)}`)
    .join('\n');

  clack.note(
    `${theme.white('Onde obter sua API Key:')}\n\n` +
    providerGuide + '\n\n' +
    `${theme.muted('💡 Dica: O Ollama roda 100% local e não precisa de API Key.')}\n` +
    `${theme.muted('🔒 Suas chaves serão salvas em')} ${theme.accent('~/.horus/.env')} ${theme.muted('(fora do Git).')}`,
    theme.primary('⚙️  Configuração de Provedores de IA')
  );

  // Set local para rastrear quais provedores foram configurados NESTA sessão
  const configuredThisSession = new Set<string>();

  // ─── Loop de configuração ─────────────────────────────────────────────
  while (true) {
    // Lê o .env global para verificar quais já possuem chave
    const existingEnv = readGlobalEnvMap();

    // Monta opções do select com status visual (verde/vermelho)
    const providerOptions = PROVIDERS.map((p) => {
      const hasKey = isProviderConfigured(p, existingEnv);
      const statusIcon = hasKey ? theme.success('✔') : theme.error('✗');
      const statusHint = hasKey
        ? theme.success('Configurado') + (configuredThisSession.has(p.value) ? theme.muted(' (agora)') : '')
        : theme.error('Pendente') + theme.muted(` — ${p.hint}`);

      return {
        value: p.value,
        label: `${statusIcon}  ${hasKey ? theme.success(p.label) : theme.error(p.label)}`,
        hint: statusHint,
      };
    });

    // Adiciona opção de voltar ao final
    const allOptions = [
      ...providerOptions,
      {
        value: '__back__' as string,
        label: `${theme.muted('←')}  Voltar ao menu`,
        hint: theme.muted('Finalizar configuração'),
      },
    ];

    const selectedProvider = await clack.select({
      message: theme.primary('Selecione um provedor para configurar:'),
      options: allOptions,
    });

    if (wasCancelled(selectedProvider) || selectedProvider === '__back__') {
      // Resumo final antes de sair
      const totalConfigured = PROVIDERS.filter((p) => isProviderConfigured(p, readGlobalEnvMap())).length;
      if (totalConfigured > 0) {
        clack.log.success(
          theme.success(`${totalConfigured}/${PROVIDERS.length}`) +
          theme.white(' provedores configurados. ') +
          theme.muted('Execute ') + theme.accent('hrs init --ai') + theme.muted(' para usar!')
        );
      } else {
        clack.log.info(theme.muted('Nenhum provedor configurado.'));
      }
      return;
    }

    // ── Configurar o provedor selecionado ────────────────────────────────
    const provider = PROVIDERS.find((p) => p.value === selectedProvider)!;
    const isOllama = provider.value === 'ollama';

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
          clack.log.info(theme.muted('Configuração deste provedor cancelada.'));
        },
      },
    );

    // Se cancelou o group, volta ao loop (não sai do wizard)
    if (!config || wasCancelled(config.modelName) || wasCancelled(config.apiKey)) {
      continue;
    }

    const modelName = (config.modelName as string).trim();
    const apiKey = (config.apiKey as string).trim();

    // ── Persistir no ~/.horus/.env ──────────────────────────────────────
    const s = clack.spinner();
    s.start(theme.muted(`Salvando ${provider.label}...`));

    try {
      if (!fs.existsSync(HORUS_HOME)) {
        fs.mkdirSync(HORUS_HOME, { recursive: true });
      }

      let envContent = '';
      if (fs.existsSync(GLOBAL_ENV_PATH)) {
        envContent = fs.readFileSync(GLOBAL_ENV_PATH, 'utf-8');
      }

      if (!isOllama) {
        envContent = upsertEnvVar(envContent, provider.envKey, apiKey);
      } else {
        envContent = upsertEnvVar(envContent, 'OLLAMA_MODEL', modelName);
      }

      // Escrita atômica
      const tmpPath = GLOBAL_ENV_PATH + '.tmp';
      fs.writeFileSync(tmpPath, envContent, 'utf-8');
      fs.renameSync(tmpPath, GLOBAL_ENV_PATH);

      // Atualiza process.env para que o motor de IA já enxergue a chave
      if (!isOllama) {
        process.env[provider.envKey] = apiKey;
      } else {
        process.env['OLLAMA_MODEL'] = modelName;
      }

      configuredThisSession.add(provider.value);

      s.stop(theme.success(`✔ ${provider.label} configurado!`));

      // Feedback inline compacto
      console.log(`  ${theme.muted('│')}  ${theme.muted('Modelo:')} ${theme.accent(modelName)}  ${theme.muted('Chave:')} ${isOllama ? theme.muted('(local)') : theme.success('●●●●' + apiKey.slice(-4))}`);
      console.log();

    } catch (err) {
      s.stop(theme.error(`✗ Falha ao salvar ${provider.label}.`));
      clack.log.error(theme.error(`Erro: ${String(err)}`));
    }

    // Loop continua — volta ao menu de provedores automaticamente
  }
}

// ─── Helpers de Status ────────────────────────────────────────────────────────

/** Lê o .env global e retorna um Map<chave, valor> */
function readGlobalEnvMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(GLOBAL_ENV_PATH)) return map;

  try {
    const content = fs.readFileSync(GLOBAL_ENV_PATH, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (val) map.set(key, val);
    }
  } catch { /* silencioso */ }
  return map;
}

/** Verifica se um provedor já possui chave configurada */
function isProviderConfigured(
  provider: typeof PROVIDERS[number],
  envMap: Map<string, string>,
): boolean {
  if (provider.value === 'ollama') {
    // Ollama: basta o modelo estar definido ou ollama estar rodando
    return envMap.has('OLLAMA_MODEL') || !!process.env['OLLAMA_MODEL'];
  }
  // Provedores de API: verifica se a envKey tem valor
  return envMap.has(provider.envKey) || !!process.env[provider.envKey];
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
