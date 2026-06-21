import { PAYMENT_TTL_MINUTES } from '../config.js';
import { getSupabase } from './supabase.js';

function paymentExpiresAt(fromDate = new Date()) {
  return new Date(fromDate.getTime() + PAYMENT_TTL_MINUTES * 60 * 1000).toISOString();
}

function isPaymentExpired(payment) {
  if (!payment?.expires_at) return false;
  return new Date(payment.expires_at).getTime() <= Date.now();
}

export async function insertPendingPayment({ id, userId, amountRub }) {
  const supabase = getSupabase();
  const expiresAt = paymentExpiresAt();

  const { data, error } = await supabase
    .from('payments')
    .insert({
      id,
      user_id: userId,
      amount_rub: amountRub,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Не удалось создать платёж: ${error.message}`);
  }

  return data;
}

export async function attachYooKassaPaymentId(paymentId, yookassaPaymentId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('payments')
    .update({ yookassa_payment_id: yookassaPaymentId })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) {
    throw new Error(`Не удалось обновить платёж: ${error.message}`);
  }

  return data;
}

export async function getPaymentByYookassaId(yookassaPaymentId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('yookassa_payment_id', yookassaPaymentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось загрузить платёж: ${error.message}`);
  }

  return data;
}

/** Закрыть просроченные pending-счета статусом unpaid. */
export async function expireStalePayments() {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'unpaid', closed_at: now })
    .eq('status', 'pending')
    .lt('expires_at', now)
    .select('id');

  if (error) {
    throw new Error(`Не удалось закрыть просроченные платежи: ${error.message}`);
  }

  return data?.length ?? 0;
}

async function markPaymentUnpaid(paymentId) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  await supabase
    .from('payments')
    .update({ status: 'unpaid', closed_at: now })
    .eq('id', paymentId)
    .eq('status', 'pending');
}

/** Начисление баланса после успешной оплаты (идемпотентно, только в срок). */
export async function creditBalanceForPayment(yookassaPaymentId) {
  const supabase = getSupabase();

  const payment = await getPaymentByYookassaId(yookassaPaymentId);

  if (!payment) {
    console.error('[credit] нет строки payments для', yookassaPaymentId);
    return { credited: false, userId: null, amountRub: null, balanceRub: null };
  }

  if (payment.status === 'succeeded') {
    const { data: user } = await supabase
      .from('users')
      .select('balance_rub')
      .eq('id', payment.user_id)
      .single();

    return {
      credited: false,
      userId: payment.user_id,
      amountRub: payment.amount_rub,
      balanceRub: user?.balance_rub ?? 0,
    };
  }

  if (payment.status === 'unpaid') {
    return { credited: false, userId: payment.user_id, amountRub: payment.amount_rub, balanceRub: null };
  }

  if (isPaymentExpired(payment)) {
    await markPaymentUnpaid(payment.id);
    console.log('[credit] счёт просрочен, unpaid:', yookassaPaymentId);
    return { credited: false, userId: payment.user_id, amountRub: payment.amount_rub, balanceRub: null };
  }

  const { data: updated, error: updErr } = await supabase
    .from('payments')
    .update({ status: 'succeeded', paid_at: new Date().toISOString() })
    .eq('yookassa_payment_id', yookassaPaymentId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (updErr) {
    throw new Error(`Не удалось обновить статус платежа: ${updErr.message}`);
  }

  if (!updated) {
    return { credited: false, userId: payment.user_id, amountRub: payment.amount_rub, balanceRub: null };
  }

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('balance_rub')
    .eq('id', payment.user_id)
    .single();

  if (userErr) {
    throw new Error(`Не удалось прочитать баланс: ${userErr.message}`);
  }

  const newBalance = (user.balance_rub ?? 0) + payment.amount_rub;

  const { data: creditedUser, error: balErr } = await supabase
    .from('users')
    .update({ balance_rub: newBalance })
    .eq('id', payment.user_id)
    .select('balance_rub')
    .single();

  if (balErr) {
    await supabase
      .from('payments')
      .update({ status: 'pending', paid_at: null })
      .eq('id', payment.id);
    throw new Error(`Не удалось начислить баланс: ${balErr.message}`);
  }

  return {
    credited: true,
    userId: payment.user_id,
    amountRub: payment.amount_rub,
    balanceRub: creditedUser.balance_rub,
  };
}

/** Закрыть pending как unpaid, если ЮKassa отменила платёж. */
export async function markPaymentUnpaidByYookassaId(yookassaPaymentId) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'unpaid', closed_at: now })
    .eq('yookassa_payment_id', yookassaPaymentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось закрыть платёж: ${error.message}`);
  }

  return Boolean(data);
}

export async function getPendingPaymentsForUser(userId) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('payments')
    .select('id, yookassa_payment_id, amount_rub, status, created_at, expires_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .not('yookassa_payment_id', 'is', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Не удалось загрузить платежи: ${error.message}`);
  }

  return data ?? [];
}

/** Все активные pending-платежи (не просроченные). */
export async function getAllPendingPayments(limit = 50) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('payments')
    .select('id, yookassa_payment_id, user_id, amount_rub, status, created_at, expires_at')
    .eq('status', 'pending')
    .not('yookassa_payment_id', 'is', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Не удалось загрузить pending-платежи: ${error.message}`);
  }

  return data ?? [];
}
