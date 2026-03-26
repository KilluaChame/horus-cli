/**
 * ai-config.ts — Configuração de Provedor de IA (BYOK — Bring Your Own Key)
 *
 * Responsabilidades:
 *   1. Orientar o usuário sobre onde obter API Keys dos provedores suportados.
 *   2. Coletar modelo e chave de forma segura (password masking).
 *   3. Validar chaves via ping mínimo ao endpoint do provedor (Health Check).
 *   4. Persistir em ~/.horus/.env (GLOBAL — nunca no diretório local do projeto).
 *   5. Carregar variáveis sob demanda via parser manual.
 *
 * ⚡ Performance (RNF2):
 *   - Este módulo é lazy-loaded: importado apenas quando o usuário acessa
 *     "⚙️ Configuração do horus" no menu raiz.
 *   - Validação de chaves usa fetch() nativo do Node 18+ (zero deps externas).
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

// ─── Tipos de Status ──────────────────────────────────────────────────────────

type ProviderStatus = 'pending' | 'valid' | 'invalid';

interface ProviderState {
  status: ProviderStatus;
  errorMsg?: string; // ex: "Chave expirada", "401 Unauthorized"
}

// ─── Catálogo de Provedores ───────────────────────────────────────────────────

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

type ProviderDef = typeof PROVIDERS[number];

// ─── Validação Ativa (Health Check via fetch nativo) ─────────────────────────

/**
 * Realiza um ping mínimo ao endpoint do provedor para validar a chave.
 * Usa fetch() nativo do Node 18+ — zero dependências externas.
 * Timeout de 6s via AbortController para não travar o CLI.
 */
