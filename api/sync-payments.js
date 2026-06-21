import { syncAllPendingPayments } from '../src/services/paymentNotify.js';

function authorizeRequest(req) {
  const secret = process.env.CRON_SECRET?.trim() || process.env.WEBHOOK_SECRET?.trim();
  if (!secret) return true;

  const authHeader = req.headers.authorization ?? req.headers.Authorization ?? '';
  if (authHeader === `Bearer ${secret}`) return true;

  const key = req.query?.key?.trim();
  return key === secret;
}

/**
 * Фоновая проверка pending-платежей в ЮKassa.
 * Vercel Cron каждые 2 мин + можно вызвать вручную: ?key=WEBHOOK_SECRET
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!authorizeRequest(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  try {
    const result = await syncAllPendingPayments('cron');
    console.log('[sync-payments]', result);

    res.status(200).json({
      ok: true,
      expired: result.expired,
      pending_checked: result.pending,
      credited: result.credited,
      ttl_minutes: result.ttlMinutes,
    });
  } catch (err) {
    console.error('[sync-payments]', err.message, err.stack);
    res.status(500).json({ ok: false, error: err.message });
  }
}
