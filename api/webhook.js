import { getBot } from '../src/bot.js';

function isAuthorized(req, webhookSecret) {
  if (!webhookSecret) {
    return true;
  }

  const header = req.headers['x-telegram-bot-api-secret-token'];
  return header === webhookSecret;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, service: 'telegram-webhook' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const webhookSecret = process.env.WEBHOOK_SECRET?.trim();

  if (!isAuthorized(req, webhookSecret)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  try {
    const bot = getBot();
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ ok: true });
  }
}
