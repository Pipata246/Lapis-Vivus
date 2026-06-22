-- Single-message navigation: id активного сообщения бота в Telegram
-- Требует public.user_sessions (миграция 003_create_user_sessions.sql)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_sessions'
  ) THEN
    ALTER TABLE public.user_sessions
      ADD COLUMN IF NOT EXISTS ui_message_id BIGINT;

    COMMENT ON COLUMN public.user_sessions.ui_message_id IS
      'Telegram message_id активного экрана бота';
  ELSE
    RAISE EXCEPTION
      'Таблица public.user_sessions не найдена. Сначала выполните миграцию 003_create_user_sessions.sql';
  END IF;
END $$;
