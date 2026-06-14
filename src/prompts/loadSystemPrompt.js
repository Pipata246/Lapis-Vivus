import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../db/supabase.js';
import { loadPromptConfig } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'lapis-system.txt');
const CORE_PATH = path.join(__dirname, 'lapis-core.txt');
const BLOCKS_PATH = path.join(__dirname, 'lapis-blocks-v31.txt');
const BLOCKS_LEGACY_PATH = path.join(__dirname, 'lapis-blocks.txt');
const GLOSSARY_PATH = path.join(__dirname, 'glossary.txt');
const BIBLIOGRAPHY_PATH = path.join(__dirname, 'bibliography.txt');
const CALCULATORS_PATH = path.join(__dirname, 'calculators.txt');

const promptCache = new Map();
let blockSectionsCache = null;
let bibliographySectionsCache = null;

function readLocalFile(primaryPath, legacyPath = null) {
  try {
    return readFileSync(primaryPath, 'utf8');
  } catch {
    if (legacyPath) return readFileSync(legacyPath, 'utf8');
    throw new Error(`Файл промпта не найден: ${primaryPath}`);
  }
}

/** 2B.1 → 2B, 3C_1 → 3C_1, 1A → 1A */
export function resolveBlockSectionKey(blockId) {
  if (!blockId) return null;
  if (/^2B\./.test(blockId)) return '2B';
  if (/^2G\./.test(blockId)) return '2G';
  if (/^3B\./.test(blockId)) return '3B';
  if (/^3\./.test(blockId)) return '3';
  if (/^3C_\d/.test(blockId)) return blockId;
  if (blockId === '3C') return '3C';
  return blockId.split('.')[0];
}

/** 2B.1 → 2b, 3C_1 → 3c_1 — ключ для секции bibliography (# Шаг: 1A) */
export function resolveBibliographySectionKey(blockId) {
  return resolveBlockSectionKey(blockId)?.toLowerCase() ?? null;
}

function parseBibliographySections(bibliographyText) {
  const map = new Map();
  const re = /^# Шаг:\s*(\S+)/gim;
  const starts = [];
  let match;

  while ((match = re.exec(bibliographyText)) !== null) {
    starts.push({ key: match[1].toLowerCase(), index: match.index });
  }

  for (let i = 0; i < starts.length; i += 1) {
    const end = starts[i + 1]?.index ?? bibliographyText.length;
    map.set(starts[i].key, bibliographyText.slice(starts[i].index, end).trim());
  }

  return map;
}

function extractBibliographySection(bibliographyText, blockId) {
  const cfg = loadPromptConfig();
  if (cfg.bibliographyMode === 'full' || !blockId) {
    return bibliographyText;
  }

  const sections = bibliographySectionsCache ?? parseBibliographySections(bibliographyText);
  bibliographySectionsCache = sections;

  const key = resolveBibliographySectionKey(blockId);
  const section = sections.get(key);
  if (!section) {
    console.warn(`[Prompts] Секция bibliography ${blockId} (key=${key}) не найдена, fallback full`);
    return bibliographyText;
  }

  return `# ACTIVE_BIBLIOGRAPHY_ONLY · step ${key}\n${section}`;
}

function parseBlockSections(blocksText) {
  const map = new Map();
  const re = /^# ITERATIVE_BLOCK_([^\s:]+):/gm;
  const starts = [];
  let match;

  while ((match = re.exec(blocksText)) !== null) {
    starts.push({ key: match[1], index: match.index });
  }

  for (let i = 0; i < starts.length; i += 1) {
    const end = starts[i + 1]?.index ?? blocksText.length;
    map.set(starts[i].key, blocksText.slice(starts[i].index, end).trim());
  }

  return map;
}

function extractBlockSection(blocksText, blockId) {
  const sections = blockSectionsCache ?? parseBlockSections(blocksText);
  blockSectionsCache = sections;

  const key = resolveBlockSectionKey(blockId);
  const section = sections.get(key);
  if (!section) {
    console.warn(`[Prompts] Секция блока ${blockId} (key=${key}) не найдена, fallback на full blocks`);
    return blocksText;
  }

  const stepHint =
    blockId.includes('.') || blockId.includes('_')
      ? `\n\n# SERVER_STEP: ${blockId} (поквартальный/подшаг текущей итерации)\n`
      : '';

  return `# ACTIVE_BLOCK_ONLY mode · section ${key}\n${stepHint}${section}`;
}

function cacheKey(options = {}) {
  const cfg = loadPromptConfig();
  return JSON.stringify({
    ...cfg,
    blockId: options.blockId ?? null,
  });
}

function logPromptStats(parts, total) {
  const cfg = loadPromptConfig();
  if (!cfg.debug) return;

  console.log('[Prompts] ── сборка промпта ──');
  for (const [name, text] of Object.entries(parts)) {
    console.log(`  ${name}: ${text.length.toLocaleString()} chars (~${Math.round(text.length / 4)} tok)`);
  }
  console.log(`  TOTAL: ${total.length.toLocaleString()} chars (~${Math.round(total.length / 4)} tok)`);
  console.log(`  source: ${cfg.useDb ? 'DB' : 'files'}, blocks: ${cfg.blocksMode}`);
}

