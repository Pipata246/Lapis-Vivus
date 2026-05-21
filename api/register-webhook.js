import { loadBotConfig } from '../src/config.js';

/**
 * Регистрация webhook с сервера Vercel (когда с ПК api.telegram.org недоступен).
 * Один раз открой в браузере (подставь свой WEBHOOK_SECRET):
 * https://lapis-vivus.vercel.app/api/register-webhook?key=ТВОЙ_WEBHOOK_SECRET
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Use GET' });
    return;
  }

  const key = req.query?.key?.trim();
  let webhookSecret;

  try {
    ({ webhookSecret } = loadBotConfig());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
    return;
  }

  if (!key || key !== webhookSecret) {
    res.status(401).json({ ok: false, error: 'Invalid key' });
    return;
  }

  const botToken = process.env.BOT_TOKEN?.trim();
  const webhookUrl = process.env.WEBHOOK_URL?.trim() || 'https://lapis-vivus.vercel.app/api/webhook';

  if (!botToken) {
    res.status(500).json({ ok: false, error: 'BOT_TOKEN not set on Vercel' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
        }),
      },
    );

    const data = await response.json();

    if (!data.ok) {
      res.status(400).json({ ok: false, error: data.description ?? 'setWebhook failed' });
      return;
    }

    res.status(200).json({
      ok: true,
      message: 'Webhook зарегистрирован',
      url: webhookUrl,
      telegram: data,
    });
  } catch (err) {
    const detail = err.cause?.message ?? err.message;
    res.status(502).json({
      ok: false,
      error: 'Не удалось связаться с Telegram API',
      detail,
    });
  }
}
