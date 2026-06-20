-- Migration: 015_add_diagnostic_tree_routing
-- Description: Маршрутизация сессии через дерево целей (targeted vs full)

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS session_mode TEXT NOT NULL DEFAULT 'full'
    CHECK (session_mode IN ('full', 'targeted')),
  ADD COLUMN IF NOT EXISTS target_block_id TEXT,
  ADD COLUMN IF NOT EXISTS goal_tree_path JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_sessions.session_mode IS
  'full = полный маршрут; targeted = один модуль после diagnostic tree';
COMMENT ON COLUMN public.user_sessions.target_block_id IS
  'ID целевого блока (1A–1E) при session_mode = targeted';
COMMENT ON COLUMN public.user_sessions.goal_tree_path IS
  'JSON-массив пройденных узлов дерева: [{node, variant, label}, ...]';

CREATE INDEX IF NOT EXISTS idx_user_sessions_session_mode
  ON public.user_sessions (session_mode)
  WHERE session_mode = 'targeted';
