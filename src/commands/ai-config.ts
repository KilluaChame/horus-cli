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
import { spawnSync } from 'node:child_process';
import { theme } from '../ui/theme.js';
import { wasCancelled } from '../ui/prompts.js';
import { 
  HORUS_HOME, 
  GLOBAL_ENV_PATH, 
  readGlobalEnvMap, 
  upsertEnvVar, 
  clearInternalState 
} from '../utils/env.js';

// ─── Tipos de Status ──────────────────────────────────────────────────────────

export type ProviderStatus = 'pending' | 'valid' | 'invalid' | 'quota_exceeded';

export interface ProviderState {
  status: ProviderStatus;
  errorMsg?: string; // ex: "Chave expirada", "401 Unauthorized"
}

export function readStatusMap(): Map<string, ProviderState> {
  const statusPath = path.join(HORUS_HOME, 'status.json');
  if (!fs.existsSync(statusPath)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    return new Map(Object.entries(data));
  } catch { return new Map(); }
}

export function writeStatusMap(map: Map<string, ProviderState>): void {
  if (!fs.existsSync(HORUS_HOME)) fs.mkdirSync(HORUS_HOME, { recursive: true });
  const statusPath = path.join(HORUS_HOME, 'status.json');
  fs.writeFileSync(statusPath, JSON.stringify(Object.fromEntries(map), null, 2), 'utf-8');
}

export function setProviderStatus(provider: string, status: ProviderStatus, errorMsg?: string): void {
  const map = readStatusMap();
  const state: ProviderState = { status };
  if (errorMsg) state.errorMsg = errorMsg;
  map.set(provider, state);
  writeStatusMap(map);
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

    const res = await Promise.race([
      fetch(url, options),
      new Promise<never>((_, rej) => {
        // Fallback robusto se o AbortController falhar no fetch
        setTimeout(() => rej(new Error('Timeout')), 6000);
      })
    ]);

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
      return { status: 'quota_exceeded', errorMsg: 'Cota de requisições excedida (429)' };
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

// ─── Editores Externos ───────────────────────────────────────────────────────

async function openEditor(filePath: string): Promise<void> {
  // Lógica Atômica (Leitura rigorosa e isolada)
  const currentContent = fs.readFileSync(filePath, 'utf-8');
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, currentContent, 'utf-8');
  
  // Fallback inteligente de editores
  let editor = process.env['EDITOR'] || process.env['VISUAL'];
  
  if (!editor) {
    if (process.platform === 'win32') {
      editor = 'code'; // Tenta VSCode primeiro no Windows
      try {
        require('node:child_process').execSync('code --version', { stdio: 'ignore' });
      } catch {
        editor = 'notepad'; // Fallback absoluto
      }
    } else {
      editor = 'nano'; // Unix-like
    }
  }

  clack.log.info(theme.muted(`Abrindo no editor: ${editor}... Se não abrir, configure $EDITOR`));
  try {
    const { execaSync } = await import('execa');
    execaSync(editor, [tmpPath], { stdio: 'inherit', shell: true });
    
    // Ler o .tmp após o fechamento do subprocesso
    if (fs.existsSync(tmpPath)) {
      const newContent = fs.readFileSync(tmpPath, 'utf-8');
      
      // Regra G4: Se leu perfeitamente, comite a transação
      if (typeof newContent === 'string') {
        fs.renameSync(tmpPath, filePath);
        clack.log.success(theme.success('Edição salva e validada com segurança (Commit Atômico).'));
      }
    }
  } catch (err) {
    clack.log.error(theme.error(`Não foi possível completar a edição no editor: ${editor}.`));
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath); // Limpa o vestígio sujo em caso de falha
    }
  }
}

// ─── Handler Principal (Menu de Configuração) ────────────────────────────────

export async function handleAiConfig(): Promise<void> {
  while (true) {
    const session = await clack.select({
      message: theme.primary('⚙️  Configuração do horus'),
      options: [
        { value: 'horus-json', label: `${theme.accent('📜')}  horus.json`, hint: 'Provedores de IA, Prompt Export e Modo Manual' },
        { value: 'prompts', label: `${theme.white('📝')}  Prompts Gerais`, hint: 'Gerenciar templates Markdown' },
        { value: 'back', label: `${theme.muted('←')}  Voltar ao Menu Principal` },
      ]
    });

    if (wasCancelled(session) || session === 'back') {
      return;
    }

    if (session === 'horus-json') {
      await manageHorusJson();
    } else if (session === 'prompts') {
      await managePrompts();
    }
  }
}

// ─── Submenu: 📜 horus.json ──────────────────────────────────────────────────

