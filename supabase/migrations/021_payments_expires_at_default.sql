-- Migration: 021_payments_expires_at_default
-- Description: DEFAULT для expires_at — если бэкенд не передал поле, БД сама ставит +10 мин

ALTER TABLE public.payments
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '10 minutes');
