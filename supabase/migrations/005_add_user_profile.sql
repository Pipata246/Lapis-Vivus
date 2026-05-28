-- Migration: 005_add_user_profile
-- Description: Добавление колонки profile для хранения итогового JSON-профиля пользователя
-- Применение: Supabase Dashboard → SQL Editor → выполнить после 004_block_results_v21.sql

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile JSONB;

COMMENT ON COLUMN public.users.profile IS 'Итоговый JSON-профиль пользователя после завершения всех блоков анализа (перезаписывается при новом прогоне)';