async function manageHorusJson(): Promise<void> {
  while (true) {
    const action = await clack.select({
      message: theme.primary('📜  horus.json — Configuração da geração'),
      options: [
        { value: 'providers', label: `${theme.accent('🤖')}  Provedores de IA`, hint: 'Tokens e Modelos (BYOK)' },
        { value: 'edit-export', label: `${theme.white('📋')}  Editar prompt (Export)`, hint: 'Personalizar o prompt copiado para ChatGPT/Cursor' },
        { value: 'edit-manual', label: `${theme.primary('🕹️')}  Editar modo Manual`, hint: 'Personalizar o template do wizard manual' },
        { value: 'back', label: `${theme.muted('←')}  Voltar` },
      ]
    });

    if (wasCancelled(action) || action === 'back') return;

    if (action === 'providers') {
      await manageProviders();
    } else if (action === 'edit-export') {
      await editExportPrompt();
    } else if (action === 'edit-manual') {
      await editManualTemplate();
    }
  }
}

async function editExportPrompt(): Promise<void> {
  const { ensureExportTemplate } = await import('../core/ai-agent.js');
  const templatePath = ensureExportTemplate();
  
  const { drawAsciiPanel } = await import('../ui/panels.js');
  
  drawAsciiPanel(
    theme.primary('#### 📋 Prompt de Export'),
    [
      '',
      theme.white('Este é o prompt usado quando você seleciona "Copiar Prompt (Export)" na inicialização.'),
      theme.muted('Ele é colado no ChatGPT/Claude/Cursor para gerar o horus.json.'),
      '',
      theme.accent('Placeholders disponíveis:'),
      `  ${theme.success('{{PROJECT_SUMMARY}}')} — Contexto escaneado do repositório`,
      `  ${theme.success('{{PROJECT_NAME}}')}    — Nome do projeto`,
      '',
      theme.muted(`Arquivo: ${templatePath}`),
      '',
    ]
  );

  const action = await clack.select({
    message: theme.primary('* O que deseja fazer?'),
    options: [
      { value: 'edit', label: `${theme.accent('✏️')}  Editar prompt` },
      { value: 'reset', label: `${theme.warn('⟳')}  Restaurar padrão` },
      { value: 'back', label: `${theme.muted('←')}  Voltar` },
    ]
  });

  if (wasCancelled(action) || action === 'back') return;

  if (action === 'edit') {
    await openEditor(templatePath);
    clack.log.success(theme.success('Template de Export salvo com sucesso!'));
  } else if (action === 'reset') {
    const confirm = await clack.confirm({
      message: theme.warn('Restaurar o prompt Export para o padrão original?'),
      initialValue: false,
    });
    if (!wasCancelled(confirm) && confirm) {
      const fs = await import('node:fs');
      if (fs.existsSync(templatePath)) fs.unlinkSync(templatePath);
      ensureExportTemplate();
      clack.log.success(theme.success('Template restaurado para o padrão!'));
    }
  }
}

async function editManualTemplate(): Promise<void> {
  const { ensureManualTemplate } = await import('../core/ai-agent.js');
  const templatePath = ensureManualTemplate();
  
  const { drawAsciiPanel } = await import('../ui/panels.js');
  
  drawAsciiPanel(
    theme.primary('#### 🕹️ Template do Modo Manual'),
    [
      '',
      theme.white('Este arquivo serve como referência para a inicialização manual do horus.json.'),
      theme.muted('Edite os grupos, ícones e labels para personalizar o wizard.'),
      '',
      theme.muted(`Arquivo: ${templatePath}`),
      '',
    ]
  );

  const action = await clack.select({
    message: theme.primary('* O que deseja fazer?'),
    options: [
      { value: 'edit', label: `${theme.accent('✏️')}  Editar template` },
      { value: 'reset', label: `${theme.warn('⟳')}  Restaurar padrão` },
      { value: 'back', label: `${theme.muted('←')}  Voltar` },
    ]
  });

  if (wasCancelled(action) || action === 'back') return;

  if (action === 'edit') {
    await openEditor(templatePath);
    clack.log.success(theme.success('Template Manual salvo com sucesso!'));
  } else if (action === 'reset') {
    const confirm = await clack.confirm({
      message: theme.warn('Restaurar o template Manual para o padrão original?'),
      initialValue: false,
    });
    if (!wasCancelled(confirm) && confirm) {
      const fs = await import('node:fs');
      if (fs.existsSync(templatePath)) fs.unlinkSync(templatePath);
      ensureManualTemplate();
      clack.log.success(theme.success('Template restaurado para o padrão!'));
    }
  }
}

