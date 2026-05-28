-- Таблица для хранения файлов пользователей
CREATE TABLE IF NOT EXISTS user_files (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES user_chats(id) ON DELETE CASCADE,
  block_id VARCHAR(10),
  file_name VARCHAR(255),
  file_type VARCHAR(50) NOT NULL,        -- 'image', 'pdf', 'docx', 'text', 'other'
  mime_type VARCHAR(100),
  file_size BIGINT,
  storage_path TEXT,                      -- путь в Supabase Storage
  public_url TEXT,                        -- публичный URL файла
  extracted_text TEXT,                    -- извлечённый текст для ИИ
  telegram_file_id TEXT,                  -- оригинальный file_id из Telegram
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_chat_id ON user_files(chat_id);
CREATE INDEX IF NOT EXISTS idx_user_files_block_id ON user_files(block_id);

-- Комментарии к полям
COMMENT ON TABLE user_files IS 'Хранилище файлов пользователей для анализа';
COMMENT ON COLUMN user_files.user_id IS 'ID пользователя из таблицы users';
COMMENT ON COLUMN user_files.chat_id IS 'ID чата из таблицы user_chats';
COMMENT ON COLUMN user_files.block_id IS 'ID блока анализа (1A, 1B, 2, 3, 3B, etc.)';
COMMENT ON COLUMN user_files.file_type IS 'Тип файла: image, pdf, docx, text, other';
COMMENT ON COLUMN user_files.storage_path IS 'Путь к файлу в Supabase Storage bucket';
COMMENT ON COLUMN user_files.extracted_text IS 'Извлечённый текст для передачи в ИИ';
COMMENT ON COLUMN user_files.telegram_file_id IS 'Оригинальный file_id из Telegram API';
