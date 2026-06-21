-- Migration: 022_user_legal_accepted
-- Description: Согласие с политикой конфиденциальности и публичной офертой

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS legal_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.legal_accepted IS 'Пользователь принял политику конфиденциальности и публичную оферту';
COMMENT ON COLUMN public.users.legal_accepted_at IS 'Дата и время принятия документов';