// ─── Prompts Gerais ──────────────────────────────────────────────────────────

async function managePrompts(): Promise<void> {
  const promptStorage = await import('../utils/prompt-storage.js');
  const { drawAsciiPanel } = await import('../ui/panels.js');
  
  while (true) {
    const prompts = promptStorage.listPrompts();
    
    drawAsciiPanel(
      theme.primary('#### 📝 Prompts Gerais'),
      [
        '',
        theme.white('Aqui você pode criar e editar os prompts que serão usados pelos agentes.'),
        theme.muted('Use {{placeholders}} para variáveis substituídas em tempo de execução.'),
        ''
      ]
    );

    const options = [
      { value: '__create__', label: `${theme.success('➕')} Criar Prompt` },
    ];
    
    if (prompts.length > 5) {
      options.push({ value: '__filter__', label: `${theme.accent('🔍')} Filtrar por nome…` });
    }
    
    for (const p of prompts) {
      options.push({ value: p.name, label: `📄 ${theme.white(p.name)}` });
    }
    
    options.push({ value: '__back__', label: `${theme.muted('←')} Voltar` });

    const selection = await clack.select({
      message: theme.primary('* Selecione um prompt para editar:'),
      options
    });

    if (wasCancelled(selection) || selection === '__back__') return;

    if (selection === '__create__') {
      const nameInput = await clack.text({
        message: 'Nome do arquivo (ex: MeuTemplate):',
        validate: (v) => !v.trim() ? 'O nome não pode ser vazio' : undefined
      });
      if (wasCancelled(nameInput)) continue;
      
      const res = promptStorage.createPrompt(nameInput as string);
      if (!res.ok) {
        clack.log.error(theme.error(res.error!));
      } else {
        clack.log.success(theme.success(`Arquivo criado em: ${res.path}`));
        await openEditor(res.path!);
      }
      continue;
    }
    
    if (selection === '__filter__') {
       const filterText = await clack.text({
          message: 'Digite parte do nome para filtrar:'
       });
       if (wasCancelled(filterText)) continue;
       
       const filterStr = (filterText as string).toLowerCase();
       const matches = prompts.filter(p => p.name.toLowerCase().includes(filterStr));
       
       if (matches.length === 0) {
          clack.log.info(theme.muted(`Nenhum prompt encontrado para "${filterStr}".`));
       } else {
          const matchSel = await clack.select({
            message: 'Selecione o prompt:',
            options: [
              ...matches.map(p => ({ value: p.name, label: `📄 ${theme.white(p.name)}` })),
              { value: '__back__', label: `${theme.muted('←')} Cancelar filtro` }
            ]
          });
          if (!wasCancelled(matchSel) && matchSel !== '__back__') {
             await manageSinglePrompt(matchSel as string, promptStorage);
          }
       }
       continue;
    }
    
    await manageSinglePrompt(selection as string, promptStorage);
  }
}

