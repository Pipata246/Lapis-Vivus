-- Единое UI-сообщение бота (single-message navigation)
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS ui_message_id BIGINT;

COMMENT ON COLUMN user_sessions.ui_message_id IS 'Telegram message_id активного экрана бота';
