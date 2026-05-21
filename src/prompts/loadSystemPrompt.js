import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(__dirname, 'lapis-system.txt');

let cachedPrompt = null;

/**
 * Системный промпт только на сервере. Не экспортировать клиенту / в Telegram.
 */
export function getSystemPrompt() {
  if (!cachedPrompt) {
    cachedPrompt = readFileSync(PROMPT_PATH, 'utf8');
  }
  return cachedPrompt;
}
