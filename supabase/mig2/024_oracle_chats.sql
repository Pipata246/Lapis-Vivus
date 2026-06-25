-- Оракул: свободные диалоги пользователя с ИИ (до 5 чатов, 10 ответов ИИ на контекст)
CREATE TABLE IF NOT EXISTS public.oracle_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  profile_snapshot JSONB,
  ai_turns INT NOT NULL DEFAULT 0,
  context_segment INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oracle_chats_user_id ON public.oracle_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_oracle_chats_user_updated ON public.oracle_chats(user_id, updated_at DESC);

ALTER TABLE public.oracle_chats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oracle_chats FROM anon, authenticated;

COMMENT ON TABLE public.oracle_chats IS 'Диалоги Оракула: история сообщений и снимок профиля на сегмент контекста';
