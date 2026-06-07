-- Добавление глоссария в таблицу prompts
-- Теперь будет 3 записи: system, blocks, glossary

-- Обновляем constraint чтобы разрешить glossary
ALTER TABLE public.prompts DROP CONSTRAINT IF EXISTS prompts_id_check;
ALTER TABLE public.prompts ADD CONSTRAINT prompts_id_check CHECK (id IN ('system', 'blocks', 'glossary'));

-- Вставляем начальную запись для глоссария
INSERT INTO public.prompts (id, content, updated_by) 
VALUES ('glossary', 'Глоссарий будет загружен при первом запуске бота', NULL)
ON CONFLICT (id) DO NOTHING;

-- Обновляем комментарий
COMMENT ON TABLE public.prompts IS 'Промпты для ИИ системы (3 записи: system, blocks, glossary)';
COMMENT ON COLUMN public.prompts.id IS 'Тип промпта: system (системный), blocks (этапы), glossary (глоссарий терминов)';
