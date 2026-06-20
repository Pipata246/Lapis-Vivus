import { getSupabase } from './supabase.js';

export async function insertPendingPayment({ id, userId, amountRub }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('payments')
    .insert({
      id,
      user_id: userId,
      amount_rub: amountRub,
      status: 'pending',
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
    .select()
    .single();

  if (error) {
    throw new Error(`Не удалось обновить платёж: ${error.message}`);
  }

  return data;
}

/** Атомарное начисление баланса (идемпотентно). */
export async function creditBalanceForPayment(yookassaPaymentId) {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('credit_balance_for_payment', {
    p_yookassa_id: yookassaPaymentId,
  });

  if (error) {
    throw new Error(`Не удалось начислить баланс: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { credited: false, userId: null, amountRub: null, balanceRub: null };
  }

  return {
    credited: Boolean(row.credited),
    userId: row.user_id ?? null,
    amountRub: row.amount_rub ?? null,
    balanceRub: row.balance_rub ?? null,
  };
}

export async function getPendingPaymentsForUser(userId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('payments')
    .select('id, yookassa_payment_id, amount_rub, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .not('yookassa_payment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Не удалось загрузить платежи: ${error.message}`);
  }

  return data ?? [];
}
