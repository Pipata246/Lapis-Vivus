import crypto from 'node:crypto';
import { loadYooKassaConfig } from '../config.js';

const YOOKASSA_API = 'https://api.yookassa.ru/v3/payments';

function authHeader(shopId, secretKey) {
  const token = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  return `Basic ${token}`;
}

function formatAmountRub(amountRub) {
  return `${amountRub}.00`;
}

export function resolveReturnUrl(explicitUrl) {
  if (explicitUrl) return explicitUrl;
  const webhookUrl = process.env.WEBHOOK_URL?.trim().replace(/\/api\/webhook\/?$/, '');
  if (webhookUrl) return webhookUrl;
  return 'https://t.me';
}

export async function createYooKassaPayment({ amountRub, userId, paymentId, description, returnUrl }) {
  const { shopId, secretKey, enabled } = loadYooKassaConfig();
  if (!enabled) {
    throw new Error('ЮKassa не настроена. Задайте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.');
  }

  const body = {
    amount: {
      value: formatAmountRub(amountRub),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: returnUrl,
    },
    description: description ?? `Пополнение баланса · user ${userId}`,
    metadata: {
      user_id: String(userId),
      payment_id: paymentId,
    },
  };

  const res = await fetch(YOOKASSA_API, {
    method: 'POST',
    headers: {
      Authorization: authHeader(shopId, secretKey),
      'Content-Type': 'application/json',
      'Idempotence-Key': paymentId,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = data?.description ?? data?.type ?? res.statusText;
    throw new Error(`ЮKassa: ${detail}`);
  }

  return {
    id: data.id,
    status: data.status,
    confirmationUrl: data.confirmation?.confirmation_url ?? null,
  };
}

export async function fetchYooKassaPayment(paymentId) {
  const { shopId, secretKey, enabled } = loadYooKassaConfig();
  if (!enabled) {
    throw new Error('ЮKassa не настроена.');
  }

  const res = await fetch(`${YOOKASSA_API}/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: authHeader(shopId, secretKey),
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = data?.description ?? data?.type ?? res.statusText;
    throw new Error(`ЮKassa: ${detail}`);
  }

  return data;
}

export function newPaymentUuid() {
  return crypto.randomUUID();
}
