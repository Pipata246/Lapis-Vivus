-- Добавление колонки admin в таблицу users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Индекс для быстрого поиска админов
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users (is_admin) WHERE is_admin = TRUE;

-- Комментарий к колонке
COMMENT ON COLUMN public.users.is_admin IS 'Флаг администратора системы';
