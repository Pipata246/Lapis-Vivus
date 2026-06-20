import { loadBotConfig } from '../config.js';
import { creditBalanceForPayment, getPendingPaymentsForUser } from '../db/payments.js';
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

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: userId,
      text,
    }),
  }).catch((err) => {
    console.error('[payment] telegram notify failed:', err.message);
  });
}

/**
 * Подтягивает успешные платежи из ЮKassa, если webhook ещё не сработал.
 * Вызывается при открытии профиля — страховка при пропущенных HTTP-уведомлениях.
 */
export async function syncUserPendingPayments(userId) {
  const pending = await getPendingPaymentsForUser(userId);
  if (!pending.length) {
    return { synced: 0, credited: null };
  }

  let synced = 0;
  let lastCredited = null;

  for (const payment of pending) {
    if (!payment.yookassa_payment_id) continue;

    try {
      const remote = await fetchYooKassaPayment(payment.yookassa_payment_id);
      console.log('[payment-sync] status:', remote.status, payment.yookassa_payment_id);

      if (remote.status !== 'succeeded') continue;

      const result = await creditBalanceForPayment(payment.yookassa_payment_id);
      console.log('[payment-sync] credit result:', result);

      if (result.credited && result.userId) {
        synced += 1;
        lastCredited = result;
        await notifyUserTopup(result.userId, result.amountRub, result.balanceRub);
      }
    } catch (err) {
      console.error('[payment-sync]', payment.yookassa_payment_id, err.message);
    }
  }

  return { synced, credited: lastCredited };
}
