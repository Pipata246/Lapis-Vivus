# Supabase — миграции

## Порядок миграций

| Файл | Описание |
|------|----------|
| `001_create_users.sql` | Пользователи Telegram |
| `002_create_user_chats.sql` | Чаты и сообщения |
| `003_create_user_sessions.sql` | Сценарий FSM и результаты блоков |

Выполняй по порядку в **SQL Editor** Supabase.

## Безопасность

- RLS включён, публичных политик нет.
- Доступ только через `SUPABASE_SERVICE_ROLE_KEY` на бэкенде (Vercel).
- Системный промпт Lapis хранится в `src/prompts/` на сервере, в БД не попадает.
