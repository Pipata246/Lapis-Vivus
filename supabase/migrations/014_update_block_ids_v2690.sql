-- Migration: 014_update_block_ids_v2690
-- Description: Допустимые block_id для протокола v3.0_ORACLE_PREMIUM / v26.90 (36 блоков)

ALTER TABLE public.analysis_block_results
  DROP CONSTRAINT IF EXISTS analysis_block_results_block_id_check;

ALTER TABLE public.analysis_block_results
  ADD CONSTRAINT analysis_block_results_block_id_check CHECK (
    block_id IN (
      -- Legacy (совместимость)
      '1A', '1B', '1C', '1D', '2', '3', '3B', '4', '4B', '5',
      '2B', '2C', '2D', '2E', '2F',
      '3_ARES', '3_TAURUS', '3_GEMINI', '3_CANCER', '3_LEO', '3_VIRGO',
      '3_LIBRA', '3_SCORPIO', '3_SAGITTARIUS', '3_CAPRICORN', '3_AQUARIUS', '3_PISCES',
      '3C', '3C.1', '3C.2',
      -- v3.0_ORACLE_PREMIUM stack (36 steps)
      '1E',
      '2A', '2B.1', '2B.2', '2B.3', '2B.4',
      '2G.1', '2G.2', '2G.3', '2G.4',
      '3.1', '3.2', '3.3', '3.4',
      '3B.1', '3B.2', '3B.3', '3B.4',
      '3C_1', '3C_2', '3C_3',
      '4A', '4B', '4C', '4D', '4E', '4F', '4G',
      '5A', '5B'
    )
  );

COMMENT ON CONSTRAINT analysis_block_results_block_id_check ON public.analysis_block_results
  IS 'Допустимые block_id для v3.0_ORACLE_PREMIUM / v26.90 (36 блоков + legacy)';
