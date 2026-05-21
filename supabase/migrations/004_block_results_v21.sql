-- Migration: 004_block_results_v21
-- JSON отдельно, блоки 3B и 4B

ALTER TABLE public.analysis_block_results
  ADD COLUMN IF NOT EXISTS json_payload JSONB;

COMMENT ON COLUMN public.analysis_block_results.json_payload IS 'JSON-монолит блока (не показывается в Telegram)';

ALTER TABLE public.analysis_block_results
  DROP CONSTRAINT IF EXISTS analysis_block_results_block_id_check;

ALTER TABLE public.analysis_block_results
  ADD CONSTRAINT analysis_block_results_block_id_check CHECK (
    block_id IN ('1A', '1B', '1C', '1D', '2', '3', '3B', '4', '4B', '5')
  );
