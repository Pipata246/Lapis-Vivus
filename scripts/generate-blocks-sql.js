/**
 * Генерирует SQL для обновления prompts.blocks из lapis-blocks-v31.txt
 * Запуск: node scripts/generate-blocks-sql.js
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const blocksPath = path.join(root, 'src/prompts/lapis-blocks-v31.txt');
const outPath = path.join(root, 'supabase/migrations/015_update_blocks_prompt_v31.sql');

const content = readFileSync(blocksPath, 'utf8');
const tag = '$lapis_blocks_v31$';

if (content.includes(tag)) {
  throw new Error(`Content contains delimiter ${tag}`);
}

const sql = `-- Migration: 015_update_blocks_prompt_v31
-- Description: Обновление prompts.blocks → реестр v3.1 (EXECUTION_ENGINE_V3.1)
-- Source: prompt_analiz_lapis_vivus_66_iterative_blocks_3.pdf
--
-- КАК ПРИМЕНИТЬ:
-- 1. Supabase Dashboard → SQL Editor → вставить и выполнить этот файл целиком
-- 2. Или через админку бота: «Модули анализа» → вставить текст из src/prompts/lapis-blocks-v31.txt
--
-- После применения перезапусти бота (сброс кэша промпта) или redeploy на Vercel.

UPDATE public.prompts
SET
  content = ${tag}
${content}${tag},
  updated_at = NOW()
WHERE id = 'blocks';

-- Проверка:
-- SELECT id, length(content) AS chars, updated_at FROM public.prompts WHERE id = 'blocks';
`;

writeFileSync(outPath, sql, 'utf8');
console.log(`Written ${outPath} (${sql.length} bytes, blocks ${content.length} chars)`);
