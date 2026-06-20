import { creditBalanceForPayment } from '../src/db/payments.js';
import { notifyUserTopup, syncUserPendingPayments } from '../src/services/paymentNotify.js';
import { fetchYooKassaPayment } from '../src/services/yookassa.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      service: 'yookassa-webhook',
      hint: 'Configure this URL in YooKassa → Integration → HTTP notifications (payment.succeeded)',
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const event = body.event;
    const object = body.object;

    console.log('[yookassa-webhook] event:', event, 'payment:', object?.id);

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
      console.log('[yookassa-webhook] credited', result.userId, result.amountRub);
    } else {
      console.log('[yookassa-webhook] not credited (already done or missing row)', yookassaPaymentId);
    }

    res.status(200).json({ ok: true, credited: result.credited });
  } catch (err) {
    console.error('[yookassa-webhook]', err.message, err.stack);
    res.status(200).json({ ok: true });
  }
}
