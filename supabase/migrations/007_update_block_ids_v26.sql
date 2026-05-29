-- Migration: 007_update_block_ids_v26
-- Description: Обновление списка допустимых block_id для версии v26.9 (32 блока)
-- Применение: Supabase Dashboard → SQL Editor → выполнить после 006_add_session_start_at.sql

-- Удаляем старый constraint
ALTER TABLE public.analysis_block_results
  DROP CONSTRAINT IF EXISTS analysis_block_results_block_id_check;

-- Добавляем новый constraint с полным списком блоков v26.9
ALTER TABLE public.analysis_block_results
  ADD CONSTRAINT analysis_block_results_block_id_check CHECK (
    block_id IN (
      '1A', '1B', '1C', '1D', '1E',
      '2A', '2B', '2C', '2D', '2E', '2F',
      '3_ARES', '3_TAURUS', '3_GEMINI', '3_CANCER', '3_LEO', '3_VIRGO',
      '3_LIBRA', '3_SCORPIO', '3_SAGITTARIUS', '3_CAPRICORN', '3_AQUARIUS', '3_PISCES',
      '3B', '3C',
      '4', '4A', '4B', '4C', '4D',
      '5A', '5B'
    )
  );

COMMENT ON CONSTRAINT analysis_block_results_block_id_check ON public.analysis_block_results 
  IS 'Допустимые block_id для протокола v26.9 (32 блока)';
