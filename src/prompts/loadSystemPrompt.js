import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'lapis-system.txt');
const BLOCKS_PATH = path.join(__dirname, 'lapis-blocks.txt');

let cachedPrompt = null;

/**
 * Системный промпт только на сервере. Не экспортировать клиенту / в Telegram.
 * Объединяет основной промпт и список блоков.
 */
export function getSystemPrompt() {
  if (!cachedPrompt) {
    const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
    const blocks = readFileSync(BLOCKS_PATH, 'utf8');
    
    // Объединяем промпт и блоки
    cachedPrompt = systemPrompt + '\n\n' + blocks;
  }
  return cachedPrompt;
}
