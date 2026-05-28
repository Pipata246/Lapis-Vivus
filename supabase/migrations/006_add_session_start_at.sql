-- Migration: 006_add_session_start_at
-- Description: Добавление метки начала текущего прогона для изоляции контекста ИИ
-- Применение: Supabase Dashboard → SQL Editor → выполнить после 005_add_user_profile.sql

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS session_start_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_sessions.session_start_at IS 'Метка начала текущего прогона анализа. ИИ видит только сообщения после этой даты.';

-- Установить session_start_at для существующих сессий (равно created_at)
UPDATE public.user_sessions
SET session_start_at = created_at
WHERE session_start_at IS NULL;

-- Сделать поле NOT NULL после заполнения
ALTER TABLE public.user_sessions
  ALTER COLUMN session_start_at SET DEFAULT NOW(),
  ALTER COLUMN session_start_at SET NOT NULL;