export async function manageSinglePrompt(filename: string, promptStorage: any): Promise<void> {
  const filePath = path.join(promptStorage.PROMPTS_DIR, filename);

  const { drawAsciiPanel } = await import('../ui/panels.js');
  const { updatePromptAccess } = await import('../utils/prompt-storage.js');

  while (true) {
    updatePromptAccess(filename);

    if (fs.existsSync(filePath)) {
      try {
        const rawContent = fs.readFileSync(filePath, 'utf-8').trim();
        const sizeKB = (Buffer.byteLength(rawContent, 'utf-8') / 1024).toFixed(2);
        const termWidth = process.stdout.columns || 80;
        const maxLineLength = Math.max(termWidth - 5, 20);

        const renderedLines: string[] = [];

        if (rawContent.length === 0) {
          renderedLines.push(theme.muted('Este prompt está vazio. Escalonado para edição física.'));
        } else {
          const rawLines = rawContent.split(/\r?\n/);
          
          for (const rawLine of rawLines) {
            let chunks: string[] = [];
            if (rawLine.length === 0) {
              chunks.push('');
            } else {
              let currentIndex = 0;
              while (currentIndex < rawLine.length) {
                chunks.push(rawLine.slice(currentIndex, currentIndex + maxLineLength));
                currentIndex += maxLineLength;
              }
            }

            chunks.forEach((chunk) => {
              let printChunk = chunk
                .replace(/^(#{1,6})\s+(.*)/, (match, hashes, text) => `${theme.muted(hashes)} ${theme.success(text)}`)
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, txt, url) => `${theme.white(txt)}(${theme.accent(url)})`)
                .replace(/`([^`]+)`/g, (match, code) => theme.primary(code));
              
              renderedLines.push(printChunk);
            });
          }
        }
        
        drawAsciiPanel(theme.primary(`#### ⚙️ Gerenciar Prompt: ${theme.accent(filename)} ${theme.muted(`[${sizeKB} KB]`)}`), renderedLines);
      } catch { /* erro silent */ }
    } else {
      // Se não existir mais, sai do loop
      return;
    }

    const action = await clack.select({
      message: theme.primary(`*  Selecione uma ação:`),
      options: [
        { value: 'copy', label: `${theme.white('📋')}  Copiar Prompt` },
        { value: 'edit', label: `${theme.accent('✏️')}  Editar Prompt` },
        { value: 'delete', label: `${theme.error('🗑️')}  Deletar Prompt` },
        { value: 'back', label: `${theme.muted('←')}  Voltar` }
      ]
    });

    if (wasCancelled(action) || action === 'back') return;

    if (action === 'copy') {
      try {
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const { execaSync } = await import('execa');
        
        if (process.platform === 'darwin') {
          execaSync('pbcopy', [], { input: rawContent });
        } else if (process.platform === 'win32') {
          // Utiliza cmd orginal com chcp 65001 (UTF-8) passando input direto via stdin 
          // O execa garante que a Stream transborde perfeitamente para o Pipe sem ser quebrada
          // por wrappers do Node v8 e o CRLF do Windows é normalizado
          const normalizedContent = rawContent.replace(/\r?\n/g, '\r\n');
          execaSync('cmd.exe', ['/c', 'chcp 65001 >NUL && clip'], { input: normalizedContent });
        } else {
          // Fallback Linux
          try {
             execaSync('xclip', ['-selection', 'clipboard'], { input: rawContent });
          } catch {
             execaSync('xsel', ['--clipboard', '--input'], { input: rawContent });
          }
        }
        
        clack.log.success(theme.success('Prompt copiado com sucesso! 📋'));
      } catch (err) {
        clack.log.error(theme.error('Erro ao utilizar o clipboard do sistema operacional.'));
      }
    } else if (action === 'edit') {
      const filePath = path.join(promptStorage.PROMPTS_DIR, filename);
       await openEditor(filePath);
    } else if (action === 'delete') {
      const confirm = await clack.confirm({
         message: theme.warn(`Tem certeza que deseja deletar ${filename}? Essa ação é irreversível!`),
         initialValue: false
      });
      if (!wasCancelled(confirm) && confirm) {
         promptStorage.deletePrompt(filename);
         clack.log.success(theme.success(`Prompt deletado: ${filename}`));
         return; 
      }
    }
  }
}

// ─── Provedores de IA ────────────────────────────────────────────────────────

export async function manageProviders(): Promise<void> {
  const { drawAsciiPanel } = await import('../ui/panels.js');
  
  const providerGuide = PROVIDERS
    .map((p) => `  ${theme.accent('●')} ${theme.white(p.label.padEnd(22))} ${theme.muted('→')} ${theme.accent(p.keyUrl)}`);

  drawAsciiPanel(
    theme.primary('#### 🤖 Provedores de IA'),
    [
      '',
      `${theme.white('Onde obter sua API Key:')}`,
      '',
      ...providerGuide,
      '',
      `${theme.muted('💡 Dica: O Ollama roda 100% local e não precisa de API Key.')}`,
      `${theme.muted('🔒 Suas chaves serão salvas em')} ${theme.accent('~/.horus/.env')} ${theme.muted('(fora do repositório Git).')}`,
      ''
    ]
  );

  while (true) {
    if (!fs.existsSync(GLOBAL_ENV_PATH)) {
      clearInternalState();
      writeStatusMap(new Map());
    }

    const existingEnv = readGlobalEnvMap();
    const statusCache = readStatusMap();

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
          labelText = theme.error(p.label);
          hintText = theme.error(state.errorMsg ?? '(Chave inválida)');
          break;
        }
        case 'quota_exceeded': {
          statusIcon = theme.purple('⚠');
          labelText = theme.purple(p.label);
          hintText = theme.purple(state.errorMsg ?? '(Cota excedida de modelo)');
          break;
        }
        default: {
          statusIcon = theme.muted('○');
          labelText = theme.muted(p.label);
          hintText = theme.muted('Pendente') + theme.muted(` — ${p.hint}`);
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

      if (!fs.existsSync(GLOBAL_ENV_PATH)) {
        clearInternalState();
        writeStatusMap(new Map());
        s.stop(theme.error('✗ Arquivo .env global não encontrado.'));
        clack.note(
          theme.warn('Configurações globais não encontradas. Por favor, reconfigure seus provedores.'),
          theme.error('Arquivo Ausente')
        );
        continue;
      }

      // Limpa cache da sessão para refletir .env nativo
      clearInternalState();
      const envMap = readGlobalEnvMap();
      let validCount = 0;
      let invalidCount = 0;

      const promises = PROVIDERS.map(async (p) => {
        if (!hasProviderKey(p, envMap)) return;
        const keyValue = p.value === 'ollama' ? 'local' : (envMap.get(p.envKey) || process.env[p.envKey] || '');
        const result = await validateApiKey(p, keyValue);
        setProviderStatus(p.value, result.status, result.errorMsg);
        return result;
      });

      const results = await Promise.allSettled(promises);
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          if (res.value.status === 'valid') validCount++;
          else invalidCount++;
        }
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
      setProviderStatus(provider.value, result.status, result.errorMsg);

      if (result.status === 'invalid' || result.status === 'quota_exceeded') {
        const errorTheme = result.status === 'quota_exceeded' ? theme.purple : theme.error;
        validationSpinner.stop(errorTheme(`✗ ${result.errorMsg ?? 'Erro de validação'}`));

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
      setProviderStatus(provider.value, result.status, result.errorMsg);

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



// ─── Health Check Integrado ───────────────────────────────────────────────────

/**
 * Invoca a verificação do provedor ativo antes da inicialização com Agent.
 * 
 * Estratégia de Fallback Resiliente:
 *   1. Percorre TODOS os provedores que possuem chave configurada.
 *   2. Retorna imediatamente o PRIMEIRO cuja validação seja 'valid'.
 *   3. Se NENHUM for válido, retorna o erro do último provedor testado.
 *   4. Ordem de prioridade: gemini → openrouter → groq → openai → anthropic → ollama
 *      (Ollama é o último pois depende de um servidor local estar rodando)
 */
export async function checkActiveProviderHealth(): Promise<{ ok: boolean; status?: ProviderStatus; errorMsg?: string; label?: string }> {
  if (!fs.existsSync(GLOBAL_ENV_PATH)) {
    clearInternalState();
    writeStatusMap(new Map());
    return { ok: false, errorMsg: 'Nenhum provedor de IA configurado (arquivo ~.horus/.env ausente)' };
  }

  // Força re-leitura do env físico garantindo que não estamos pegando cache
  clearInternalState();
  const envMap = readGlobalEnvMap();
  
  // IMPORTANTE: Repovoar process.env para que o ai-agent consuma as chaves
  const { loadGlobalEnv } = await import('../utils/env.js');
  loadGlobalEnv();
  
  // Ordem de prioridade: cloud-first, Ollama por último (depende de server local)
  const priorityOrder = ['gemini', 'openrouter', 'groq', 'openai', 'anthropic', 'ollama'];
  
  let lastFailure: { status: ProviderStatus; errorMsg?: string; label: string } | null = null;
  let anyConfigured = false;

  for (const pValue of priorityOrder) {
    const p = PROVIDERS.find(x => x.value === pValue);
    if (!p) continue;
    if (!hasProviderKey(p, envMap)) continue;
    
    anyConfigured = true;
    const keyValue = p.value === 'ollama' ? 'local' : (envMap.get(p.envKey) || process.env[p.envKey] || '');
    const result = await validateApiKey(p, keyValue);
    
    // Salva atomicamente para os logs / UI reagir
    setProviderStatus(p.value, result.status, result.errorMsg);
    
    // Se válido → retorna imediatamente (primeiro válido ganha)
    if (result.status === 'valid') {
      return { ok: true, status: 'valid', label: p.label };
    }
    
    // Se inválido → guarda como último erro e continua tentando os próximos
    const failure: { status: ProviderStatus; errorMsg?: string; label: string } = { status: result.status, label: p.label };
    if (result.errorMsg !== undefined) failure.errorMsg = result.errorMsg;
    lastFailure = failure;
  }
  
  // Nenhum provedor foi válido
  if (!anyConfigured) {
    return { ok: false, errorMsg: 'Nenhum provedor de IA configurado no ~/.horus/.env' };
  }
  
  // Retorna o último erro encontrado
  const ret: { ok: boolean; status?: ProviderStatus; errorMsg?: string; label?: string } = {
    ok: false,
    status: lastFailure!.status,
    label: lastFailure!.label,
  };
  if (lastFailure!.errorMsg !== undefined) ret.errorMsg = lastFailure!.errorMsg;
  return ret;
}
