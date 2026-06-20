import { loadBotConfig } from '../src/config.js';
import { getUserLanguage } from '../src/db/users.js';
import { creditBalanceForPayment } from '../src/db/payments.js';
import { fetchYooKassaPayment } from '../src/services/yookassa.js';
import { formatTopupSuccessNotification } from '../src/ui/wallet.js';

async function notifyUserTopup(userId, amountRub, balanceRub) {
  const { botToken } = loadBotConfig();
  let lang = 'ru';
  try {
    lang = await getUserLanguage(userId);
  } catch {
    // default ru
  }

  const text = formatTopupSuccessNotification(amountRub, balanceRub, lang);

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: userId,
      text,
      parse_mode: 'HTML',
    }),
  }).catch((err) => {
    console.error('[yookassa] telegram notify failed:', err.message);
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, service: 'yookassa-webhook' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body ?? {};
    const event = body.event;
    const object = body.object;

    if (event !== 'payment.succeeded' || !object?.id) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }

    const yookassaPaymentId = object.id;

    const remote = await fetchYooKassaPayment(yookassaPaymentId);
    if (remote.status !== 'succeeded') {
      res.status(200).json({ ok: true, skipped: true, reason: 'not_succeeded' });
      return;
    }

    const result = await creditBalanceForPayment(yookassaPaymentId);

    if (result.credited && result.userId) {
      await notifyUserTopup(result.userId, result.amountRub, result.balanceRub);
    }

    res.status(200).json({ ok: true, credited: result.credited });
  } catch (err) {
    console.error('[yookassa-webhook]', err.message);
    res.status(200).json({ ok: true });
  }
}
