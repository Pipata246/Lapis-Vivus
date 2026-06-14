import 'dotenv/config';

const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{35,}$/;
const ASCII_ONLY = /^[\x00-\x7F]+$/;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Переменная окружения ${name} не задана. Скопируйте .env.example в .env и заполните значения.`,
    );
  }
  return value;
}

export function loadBotConfig() {
  const botToken = requireEnv('BOT_TOKEN');
  const webhookSecret = requireEnv('WEBHOOK_SECRET');

  if (!TOKEN_PATTERN.test(botToken)) {
    throw new Error('BOT_TOKEN имеет неверный формат.');
  }

  if (!ASCII_ONLY.test(webhookSecret) || webhookSecret.length < 16) {
    throw new Error(
      'WEBHOOK_SECRET: минимум 16 символов, только латиница/цифры (openssl rand -hex 32).',
    );
  }

  return { botToken, webhookSecret };
}

export function loadSupabaseConfig() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    throw new Error('SUPABASE_URL имеет неверный формат.');
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

export function loadAiConfig() {
  const gptunnelApiKey = requireEnv('GPTUNNEL_API_KEY');
  const gptunnelModel = process.env.GPTUNNEL_MODEL?.trim() || 'gpt-4o-mini';
  const useWalletBalance = process.env.GPTUNNEL_USE_WALLET?.trim() !== 'false';

  if (!ASCII_ONLY.test(gptunnelApiKey)) {
    throw new Error(
      'GPTUNNEL_API_KEY содержит недопустимые символы (кириллица или пробелы). Скопируйте ключ заново из личного кабинета GPTunnel — только латиница и цифры.',
    );
  }

  if (!ASCII_ONLY.test(gptunnelModel)) {
    throw new Error(
      'GPTUNNEL_MODEL должен быть латинским id модели (например gpt-4o-mini), без русских букв.',
    );
  }

  return { gptunnelApiKey, gptunnelModel, useWalletBalance };
}

function envFlag(name, defaultValue = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return defaultValue;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** Настройки сборки промпта для ИИ (единственная env-переменная — PROMPTS_USE_DB) */
export function loadPromptConfig() {
  return {
    /** 1 = Supabase, 0 = src/prompts/* */
    useDb: envFlag('PROMPTS_USE_DB', true),
    blocksMode: 'single',
    includeGlossary: true,
    includeBibliography: true,
    bibliographyMode: 'single',
    includeCalculators: false,
    chatHistoryMode: 'summary',
    debug: false,
  };
}

/** @deprecated используйте loadBotConfig / loadAiConfig / loadSupabaseConfig */
export function loadConfig() {
  return {
    ...loadBotConfig(),
    ...loadSupabaseConfig(),
    ...loadAiConfig(),
  };
}