async function initializePromptsInDB() {
  const supabase = getSupabase();

  try {
    const { data: existing } = await supabase
      .from('prompts')
      .select('id, content')
      .in('id', ['system', 'blocks', 'glossary', 'bibliography', 'calculators']);

    const hasSystem = existing?.some((p) => p.id === 'system' && p.content.length > 100);
    const hasBlocks = existing?.some((p) => p.id === 'blocks' && p.content.length > 100);
    const hasGlossary = existing?.some((p) => p.id === 'glossary' && p.content.length > 100);
    const hasBibliography = existing?.some((p) => p.id === 'bibliography' && p.content.length > 100);
    const hasCalculators = existing?.some((p) => p.id === 'calculators' && p.content.length > 100);

    if (hasSystem && hasBlocks && hasGlossary && hasBibliography && hasCalculators) {
      return;
    }

    const systemPrompt = readLocalFile(SYSTEM_PROMPT_PATH);
    const blocksPrompt = readLocalFile(BLOCKS_PATH, BLOCKS_LEGACY_PATH);
    const glossary = readLocalFile(GLOSSARY_PATH);
    const bibliography = readLocalFile(BIBLIOGRAPHY_PATH);
    const calculators = readLocalFile(CALCULATORS_PATH);

    if (!hasSystem) {
      await supabase.from('prompts').upsert({ id: 'system', content: systemPrompt }, { onConflict: 'id' });
    }
    if (!hasBlocks) {
      await supabase.from('prompts').upsert({ id: 'blocks', content: blocksPrompt }, { onConflict: 'id' });
    }
    if (!hasGlossary) {
      await supabase.from('prompts').upsert({ id: 'glossary', content: glossary }, { onConflict: 'id' });
    }
    if (!hasBibliography) {
      await supabase.from('prompts').upsert({ id: 'bibliography', content: bibliography }, { onConflict: 'id' });
    }
    if (!hasCalculators) {
      await supabase.from('prompts').upsert({ id: 'calculators', content: calculators }, { onConflict: 'id' });
    }
  } catch (err) {
    console.error('[Prompts] Ошибка инициализации:', err.message);
  }
}

async function loadPromptPart(promptId, fileLoader) {
  const cfg = loadPromptConfig();

  if (cfg.useDb) {
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.from('prompts').select('content').eq('id', promptId).single();
      if (!error && data?.content && data.content.length >= 100) {
        return data.content;
      }
    } catch (err) {
      console.warn(`[Prompts] DB ${promptId}: ${err.message}, fallback file`);
    }
  }

  return fileLoader();
}

async function loadBlocksText() {
  return loadPromptPart('blocks', () => readLocalFile(BLOCKS_PATH, BLOCKS_LEGACY_PATH));
}

async function loadSystemCoreText() {
  // prompts.system в Supabase = lapis-system.txt (1:1, без lapis-core)
  return loadPromptPart('system', () => readLocalFile(SYSTEM_PROMPT_PATH));
}

/**
 * @param {{ blockId?: string }} [options] — blockId для single-секции blocks/bibliography
 */
export async function getSystemPrompt(options = {}) {
  const key = cacheKey(options);
  if (promptCache.has(key)) {
    return promptCache.get(key);
  }

  const cfg = loadPromptConfig();
  if (cfg.useDb) {
    await initializePromptsInDB();
  }

  const parts = {};

  parts.system = await loadSystemCoreText();

  if (cfg.includeGlossary) {
    parts.glossary = await loadPromptPart('glossary', () => readLocalFile(GLOSSARY_PATH));
  }
  if (cfg.includeBibliography) {
    const bibliographyFull = await loadPromptPart('bibliography', () => readLocalFile(BIBLIOGRAPHY_PATH));
    parts.bibliography =
      cfg.bibliographyMode === 'single' && options.blockId
        ? extractBibliographySection(bibliographyFull, options.blockId)
        : bibliographyFull;
  }
  if (cfg.includeCalculators) {
    parts.calculators = await loadPromptPart('calculators', () => readLocalFile(CALCULATORS_PATH));
  }

  const blocksFull = await loadBlocksText();
  if (cfg.blocksMode === 'single' && options.blockId) {
    parts.blocks = extractBlockSection(blocksFull, options.blockId);
  } else {
    parts.blocks = blocksFull;
  }

  const total = Object.values(parts).filter(Boolean).join('\n\n');
  logPromptStats(parts, total);

  promptCache.set(key, total);
  return total;
}

export function clearPromptCache() {
  promptCache.clear();
  blockSectionsCache = null;
  bibliographySectionsCache = null;
}

export async function updatePrompt(promptId, content, adminId) {
  if (!['system', 'blocks', 'glossary', 'bibliography', 'calculators'].includes(promptId)) {
    throw new Error('Некорректный ID промпта. Допустимые: system, blocks, glossary, bibliography, calculators');
  }

  if (!content || content.trim().length < 10) {
    throw new Error('Промпт слишком короткий');
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('prompts').upsert(
    {
      id: promptId,
      content: content.trim(),
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(`Не удалось обновить промпт: ${error.message}`);
  }

  clearPromptCache();
  console.log(`[Prompts] Промпт ${promptId} обновлен админом ${adminId}`);
}

export async function getPromptInfo(promptId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('prompts').select('id, updated_at, updated_by').eq('id', promptId).single();
  if (error) return null;
  return data;
}
