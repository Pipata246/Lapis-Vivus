-- Migration: 007_update_block_ids_v26
-- Description: Обновление списка допустимых block_id для версии v26.9 (32 блока)
-- Применение: Supabase Dashboard → SQL Editor → выполнить после 006_add_session_start_at.sql

-- ВАЖНО: Эта миграция сначала удаляет constraint, чтобы можно было работать с существующими данными

-- Шаг 1: Удаляем старый constraint
ALTER TABLE public.analysis_block_results
  DROP CONSTRAINT IF EXISTS analysis_block_results_block_id_check;

-- Шаг 2: Добавляем новый constraint с полным списком блоков v26.9
-- Включаем как старые блоки (для совместимости), так и новые
ALTER TABLE public.analysis_block_results
  ADD CONSTRAINT analysis_block_results_block_id_check CHECK (
    block_id IN (
      -- Блоки v21.5 (старые, для совместимости с существующими данными)
      '1A', '1B', '1C', '1D', '2', '3', '3B', '4', '4B', '5',
      -- Новые блоки v26.9
      '1E',
      '2A', '2B', '2C', '2D', '2E', '2F',
      '3_ARES', '3_TAURUS', '3_GEMINI', '3_CANCER', '3_LEO', '3_VIRGO',
      '3_LIBRA', '3_SCORPIO', '3_SAGITTARIUS', '3_CAPRICORN', '3_AQUARIUS', '3_PISCES',
      '3C',
      '4A', '4C', '4D',
      '5A', '5B'
    )
  );

COMMENT ON CONSTRAINT analysis_block_results_block_id_check ON public.analysis_block_results 
  IS 'Допустимые block_id для протокола v26.9 (32 новых блока + старые для совместимости)';

-- Опционально: Если хотите очистить старые данные, раскомментируйте следующую строку
-- DELETE FROM public.analysis_block_results WHERE block_id IN ('2', '3', '4', '5');