async function validateApiKey(provider: ProviderDef, apiKey: string): Promise<ProviderState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    let url: string;
    let options: RequestInit;

    switch (provider.value) {
      case 'gemini': {
        // Endpoint leve: lista modelos
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`;
        options = { method: 'GET', signal: controller.signal };
        break;
      }
      case 'openrouter': {
        url = 'https://openrouter.ai/api/v1/models';
        options = {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: controller.signal,
        };
        break;
      }
      case 'groq': {
        url = 'https://api.groq.com/openai/v1/models';
        options = {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: controller.signal,
        };
        break;
      }
      case 'openai': {
        url = 'https://api.openai.com/v1/models?limit=1';
        options = {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: controller.signal,
        };
        break;
      }
      case 'anthropic': {
        url = 'https://api.anthropic.com/v1/models';
        options = {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal: controller.signal,
        };
        break;
      }
      case 'ollama': {
        // Ollama local: basta bater no /api/tags
        url = 'http://localhost:11434/api/tags';
        options = { method: 'GET', signal: controller.signal };
        break;
      }
      default:
        return { status: 'valid' }; // fallback seguro
    }

    const res = await fetch(url, options);

    if (res.ok || res.status === 200) {
      return { status: 'valid' };
    }

    if (res.status === 401) {
      return { status: 'invalid', errorMsg: 'Chave inválida (401)' };
    }
    if (res.status === 403) {
      return { status: 'invalid', errorMsg: 'Acesso negado (403)' };
    }
    if (res.status === 429) {
      // Rate limit não significa chave inválida, significa que funciona
      return { status: 'valid' };
    }

    return { status: 'invalid', errorMsg: `Erro HTTP ${res.status}` };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('abort') || msg.includes('AbortError')) {
      return { status: 'invalid', errorMsg: 'Timeout (sem resposta)' };
    }
    if (msg.includes('ECONNREFUSED')) {
      if (provider.value === 'ollama') {
        return { status: 'invalid', errorMsg: 'Ollama não está rodando' };
      }
      return { status: 'invalid', errorMsg: 'Conexão recusada' };
    }
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      return { status: 'invalid', errorMsg: 'Sem conexão de rede' };
    }

    return { status: 'invalid', errorMsg: msg.slice(0, 40) };

  } finally {
    clearTimeout(timeout);
  }
}

// ─── Handler Principal ───────────────────────────────────────────────────────

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

  // Cache de status validado nesta sessão (evita re-ping a cada loop)
  const statusCache = new Map<string, ProviderState>();

  // ─── Loop de configuração ─────────────────────────────────────────────
  while (true) {
    const existingEnv = readGlobalEnvMap();

    // Monta opções do select com status tri-estágio
    const providerOptions = PROVIDERS.map((p) => {
      const hasKey = hasProviderKey(p, existingEnv);
      const activeModel = existingEnv.get(p.modelEnvKey) || '';

      // Determina estado visual
      let state: ProviderState = { status: 'pending' };

      if (hasKey) {
        // Usa cache de validação se disponível, senão marca como "valid" (otimista)
        state = statusCache.get(p.value) ?? { status: 'valid' };
      }

      // Renderiza badge
      let statusIcon: string;
      let labelText: string;
      let hintText: string;

      switch (state.status) {
        case 'valid': {
          statusIcon = theme.success('✔');
          labelText = theme.success(p.label);
          const modelBadge = activeModel ? theme.muted(` [${activeModel}]`) : '';
          hintText = theme.success('Ativo') + modelBadge;
          break;
        }
        case 'invalid': {
          statusIcon = theme.error('✗');
          labelText = theme.warn(p.label);
          hintText = theme.error(state.errorMsg ?? 'Chave inválida');
          break;
        }
        default: {
          statusIcon = theme.error('✗');
          labelText = theme.error(p.label);
          hintText = theme.error('Pendente') + theme.muted(` — ${p.hint}`);
          break;
        }
      }

      return {
        value: p.value,
        label: `${statusIcon}  ${labelText}`,
        hint: hintText,
      };
    });

    // Opções de controle
    const allOptions = [
      ...providerOptions,
      {
        value: '__retest__' as string,
        label: `${theme.accent('⟳')}  Retestar todas as chaves`,
        hint: theme.muted('Valida as chaves salvas contra os provedores'),
      },
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
      const finalEnv = readGlobalEnvMap();
      const totalConfigured = PROVIDERS.filter((p) => hasProviderKey(p, finalEnv)).length;
      const totalValid = [...statusCache.values()].filter((s) => s.status === 'valid').length;

      if (totalConfigured > 0) {
        const validLabel = totalValid > 0
          ? theme.success(`${totalValid} validados`)
          : theme.muted('não testados');
        clack.log.success(
          theme.success(`${totalConfigured}/${PROVIDERS.length}`) +
          theme.white(' provedores configurados ') +
          theme.muted('(') + validLabel + theme.muted(') — ') +
          theme.accent('hrs init --ai') + theme.muted(' para usar!')
        );
      } else {
        clack.log.info(theme.muted('Nenhum provedor configurado.'));
      }
      return;
    }

    // ── Retestar todas as chaves ─────────────────────────────────────────
    if (selectedProvider === '__retest__') {
      const s = clack.spinner();
      s.start(theme.muted('Validando chaves contra os provedores...'));

      const envMap = readGlobalEnvMap();
      let validCount = 0;
      let invalidCount = 0;

      for (const p of PROVIDERS) {
        if (!hasProviderKey(p, envMap)) continue;

        const keyValue = p.value === 'ollama' ? 'local' : (envMap.get(p.envKey) || process.env[p.envKey] || '');
        const result = await validateApiKey(p, keyValue);
        statusCache.set(p.value, result);

        if (result.status === 'valid') validCount++;
        else invalidCount++;
      }

      s.stop(
        theme.success(`✔ ${validCount} válidos`) +
        (invalidCount > 0 ? theme.error(` · ✗ ${invalidCount} com erro`) : '') +
        theme.muted(' — veja o status abaixo')
      );
      continue;
    }

    // ── Configurar o provedor selecionado ────────────────────────────────
    const provider = PROVIDERS.find((p) => p.value === selectedProvider)!;
    const isOllama = provider.value === 'ollama';

    // Passo 1: API Key (skip para Ollama)
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

      // Health Check imediato após inserção
      const validationSpinner = clack.spinner();
      validationSpinner.start(theme.muted(`Validando chave para ${provider.label}...`));

      const result = await validateApiKey(provider, apiKey);
      statusCache.set(provider.value, result);

      if (result.status === 'invalid') {
        validationSpinner.stop(theme.error(`✗ ${result.errorMsg ?? 'Chave inválida'}`));

        const proceed = await clack.confirm({
          message: theme.warn('A chave não passou no teste. Deseja salvar mesmo assim?'),
          initialValue: false,
        });

        if (wasCancelled(proceed) || !proceed) continue;
      } else {
        validationSpinner.stop(theme.success('✔ Chave válida!'));
      }
    } else {
      // Ollama: testa se o serviço está rodando
      const ollamaSpinner = clack.spinner();
      ollamaSpinner.start(theme.muted('Verificando serviço Ollama local...'));

      const result = await validateApiKey(provider, '');
      statusCache.set(provider.value, result);

      if (result.status === 'invalid') {
        ollamaSpinner.stop(theme.warn(`⚠ ${result.errorMsg}`));
        clack.log.warn(theme.muted('O Ollama pode não estar rodando. Instale em: ') + theme.accent(provider.keyUrl));
      } else {
        ollamaSpinner.stop(theme.success('✔ Ollama está rodando!'));
      }
    }

    // Passo 2: Seleção de modelo
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

    // Passo 3: Nota de referência com link de documentação
    clack.log.info(
      theme.muted('📖 Referência de modelos: ') +
      theme.accent(provider.modelsUrl)
    );

    // Passo 4: Persistir no ~/.horus/.env
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

      s.stop(theme.success(`✔ ${provider.label} salvo!`));

      // Feedback inline compacto
      const keyDisplay = isOllama
        ? theme.muted('(local)')
        : theme.success('●●●●' + apiKey.slice(-4));
      const statusDisplay = statusCache.get(provider.value)?.status === 'valid'
        ? theme.success(' ✔ Validado')
        : theme.warn(' ⚠ Não testado');

      console.log(`  ${theme.muted('│')}  ${theme.muted('Modelo:')} ${theme.accent(modelName)}  ${theme.muted('Chave:')} ${keyDisplay}${statusDisplay}`);
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
      // String vazia = chave inexistente (Zod-like strictness)
      if (val && val.length > 0) map.set(key, val);
    }
  } catch { /* silencioso */ }
  return map;
}

/** Verifica se um provedor possui chave API presente (não vazia) */
function hasProviderKey(
  provider: ProviderDef,
  envMap: Map<string, string>,
): boolean {
  if (provider.value === 'ollama') {
    return envMap.has('OLLAMA_MODEL') || !!process.env['OLLAMA_MODEL'];
  }
  const fromEnv = envMap.get(provider.envKey) || process.env[provider.envKey] || '';
  return fromEnv.length >= 8; // chaves reais sempre têm 8+ caracteres
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
        if (!process.env[key] && val.length > 0) {
          process.env[key] = val;
        }
      }
    } catch { /* Silencioso */ }
  }
}
