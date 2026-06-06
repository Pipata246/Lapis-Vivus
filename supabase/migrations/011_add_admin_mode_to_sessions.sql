-- Добавление поля admin_mode в таблицу user_sessions
ALTER TABLE public.user_sessions 
ADD COLUMN IF NOT EXISTS admin_mode TEXT;

COMMENT ON COLUMN public.user_sessions.admin_mode IS 'Режим админа: edit_system_prompt, edit_blocks или NULL';

-- Индекс для поиска админов в режиме редактирования
CREATE INDEX IF NOT EXISTS idx_sessions_admin_mode ON public.user_sessions (admin_mode) WHERE admin_mode IS NOT NULL;
