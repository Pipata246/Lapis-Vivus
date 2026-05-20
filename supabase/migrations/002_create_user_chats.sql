-- Migration: 002_create_user_chats
-- Description: Чаты пользователей (1 чат на пользователя) и история сообщений
-- Применение: Supabase Dashboard → SQL Editor → выполнить после 001_create_users.sql

CREATE TABLE IF NOT EXISTS public.user_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_chats_user_id_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.user_chats IS 'Чаты пользователей — у каждого пользователя ровно один чат';
COMMENT ON COLUMN public.user_chats.user_id IS 'Telegram user id, FK на users.id';

CREATE TABLE IF NOT EXISTS public.user_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.user_chats (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_chat_messages_role_check CHECK (role IN ('user', 'assistant', 'system')),
  CONSTRAINT user_chat_messages_content_length CHECK (
    char_length(content) > 0 AND char_length(content) <= 16000
  )
);

COMMENT ON TABLE public.user_chat_messages IS 'Сообщения в чатах: запросы пользователя и ответы ИИ';
COMMENT ON COLUMN public.user_chat_messages.role IS 'user | assistant | system';

CREATE INDEX IF NOT EXISTS idx_user_chats_user_id ON public.user_chats (user_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_messages_chat_created
  ON public.user_chat_messages (chat_id, created_at DESC);

DROP TRIGGER IF EXISTS user_chats_set_updated_at ON public.user_chats;
CREATE TRIGGER user_chats_set_updated_at
  BEFORE UPDATE ON public.user_chats
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chat_messages ENABLE ROW LEVEL SECURITY;

-- Политик для anon/authenticated нет: доступ только через service_role на бэкенде.
