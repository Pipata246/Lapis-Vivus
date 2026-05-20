-- Migration: 001_create_users
-- Description: Таблица пользователей Telegram-бота (мультипользовательская среда)
-- Применение: Supabase Dashboard → SQL Editor → вставить и выполнить этот файл целиком

CREATE TABLE IF NOT EXISTS public.users (
  id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS 'Пользователи Telegram-бота';
COMMENT ON COLUMN public.users.id IS 'Telegram user id';
COMMENT ON COLUMN public.users.data IS 'Персональные данные пользователя (настройки, состояние, прогресс и т.д.)';

CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON public.users (last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
