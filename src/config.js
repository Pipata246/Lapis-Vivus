import 'dotenv/config';

const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{35,}$/;

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

  if (!TOKEN_PATTERN.test(botToken)) {
    throw new Error('BOT_TOKEN имеет неверный формат.');
  }

  return { botToken };
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

  return { gptunnelApiKey, gptunnelModel, useWalletBalance };
}

/** @deprecated используйте loadBotConfig / loadAiConfig / loadSupabaseConfig */
export function loadConfig() {
  return {
    ...loadBotConfig(),
    ...loadSupabaseConfig(),
    ...loadAiConfig(),
  };
}
