-- Migration: 003_create_user_sessions
-- Description: Состояние сценария анализа и результаты блоков

CREATE TABLE IF NOT EXISTS public.user_sessions (
  user_id BIGINT PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES public.user_chats (id) ON DELETE CASCADE,
  step TEXT NOT NULL DEFAULT 'menu',
  block_index INT NOT NULL DEFAULT 0,
  collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_block_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_sessions IS 'Сценарий Lapis Vivus: шаг FSM и собранные данные оператора';
COMMENT ON COLUMN public.user_sessions.step IS 'Текущий шаг: menu, gender, birth_date, birth_time, birth_place, confirm, bazi_upload, astro_upload, block_running, block_review, block_failed, completed';
COMMENT ON COLUMN public.user_sessions.block_index IS 'Индекс текущего блока в стеке 1A..5';

CREATE TABLE IF NOT EXISTS public.analysis_block_results (
  id BIGSERIAL PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.user_chats (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analysis_block_results_block_id_check CHECK (
    block_id IN ('1A', '1B', '1C', '1D', '2', '3', '4', '5')
  )
);

COMMENT ON TABLE public.analysis_block_results IS 'Ответы ИИ по блокам анализа';

CREATE INDEX IF NOT EXISTS idx_user_sessions_chat_id ON public.user_sessions (chat_id);
CREATE INDEX IF NOT EXISTS idx_analysis_block_results_chat_block
  ON public.analysis_block_results (chat_id, block_id, created_at DESC);

DROP TRIGGER IF EXISTS user_sessions_set_updated_at ON public.user_sessions;
CREATE TRIGGER user_sessions_set_updated_at
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_block_results ENABLE ROW LEVEL SECURITY;
