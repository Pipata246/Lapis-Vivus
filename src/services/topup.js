import { TOPUP_MAX_RUB, TOPUP_MIN_RUB } from '../config.js';
import { attachYooKassaPaymentId, expireStalePayments, insertPendingPayment } from '../db/payments.js';
import {
  createYooKassaPayment,
  newPaymentUuid,
  resolveReturnUrl,
} from './yookassa.js';
import { loadYooKassaConfig } from '../config.js';

export function parseTopupAmount(text) {
  const normalized = String(text).trim().replace(/\s/g, '').replace(',', '.');
  const value = Number(normalized);

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: 'invalid' };
  }

  if (value < TOPUP_MIN_RUB) {
    return { ok: false, error: 'min', min: TOPUP_MIN_RUB };
  }

  if (value > TOPUP_MAX_RUB) {
    return { ok: false, error: 'max', max: TOPUP_MAX_RUB };
  }

  return { ok: true, amountRub: value };
}

export async function createTopupPayment(userId, amountRub, lang = 'ru') {
  await expireStalePayments();

  const paymentId = newPaymentUuid();
  await insertPendingPayment({ id: paymentId, userId, amountRub });

  const { returnUrl: configuredReturnUrl } = loadYooKassaConfig();
  const returnUrl = resolveReturnUrl(configuredReturnUrl);

  const description =
    lang === 'en'
      ? `Lapis Vivus balance top-up · ${amountRub} ₽`
      : `Пополнение баланса Lapis Vivus · ${amountRub} ₽`;

  const ykPayment = await createYooKassaPayment({
    amountRub,
    userId,
    paymentId,
    description,
    returnUrl,
  });

  await attachYooKassaPaymentId(paymentId, ykPayment.id);

  return {
    paymentId,
    yookassaPaymentId: ykPayment.id,
    confirmationUrl: ykPayment.confirmationUrl,
  };
}
