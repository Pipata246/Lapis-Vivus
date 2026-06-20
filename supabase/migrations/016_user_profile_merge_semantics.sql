-- Migration: 016_user_profile_merge_semantics
-- Description: Комментарий к накопительному профилю (merge по block_id в приложении)

COMMENT ON COLUMN public.users.profile IS
  'Накопительный JSON-профиль: user_data + blocks{block_id}. '
  'Полный прогон и точечные сессии дополняют blocks без затирания других модулей. '
  'schema_version: 1';
