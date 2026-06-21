import { PAYMENT_TTL_MINUTES } from '../config.js';
import { loadBotConfig } from '../config.js';
import {
  creditBalanceForPayment,
  expireStalePayments,
  getAllPendingPayments,
  getPaymentByYookassaId,
  markPaymentUnpaidByYookassaId,
} from '../db/payments.js';
import { getUserLanguage } from '../db/users.js';
import { fetchYooKassaPayment } from './yookassa.js';
import { formatTopupSuccessNotification } from '../ui/wallet.js';

function isExpired(payment) {
  return payment?.expires_at && new Date(payment.expires_at).getTime() <= Date.now();
}

export async function notifyUserTopup(userId, amountRub, balanceRub) {
  const { botToken } = loadBotConfig();
  let lang = 'ru';
  try {
    lang = await getUserLanguage(userId);
  } catch {
    // default ru
  }

  const text = formatTopupSuccessNotification(amountRub, balanceRub, lang);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: userId,
      text,
    }),
  }).catch((err) => {
    console.error('[payment] telegram notify failed:', err.message);
    return null;
  });

  if (res && !res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error('[payment] telegram API error:', data.description ?? res.status);
  }
}

/**
 * Обработка платежа: только pending в срок → succeeded + баланс + уведомление.
 */
export async function processSuccessfulPayment(yookassaPaymentId, source = 'webhook') {
  const local = await getPaymentByYookassaId(yookassaPaymentId);

  if (!local) {
    console.log(`[payment:${source}] unknown payment`, yookassaPaymentId);
    return { credited: false, reason: 'not_found' };
  }

  if (local.status === 'unpaid') {
    return { credited: false, reason: 'unpaid' };
  }

  if (local.status === 'succeeded') {
    return { credited: false, reason: 'already_done' };
  }

  if (isExpired(local)) {
    await expireStalePayments();
    console.log(`[payment:${source}] expired → unpaid`, yookassaPaymentId);
    return { credited: false, reason: 'expired' };
  }

  const remote = await fetchYooKassaPayment(yookassaPaymentId);

  if (remote.status === 'canceled') {
    await markPaymentUnpaidByYookassaId(yookassaPaymentId);
    console.log(`[payment:${source}] yookassa canceled → unpaid`, yookassaPaymentId);
    return { credited: false, reason: 'canceled' };
  }

  if (remote.status !== 'succeeded') {
    console.log(`[payment:${source}] skip ${yookassaPaymentId}, status=${remote.status}`);
    return { credited: false, reason: 'not_succeeded', status: remote.status };
  }

  const result = await creditBalanceForPayment(yookassaPaymentId);

  if (result.credited && result.userId) {
    await notifyUserTopup(result.userId, result.amountRub, result.balanceRub);
    console.log(
      `[payment:${source}] credited user=${result.userId} +${result.amountRub} balance=${result.balanceRub}`,
    );
  }

  return { ...result, reason: result.credited ? 'credited' : 'already_done' };
}

/** Закрыть просроченные + проверить активные pending в ЮKassa. */
export async function syncAllPendingPayments(source = 'cron') {
  const expired = await expireStalePayments();
  const pending = await getAllPendingPayments();
  let creditedCount = 0;

  for (const payment of pending) {
    if (!payment.yookassa_payment_id) continue;

    try {
      const result = await processSuccessfulPayment(payment.yookassa_payment_id, source);
      if (result.credited) creditedCount += 1;
    } catch (err) {
      console.error(`[payment:${source}]`, payment.yookassa_payment_id, err.message);
    }
  }

  return { expired, pending: pending.length, credited: creditedCount, ttlMinutes: PAYMENT_TTL_MINUTES };
}
