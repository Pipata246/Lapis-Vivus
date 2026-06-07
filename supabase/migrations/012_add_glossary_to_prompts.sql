-- Добавление глоссария, библиографии и калькуляторов в таблицу prompts
-- Теперь будет 5 записей: system, blocks, glossary, bibliography, calculators

-- Обновляем constraint чтобы разрешить glossary, bibliography и calculators
ALTER TABLE public.prompts DROP CONSTRAINT IF EXISTS prompts_id_check;
ALTER TABLE public.prompts ADD CONSTRAINT prompts_id_check CHECK (id IN ('system', 'blocks', 'glossary', 'bibliography', 'calculators'));

-- Вставляем начальные записи
INSERT INTO public.prompts (id, content, updated_by) 
VALUES 
  ('glossary', 'Глоссарий будет загружен при первом запуске бота', NULL),
  ('bibliography', 'Библиография будет загружена при первом запуске бота', NULL),
  ('calculators', 'Калькуляторы будут загружены при первом запуске бота', NULL)
ON CONFLICT (id) DO NOTHING;

-- Обновляем комментарий
COMMENT ON TABLE public.prompts IS 'Промпты для ИИ системы (5 записей: system, blocks, glossary, bibliography, calculators)';
COMMENT ON COLUMN public.prompts.id IS 'Тип промпта: system (системный), blocks (этапы), glossary (глоссарий терминов), bibliography (библиография первоисточников), calculators (инструменты расчета)';
