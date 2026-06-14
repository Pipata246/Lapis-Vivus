/**
 * Оценка размера промпта. Запуск: node scripts/audit-prompt-size.js
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveBlockSectionKey, resolveBibliographySectionKey } from '../src/prompts/loadSystemPrompt.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const prompts = path.join(root, 'src/prompts');

function size(name, text) {
  const chars = text.length;
  console.log(`  ${name}: ${chars.toLocaleString()} chars (~${Math.round(chars / 4).toLocaleString()} tok)`);
  return chars;
}

const system = readFileSync(path.join(prompts, 'lapis-system.txt'), 'utf8');
const blocks = readFileSync(path.join(prompts, 'lapis-blocks-v31.txt'), 'utf8');
const glossary = readFileSync(path.join(prompts, 'glossary.txt'), 'utf8');
const bibliography = readFileSync(path.join(prompts, 'bibliography.txt'), 'utf8');
const calculators = readFileSync(path.join(prompts, 'calculators.txt'), 'utf8');

console.log('=== БЫЛО (full blocks + glossary + bibliography + calculators) ===');
const oldTotal =
  size('system', system) +
  size('glossary', glossary) +
  size('bibliography', bibliography) +
  size('calculators', calculators) +
  size('blocks FULL', blocks);
console.log(`  TOTAL: ~${Math.round(oldTotal / 4).toLocaleString()} tok\n`);

console.log('=== СЕЙЧАС (single block + single bibliography, без calculators) ===');
const key = resolveBlockSectionKey('1A');
const re = new RegExp(`^# ITERATIVE_BLOCK_${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm');
const idx = blocks.search(re);
const next = blocks.slice(idx + 1).search(/^# ITERATIVE_BLOCK_/m);
const section = next >= 0 ? blocks.slice(idx, idx + 1 + next) : blocks.slice(idx);
const newTotal =
  size('system', system) +
  size('glossary', glossary) +
  size(`blocks SINGLE (${key})`, section);
console.log(`  TOTAL (no bib): ~${Math.round(newTotal / 4).toLocaleString()} tok`);

console.log('\n=== + bibliography single 1A ===');
const bibRe = /^# Шаг:\s*1A/im;
const bibIdx = bibliography.search(bibRe);
const bibNext = bibliography.slice(bibIdx + 1).search(/^# Шаг:/im);
const bibSection = bibNext >= 0 ? bibliography.slice(bibIdx, bibIdx + 1 + bibNext) : bibliography.slice(bibIdx);
const withBib = newTotal + size('bibliography SINGLE (1a)', bibSection);
console.log(`  TOTAL: ~${Math.round(withBib / 4).toLocaleString()} tok`);
