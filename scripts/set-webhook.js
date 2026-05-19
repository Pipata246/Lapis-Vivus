import 'dotenv/config';

const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{35,}$/;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Переменная ${name} не задана.`);
  }
  return value;
}

async function main() {
  const botToken = requireEnv('BOT_TOKEN');
  const webhookUrl = requireEnv('WEBHOOK_URL');

  if (!TOKEN_PATTERN.test(botToken)) {
    throw new Error('BOT_TOKEN имеет неверный формат.');
  }

  if (!webhookUrl.startsWith('https://')) {
    throw new Error('WEBHOOK_URL должен начинаться с https://');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    },
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || 'Не удалось установить webhook');
  }

  console.log('Webhook установлен:', webhookUrl);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
