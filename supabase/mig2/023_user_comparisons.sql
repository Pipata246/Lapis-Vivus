-- История сравнений / совместимости (пара профилей + результат ИИ)
CREATE TABLE IF NOT EXISTS public.user_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject_data JSONB NOT NULL DEFAULT '{}',
  partner_data JSONB NOT NULL DEFAULT '{}',
  goal_data JSONB NOT NULL DEFAULT '{}',
  target_block_id TEXT,
  block_variant TEXT,
  response_text TEXT,
  json_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_comparisons_user_id ON public.user_comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_comparisons_created_at ON public.user_comparisons(created_at DESC);

ALTER TABLE public.user_comparisons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_comparisons FROM anon, authenticated;

COMMENT ON TABLE public.user_comparisons IS 'Сессии сравнения пары профилей (совместимость)';
