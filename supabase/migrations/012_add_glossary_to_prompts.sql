-- Добавление глоссария и библиографии в таблицу prompts
-- Теперь будет 4 записи: system, blocks, glossary, bibliography

-- Обновляем constraint чтобы разрешить glossary и bibliography
ALTER TABLE public.prompts DROP CONSTRAINT IF EXISTS prompts_id_check;
ALTER TABLE public.prompts ADD CONSTRAINT prompts_id_check CHECK (id IN ('system', 'blocks', 'glossary', 'bibliography'));

-- Вставляем начальные записи
INSERT INTO public.prompts (id, content, updated_by) 
VALUES 
  ('glossary', 'Глоссарий будет загружен при первом запуске бота', NULL),
  ('bibliography', 'Библиография будет загружена при первом запуске бота', NULL)
ON CONFLICT (id) DO NOTHING;

-- Обновляем комментарий
COMMENT ON TABLE public.prompts IS 'Промпты для ИИ системы (4 записи: system, blocks, glossary, bibliography)';
COMMENT ON COLUMN public.prompts.id IS 'Тип промпта: system (системный), blocks (этапы), glossary (глоссарий терминов), bibliography (библиография первоисточников)';
