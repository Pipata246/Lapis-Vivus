import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabase } from '../db/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'lapis-system.txt');
const CORE_PATH = path.join(__dirname, 'lapis-core.txt');
const BLOCKS_PATH = path.join(__dirname, 'lapis-blocks.txt');
const GLOSSARY_PATH = path.join(__dirname, 'glossary.txt');

let cachedPrompt = null;

/**
 * Инициализация промптов в БД из файлов (только при первом запуске)
 */
async function initializePromptsInDB() {
  const supabase = getSupabase();
  
  try {
    // Проверяем есть ли уже промпты в БД
    const { data: existing } = await supabase
      .from('prompts')
      .select('id, content')
      .in('id', ['system', 'blocks', 'glossary']);
    
    // Если промпты уже есть и не пустые - не перезаписываем
    const hasSystem = existing?.some(p => p.id === 'system' && p.content.length > 100);
    const hasBlocks = existing?.some(p => p.id === 'blocks' && p.content.length > 100);
    const hasGlossary = existing?.some(p => p.id === 'glossary' && p.content.length > 100);
    
    if (hasSystem && hasBlocks && hasGlossary) {
      return; // Промпты уже инициализированы
    }
    
    // Читаем файлы
    const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
    const corePrompt = readFileSync(CORE_PATH, 'utf8');
    const blocksPrompt = readFileSync(BLOCKS_PATH, 'utf8');
    const glossary = readFileSync(GLOSSARY_PATH, 'utf8');
    
    // Объединяем system и core в один промпт (БЕЗ глоссария - он отдельно)
    const combinedSystem = systemPrompt + '\n\n' + corePrompt;
    
    // Обновляем в БД
    if (!hasSystem) {
      await supabase
        .from('prompts')
        .upsert({ id: 'system', content: combinedSystem }, { onConflict: 'id' });
      console.log('[Prompts] Системный промпт инициализирован в БД');
    }
    
    if (!hasBlocks) {
      await supabase
        .from('prompts')
        .upsert({ id: 'blocks', content: blocksPrompt }, { onConflict: 'id' });
      console.log('[Prompts] Блоки инициализированы в БД');
    }
    
    if (!hasGlossary) {
      await supabase
        .from('prompts')
        .upsert({ id: 'glossary', content: glossary }, { onConflict: 'id' });
      console.log('[Prompts] Глоссарий инициализирован в БД');
    }
  } catch (err) {
    console.error('[Prompts] Ошибка инициализации:', err.message);
    // Fallback на файлы
  }
}

/**
 * Загрузка промпта из БД
 */
async function loadPromptFromDB(promptId) {
  const supabase = getSupabase();
  
  try {
    const { data, error } = await supabase
      .from('prompts')
      .select('content')
      .eq('id', promptId)
      .single();
    
    if (error) throw error;
    return data?.content || null;
  } catch (err) {
    console.error(`[Prompts] Ошибка загрузки ${promptId}:`, err.message);
    return null;
  }
}

/**
 * Системный промпт — загружается из БД с fallback на файлы.
 * Объединяет system + blocks.
 */
export async function getSystemPrompt() {
  if (cachedPrompt) {
    return cachedPrompt;
  }
  
  // Инициализируем БД при первом запросе
  await initializePromptsInDB();
  
  // Загружаем из БД
  let systemPrompt = await loadPromptFromDB('system');
  let blocksPrompt = await loadPromptFromDB('blocks');
  let glossary = await loadPromptFromDB('glossary');
  
  // Fallback на файлы если в БД пусто
  if (!systemPrompt || systemPrompt.length < 100) {
    console.warn('[Prompts] Системный промпт не найден в БД, используем файлы');
    const systemFile = readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
    const coreFile = readFileSync(CORE_PATH, 'utf8');
    systemPrompt = systemFile + '\n\n' + coreFile;
  }
  
  if (!blocksPrompt || blocksPrompt.length < 100) {
    console.warn('[Prompts] Блоки не найдены в БД, используем файлы');
    blocksPrompt = readFileSync(BLOCKS_PATH, 'utf8');
  }
  
  if (!glossary || glossary.length < 100) {
    console.warn('[Prompts] Глоссарий не найден в БД, используем файлы');
    glossary = readFileSync(GLOSSARY_PATH, 'utf8');
  }
  
  cachedPrompt = systemPrompt + '\n\n' + glossary + '\n\n' + blocksPrompt;
  return cachedPrompt;
}

/**
 * Обновление промпта в БД (вызывается из админки)
 */
export async function updatePrompt(promptId, content, adminId) {
  if (!['system', 'blocks', 'glossary'].includes(promptId)) {
    throw new Error('Некорректный ID промпта. Допустимые: system, blocks, glossary');
  }
  
  if (!content || content.trim().length < 10) {
    throw new Error('Промпт слишком короткий');
  }
  
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from('prompts')
    .upsert({
      id: promptId,
      content: content.trim(),
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  
  if (error) {
    throw new Error(`Не удалось обновить промпт: ${error.message}`);
  }
  
  // Сбрасываем кэш
  cachedPrompt = null;
  console.log(`[Prompts] Промпт ${promptId} обновлен админом ${adminId}`);
}

/**
 * Получение информации о промпте
 */
export async function getPromptInfo(promptId) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('prompts')
    .select('id, updated_at, updated_by')
    .eq('id', promptId)
    .single();
  
  if (error) return null;
  return data;
}
