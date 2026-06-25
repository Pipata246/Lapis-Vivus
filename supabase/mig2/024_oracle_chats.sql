-- ╨Ю╤А╨░╨║╤Г╨╗: ╤Б╨▓╨╛╨▒╨╛╨┤╨╜╤Л╨╡ ╨┤╨╕╨░╨╗╨╛╨│╨╕ ╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤П ╤Б ╨Ш╨Ш (╨┤╨╛ 5 ╤З╨░╤В╨╛╨▓, 10 ╨╛╤В╨▓╨╡╤В╨╛╨▓ ╨Ш╨Ш ╨╜╨░ ╨║╨╛╨╜╤В╨╡╨║╤Б╤В)
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

COMMENT ON TABLE public.oracle_chats IS '╨Ф╨╕╨░╨╗╨╛╨│╨╕ ╨Ю╤А╨░╨║╤Г╨╗╨░: ╨╕╤Б╤В╨╛╤А╨╕╤П ╤Б╨╛╨╛╨▒╤Й╨╡╨╜╨╕╨╣ ╨╕ ╤Б╨╜╨╕╨╝╨╛╨║ ╨┐╤А╨╛╤Д╨╕╨╗╤П ╨╜╨░ ╤Б╨╡╨│╨╝╨╡╨╜╤В ╨║╨╛╨╜╤В╨╡╨║╤Б╤В╨░';
