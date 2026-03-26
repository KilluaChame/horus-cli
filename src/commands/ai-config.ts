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

/** Provedores suportados com catálogo de modelos e documentação */
const PROVIDERS = [
  {
    value: 'gemini',
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    modelEnvKey: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    modelsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    hint: 'Gratuito até 2M tokens/min',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    modelEnvKey: 'OPENROUTER_MODEL',
    defaultModel: 'google/gemini-2.5-flash',
    keyUrl: 'https://openrouter.ai/keys',
    modelsUrl: 'https://openrouter.ai/models',
    hint: 'Acesso a 200+ modelos, pague por uso',
    models: ['google/gemini-2.5-flash', 'anthropic/claude-sonnet-4', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b'],
  },
  {
    value: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    modelEnvKey: 'GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    modelsUrl: 'https://console.groq.com/docs/models',
    hint: 'Inferência ultra-rápida, free tier generoso',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it', 'mixtral-8x7b-32768'],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    modelEnvKey: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    modelsUrl: 'https://platform.openai.com/docs/models',
    hint: 'GPT-4o, o1, etc.',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'o4-mini'],
  },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    envKey: 'ANTHROPIC_API_KEY',
    modelEnvKey: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-20250514',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    modelsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    hint: 'Claude Sonnet, Opus, Haiku',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  {
    value: 'ollama',
    label: 'Ollama (Local)',
    envKey: 'OLLAMA_MODEL',
    modelEnvKey: 'OLLAMA_MODEL',
    defaultModel: 'llama3',
    keyUrl: 'https://ollama.com/download',
    modelsUrl: 'https://ollama.com/library',
    hint: '100% offline, sem API Key',
    models: ['llama3', 'llama3.1', 'codellama', 'mistral', 'gemma2', 'phi3'],
  },
] as const;

type ProviderValue = typeof PROVIDERS[number]['value'];

// ─── Handler Principal (Loop Visual com Status + Catálogo de Modelos) ─────────

export async function handleAiConfig(): Promise<void> {
  // Nota informativa inicial (exibida uma vez)
  const providerGuide = PROVIDERS
    .map((p) => `  ${theme.accent('●')} ${theme.white(p.label.padEnd(22))} ${theme.muted('→')} ${theme.accent(p.keyUrl)}`)
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

      // Mostra modelo ativo se configurado
      const activeModel = existingEnv.get(p.modelEnvKey) || '';
      const modelBadge = hasKey && activeModel ? theme.muted(` [${activeModel}]`) : '';

      const statusHint = hasKey
        ? theme.success('Configurado') + modelBadge + (configuredThisSession.has(p.value) ? theme.muted(' (agora)') : '')
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
      const finalEnv = readGlobalEnvMap();
      const totalConfigured = PROVIDERS.filter((p) => isProviderConfigured(p, finalEnv)).length;
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

    // 1. Sub-menu de seleção de modelo
    const modelOptions = [
      ...provider.models.map((m) => ({
        value: m as string,
        label: m === provider.defaultModel ? `${theme.success(m)}` : `${m}`,
        hint: m === provider.defaultModel ? theme.muted('(recomendado)') : '',
      })),
      {
        value: '__custom__',
        label: `${theme.accent('✎')}  Digitar manualmente`,
        hint: theme.muted('Usar um modelo não listado'),
      },
    ];

    const modelChoice = await clack.select({
      message: theme.white(`Modelo para ${provider.label}:`),
      options: modelOptions,
    });

    if (wasCancelled(modelChoice)) continue;

    let modelName: string;

    if (modelChoice === '__custom__') {
      // Nota com link de documentação para ajudar o dev a encontrar o nome certo
      clack.log.info(
        theme.muted('📚 Consulte os modelos disponíveis em: ') +
        theme.accent(provider.modelsUrl)
      );

      const customModel = await clack.text({
        message: theme.white(`Nome do modelo (${provider.label}):`),
        placeholder: provider.defaultModel,
        validate: (v) => {
          if (!v.trim()) return 'O nome do modelo não pode ser vazio.';
        },
      });

      if (wasCancelled(customModel)) continue;
      modelName = (customModel as string).trim();
    } else {
      modelName = modelChoice as string;
    }

    // 2. API Key (skip para Ollama)
    let apiKey = '';

    if (!isOllama) {
      clack.log.info(
        theme.muted('🔑 Obtenha sua chave em: ') +
        theme.accent(provider.keyUrl)
      );

      const keyInput = await clack.password({
        message: theme.white(`API Key para ${provider.label}:`),
        validate: (v) => {
          if (!v || v.trim().length < 8) return 'A chave deve ter no mínimo 8 caracteres.';
        },
      });

      if (wasCancelled(keyInput)) continue;
      apiKey = (keyInput as string).trim();
    }

    // 3. Persistir no ~/.horus/.env
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

      // Salva modelo
      envContent = upsertEnvVar(envContent, provider.modelEnvKey, modelName);

      // Salva chave (exceto Ollama)
      if (!isOllama) {
        envContent = upsertEnvVar(envContent, provider.envKey, apiKey);
      }

      // Escrita atômica
      const tmpPath = GLOBAL_ENV_PATH + '.tmp';
      fs.writeFileSync(tmpPath, envContent, 'utf-8');
      fs.renameSync(tmpPath, GLOBAL_ENV_PATH);

      // Atualiza process.env em tempo real
      process.env[provider.modelEnvKey] = modelName;
      if (!isOllama) {
        process.env[provider.envKey] = apiKey;
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
