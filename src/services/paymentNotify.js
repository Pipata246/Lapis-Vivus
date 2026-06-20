import { loadBotConfig } from '../config.js';
import {
  creditBalanceForPayment,
  getAllPendingPayments,
  getPendingPaymentsForUser,
} from '../db/payments.js';
import { getUserLanguage } from '../db/users.js';
import { fetchYooKassaPayment } from './yookassa.js';
import { formatTopupSuccessNotification } from '../ui/wallet.js';

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
 * Единая обработка успешного платежа: проверка в ЮKassa → БД → уведомление в TG.
 * @param {string} yookassaPaymentId
 * @param {'webhook'|'cron'|'sync'} source
 */
export async function processSuccessfulPayment(yookassaPaymentId, source = 'webhook') {
  const remote = await fetchYooKassaPayment(yookassaPaymentId);

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
  } else {
    console.log(`[payment:${source}] already credited or missing row`, yookassaPaymentId);
  }

  return { ...result, reason: result.credited ? 'credited' : 'already_done' };
}

/** Фоновая проверка всех pending-платежей (cron). */
export async function syncAllPendingPayments(source = 'cron') {
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

  return { pending: pending.length, credited: creditedCount };
}

/** @deprecated используйте syncAllPendingPayments / processSuccessfulPayment */
export async function syncUserPendingPayments(userId) {
  const pending = await getPendingPaymentsForUser(userId);
  let synced = 0;
  let lastCredited = null;

  for (const payment of pending) {
    if (!payment.yookassa_payment_id) continue;

    try {
      const result = await processSuccessfulPayment(payment.yookassa_payment_id, 'sync');
      if (result.credited && result.userId) {
        synced += 1;
        lastCredited = result;
      }
    } catch (err) {
      console.error('[payment-sync]', payment.yookassa_payment_id, err.message);
    }
  }

  return { synced, credited: lastCredited };
}
