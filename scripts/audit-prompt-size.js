/**
 * Оценка размера промпта. Запуск: node scripts/audit-prompt-size.js
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveBlockSectionKey } from '../src/prompts/loadSystemPrompt.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const prompts = path.join(root, 'src/prompts');

function size(name, text) {
  const chars = text.length;
  console.log(`  ${name}: ${chars.toLocaleString()} chars (~${Math.round(chars / 4).toLocaleString()} tok)`);
  return chars;
}

const system = readFileSync(path.join(prompts, 'lapis-system.txt'), 'utf8');
const core = readFileSync(path.join(prompts, 'lapis-core.txt'), 'utf8');
const blocks = readFileSync(path.join(prompts, 'lapis-blocks-v31.txt'), 'utf8');
const glossary = readFileSync(path.join(prompts, 'glossary.txt'), 'utf8');
const bibliography = readFileSync(path.join(prompts, 'bibliography.txt'), 'utf8');
const calculators = readFileSync(path.join(prompts, 'calculators.txt'), 'utf8');

console.log('=== БЫЛО (full + calculators в system) ===');
const oldTotal =
  size('system+core', system + core) +
  size('glossary', glossary) +
  size('bibliography', bibliography) +
  size('calculators', calculators) +
  size('blocks FULL', blocks);
console.log(`  TOTAL: ~${Math.round(oldTotal / 4).toLocaleString()} tok\n`);

console.log('=== СТАЛО (single block 1A, без calculators) ===');
const key = resolveBlockSectionKey('1A');
const re = new RegExp(`^# ITERATIVE_BLOCK_${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm');
const idx = blocks.search(re);
const next = blocks.slice(idx + 1).search(/^# ITERATIVE_BLOCK_/m);
const section = next >= 0 ? blocks.slice(idx, idx + 1 + next) : blocks.slice(idx);

const newTotal =
  size('system+core', system + core) +
  size('glossary', glossary) +
  size('bibliography', bibliography) +
  size(`blocks SINGLE (${key})`, section);
console.log(`  TOTAL: ~${Math.round(newTotal / 4).toLocaleString()} tok`);
