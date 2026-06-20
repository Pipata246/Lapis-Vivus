-- Migration: 017_yookassa_balance
-- Description: Баланс пользователя, платежи ЮKassa, режим UI (пополнение)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS balance_rub INTEGER NOT NULL DEFAULT 0
    CHECK (balance_rub >= 0);

COMMENT ON COLUMN public.users.balance_rub IS 'Баланс пользователя в рублях (целое число)';

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS ui_mode TEXT;

COMMENT ON COLUMN public.user_sessions.ui_mode IS 'Режим UI вне сценария: topup и др.';

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yookassa_payment_id TEXT UNIQUE,
  user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  amount_rub INTEGER NOT NULL CHECK (amount_rub >= 50 AND amount_rub <= 100000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

COMMENT ON TABLE public.payments IS 'Платежи ЮKassa на пополнение баланса';

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_pending ON public.payments (status)
  WHERE status = 'pending';

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.credit_balance_for_payment(p_yookassa_id TEXT)
RETURNS TABLE(
  credited BOOLEAN,
  user_id BIGINT,
  amount_rub INTEGER,
  balance_rub INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_balance INTEGER;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE yookassa_payment_id = p_yookassa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    credited := FALSE;
    user_id := NULL;
    amount_rub := NULL;
    balance_rub := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_payment.status = 'succeeded' THEN
    SELECT u.balance_rub INTO v_balance FROM public.users u WHERE u.id = v_payment.user_id;
    credited := FALSE;
    user_id := v_payment.user_id;
    amount_rub := v_payment.amount_rub;
    balance_rub := v_balance;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.payments
  SET status = 'succeeded', paid_at = NOW()
  WHERE yookassa_payment_id = p_yookassa_id AND status = 'pending';

  IF NOT FOUND THEN
    credited := FALSE;
    user_id := NULL;
    amount_rub := NULL;
    balance_rub := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.users
  SET balance_rub = balance_rub + v_payment.amount_rub
  WHERE id = v_payment.user_id
  RETURNING public.users.balance_rub INTO v_balance;

  credited := TRUE;
  user_id := v_payment.user_id;
  amount_rub := v_payment.amount_rub;
  balance_rub := v_balance;
  RETURN NEXT;
END;
$$;
