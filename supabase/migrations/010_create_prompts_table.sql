-- Таблица для хранения промптов системы
CREATE TABLE IF NOT EXISTS public.prompts (
  id TEXT PRIMARY KEY CHECK (id IN ('system', 'blocks')),
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES users(id)
);

COMMENT ON TABLE public.prompts IS 'Промпты для ИИ системы (только 2 записи: system и blocks)';
COMMENT ON COLUMN public.prompts.id IS 'Тип промпта: system (системный) или blocks (этапы)';
COMMENT ON COLUMN public.prompts.content IS 'Текст промпта';
COMMENT ON COLUMN public.prompts.updated_by IS 'ID админа который последний раз обновил промпт';

-- Триггер для автообновления updated_at
CREATE OR REPLACE FUNCTION public.update_prompts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prompts_update_timestamp ON public.prompts;
CREATE TRIGGER prompts_update_timestamp
  BEFORE UPDATE ON public.prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_prompts_updated_at();

-- Вставка начальных данных (будут заполнены ботом при первом запуске)
-- Используем ON CONFLICT DO NOTHING чтобы не затереть существующие данные при повторной миграции
INSERT INTO public.prompts (id, content, updated_by) 
VALUES 
  ('system', 'Промпт будет загружен при первом запуске бота', NULL),
  ('blocks', 'Блоки будут загружены при первом запуске бота', NULL)
ON CONFLICT (id) DO NOTHING;
