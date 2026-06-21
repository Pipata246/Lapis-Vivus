-- Migration: 020_payments_enable_rls
-- Description: Вернуть RLS на payments (как у users, user_chats и др.)
-- Бэкенд ходит через service_role — он обходит RLS; anon/authenticated доступ закрыт.

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payments FROM anon, authenticated;

GRANT ALL ON TABLE public.payments TO service_role;

-- Политик для anon/authenticated нет: таблица только для серверного бэкенда.
