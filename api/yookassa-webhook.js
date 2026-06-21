import { processSuccessfulPayment } from '../src/services/paymentNotify.js';
import { expireStalePayments, markPaymentUnpaidByYookassaId } from '../src/db/payments.js';

function parseNotificationBody(req) {
  const raw = req.body;
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      service: 'yookassa-webhook',
      hint: 'ЮKassa → HTTP-уведомления → payment.succeeded → этот URL',
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    await expireStalePayments();

    const body = parseNotificationBody(req);
    const event = body.event;
    const yookassaPaymentId = body.object?.id;

    console.log('[yookassa-webhook] POST', { event, paymentId: yookassaPaymentId, type: body.type });

    if (!yookassaPaymentId) {
      res.status(200).json({ ok: true, skipped: true, reason: 'no_payment_id' });
      return;
    }

    if (event === 'payment.canceled') {
      const closed = await markPaymentUnpaidByYookassaId(yookassaPaymentId);
      res.status(200).json({ ok: true, closed, reason: 'canceled' });
      return;
    }

    if (event !== 'payment.succeeded') {
      res.status(200).json({ ok: true, skipped: true, reason: 'event_ignored', event });
      return;
    }

    const result = await processSuccessfulPayment(yookassaPaymentId, 'webhook');

    res.status(200).json({
      ok: true,
      credited: Boolean(result.credited),
      reason: result.reason ?? null,
    });
  } catch (err) {
    console.error('[yookassa-webhook] error:', err.message, err.stack);
    res.status(200).json({ ok: true, error: err.message });
  }
}
