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

export function loadConfig() {
  const botToken = requireEnv('BOT_TOKEN');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const gptunnelApiKey = requireEnv('GPTUNNEL_API_KEY');
  const gptunnelModel = process.env.GPTUNNEL_MODEL?.trim() || 'gpt-4o-mini';

  if (!TOKEN_PATTERN.test(botToken)) {
    throw new Error('BOT_TOKEN имеет неверный формат.');
  }

  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    throw new Error('SUPABASE_URL имеет неверный формат.');
  }

  return {
    botToken,
    supabaseUrl,
    supabaseServiceRoleKey,
    gptunnelApiKey,
    gptunnelModel,
  };
}
