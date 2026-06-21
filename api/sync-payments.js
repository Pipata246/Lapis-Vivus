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
 * Проверка pending-платежей в ЮKassa.
 * Вызов вручную или внешним cron (cron-job.org): GET /api/sync-payments?key=CRON_SECRET
 * Vercel Hobby не поддерживает cron чаще 1 раза в день — в vercel.json cron убран.
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
