import 'dotenv/config';

const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{35,}$/;
const FETCH_TIMEOUT_MS = 30_000;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Переменная ${name} не задана.`);
  }
  return value;
}

function formatFetchError(err) {
  const code = err.cause?.code ?? err.code;
  const msg = err.cause?.message ?? err.message;

  if (code === 'UND_ERR_CONNECT_TIMEOUT' || msg.includes('Timeout')) {
    return [
      'Нет связи с api.telegram.org (таймаут).',
      'Частая причина в РФ: блокировка провайдером или файрвол.',
      '',
      'Обход — зарегистрируй webhook через Vercel (после деплоя):',
      '1) Добавь WEBHOOK_SECRET на Vercel и сделай Redeploy',
      '2) Открой в браузере:',
      `   ${process.env.WEBHOOK_URL?.replace('/api/webhook', '/api/register-webhook') ?? 'https://ТВОЙ-ДОМЕН.vercel.app/api/register-webhook'}?key=ТВОЙ_WEBHOOK_SECRET`,
      '',
      'Или включи VPN и запусти скрипт снова.',
    ].join('\n');
  }

  return msg || 'fetch failed';
}

async function main() {
  const botToken = requireEnv('BOT_TOKEN');
  const webhookUrl = requireEnv('WEBHOOK_URL');
  const webhookSecret = requireEnv('WEBHOOK_SECRET');

  if (!TOKEN_PATTERN.test(botToken)) {
    throw new Error('BOT_TOKEN имеет неверный формат.');
  }

  if (!webhookUrl.startsWith('https://')) {
    throw new Error('WEBHOOK_URL должен начинаться с https://');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
        }),
        signal: controller.signal,
      },
    );
  } catch (err) {
    throw new Error(formatFetchError(err));
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || 'Не удалось установить webhook');
  }

  console.log('Webhook установлен:', webhookUrl);
  console.log('Secret token: задан (WEBHOOK_SECRET)');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
