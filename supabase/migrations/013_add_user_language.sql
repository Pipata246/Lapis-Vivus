-- Добавление поля language в таблицу users для мультиязычности
-- Поддерживаемые языки: en (английский, по умолчанию), ru (русский)

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS language VARCHAR(2) DEFAULT 'en' CHECK (language IN ('en', 'ru'));

COMMENT ON COLUMN public.users.language IS 'Язык интерфейса пользователя: en (английский), ru (русский)';

-- Устанавливаем английский для существующих пользователей
UPDATE public.users SET language = 'en' WHERE language IS NULL;