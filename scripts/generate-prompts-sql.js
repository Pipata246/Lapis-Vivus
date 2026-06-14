/**
 * SQL для обновления prompts.* из локальных файлов (mirror БД).
 * Запуск: node scripts/generate-prompts-sql.js
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'supabase/migrations');
mkdirSync(outDir, { recursive: true });

const jobs = [
  { id: 'system', file: 'src/prompts/lapis-system.txt', out: '016_update_system_prompt_v2690.sql' },
  { id: 'blocks', file: 'src/prompts/lapis-blocks-v31.txt', out: '015_update_blocks_prompt_v31.sql' },
  { id: 'bibliography', file: 'src/prompts/bibliography.txt', out: '017_update_bibliography_v2675.sql' },
  { id: 'calculators', file: 'src/prompts/calculators.txt', out: '018_update_calculators.sql' },
  { id: 'glossary', file: 'src/prompts/glossary.txt', out: '019_update_glossary.sql' },
];

for (const job of jobs) {
  const content = readFileSync(path.join(root, job.file), 'utf8');
  const tag = `$lapis_${job.id}$`;
  if (content.includes(tag)) throw new Error(`${job.id}: delimiter conflict`);

  const sql = `-- Migration: ${job.out}
-- prompts.id = '${job.id}' (локальный mirror: src/prompts/${path.basename(job.file)})

UPDATE public.prompts
SET content = ${tag}
${content}${tag},
    updated_at = NOW()
WHERE id = '${job.id}';
`;
  writeFileSync(path.join(outDir, job.out), sql, 'utf8');
  console.log(`OK ${job.out} (${content.length} chars)`);
}
