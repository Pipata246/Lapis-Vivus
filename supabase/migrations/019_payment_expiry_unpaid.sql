-- Migration: 019_payment_expiry_unpaid
-- Description: Таймер оплаты 10 мин; просроченные счета → unpaid

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

UPDATE public.payments
SET expires_at = created_at + INTERVAL '10 minutes'
WHERE expires_at IS NULL;

UPDATE public.payments
SET status = 'unpaid', closed_at = COALESCE(closed_at, NOW())
WHERE status = 'pending' AND expires_at < NOW();

UPDATE public.payments
SET status = 'unpaid', closed_at = COALESCE(closed_at, NOW())
WHERE status = 'canceled';

ALTER TABLE public.payments
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.payments
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '10 minutes');

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'succeeded', 'unpaid'));

CREATE INDEX IF NOT EXISTS idx_payments_pending_expires
  ON public.payments (expires_at)
  WHERE status = 'pending';

COMMENT ON COLUMN public.payments.expires_at IS 'Срок оплаты счёта (создание + 10 минут)';
COMMENT ON COLUMN public.payments.closed_at IS 'Время закрытия счёта (unpaid или succeeded через paid_at)';
COMMENT ON COLUMN public.payments.status IS 'pending = ожидает оплаты; succeeded = оплачен; unpaid = не оплачен (истёк срок или отмена)';

DROP INDEX IF EXISTS idx_payments_pending;

CREATE INDEX IF NOT EXISTS idx_payments_pending ON public.payments (status, expires_at)
  WHERE status = 'pending';
