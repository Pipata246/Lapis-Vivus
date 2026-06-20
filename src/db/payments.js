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

/** Начисление баланса после успешной оплаты (идемпотентно). */
export async function creditBalanceForPayment(yookassaPaymentId) {
  const supabase = getSupabase();

  const { data: payment, error: findErr } = await supabase
    .from('payments')
    .select('*')
    .eq('yookassa_payment_id', yookassaPaymentId)
    .maybeSingle();

  if (findErr) {
    throw new Error(`Не удалось найти платёж: ${findErr.message}`);
  }

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
