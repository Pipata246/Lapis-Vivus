/**
 * JSON уходит в БД; в Telegram — только метакомментарии (без ```json).
 */

// Более агрессивные regex для удаления JSON
const JSON_FENCE_RE = /```json[\s\S]*?```/gi;
const JSON_INLINE_RE = /```json\{[\s\S]*?\}```/gi;
const JSON_RAW_RE = /\{[\s\n]*"блок_[^}]+\}[\s\n]*\}/gi;

/**
 * Конвертирует markdown в Telegram MarkdownV2 формат
 */
function convertToTelegramMarkdown(text) {
  let result = text;

  // Заменяем ## заголовки на жирный текст с переносом
  result = result.replace(/^##\s+(.+)$/gm, '\n*$1*\n');
  
  // Заменяем **текст** на *текст* (жирный в Telegram)
  result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  
  // Убираем лишние пустые строки (больше 2 подряд)
  result = result.replace(/\n{3,}/g, '\n\n');
  
  // Убираем пробелы в начале и конце
  result = result.trim();
  
  return result;
}

export function extractJsonFromAnswer(rawAnswer) {
  // Ищем JSON в разных форматах
  let match = rawAnswer.match(/```json\s*([\s\S]*?)```/i);
  
  if (!match) {
    // Пробуем найти JSON без fence
    match = rawAnswer.match(/(\{[\s\S]*?"блок_[^}]+\}[\s\S]*?\})/i);
  }
  
  if (!match) {
    return { jsonRaw: null, jsonParsed: null, suggestedPrompts: [] };
  }

  const jsonRaw = match[1].trim();
  let jsonParsed = null;
  let suggestedPrompts = [];
  
  try {
    jsonParsed = JSON.parse(jsonRaw);
    
    // Извлекаем suggested_prompts из JSON (может быть вложен)
    let prompts = jsonParsed?.suggested_prompts;
    
    // Если JSON обёрнут в ключ с именем блока
    if (!prompts) {
      const blockKey = Object.keys(jsonParsed).find(k => k.includes('блок_'));
      if (blockKey) {
        prompts = jsonParsed[blockKey]?.suggested_prompts;
      }
    }
    
    if (prompts && Array.isArray(prompts)) {
      suggestedPrompts = prompts
        .filter(p => typeof p === 'string' && p.trim().length > 0)
        .map(p => p.trim().slice(0, 40))
        .slice(0, 3);
    }
    
    // ТОЛЬКО если ИИ вообще не добавил поле — используем fallback
    if (!prompts) {
      console.warn('⚠️ ИИ не сгенерировал suggested_prompts, используем fallback');
      suggestedPrompts = [
        'Как применить это в жизни?',
        'Расскажи подробнее',
        'Что делать с этой информацией?',
      ];
    }
  } catch (err) {
    console.error('Ошибка парсинга JSON:', err.message);
    jsonParsed = { _parse_error: true, raw: jsonRaw };
    suggestedPrompts = [
      'Как применить это в жизни?',
      'Расскажи подробнее',
      'Что делать с этой информацией?',
    ];
  }

  return { jsonRaw, jsonParsed, suggestedPrompts };
}

export function extractMetacomments(rawAnswer, maxLen = 4000) {
  let visible = rawAnswer;
  
  // Удаляем JSON в разных форматах (агрессивно)
  visible = visible.replace(JSON_FENCE_RE, '');
  visible = visible.replace(JSON_INLINE_RE, '');
  visible = visible.replace(JSON_RAW_RE, '');
  
  // Удаляем строки которые начинаются с { или }
  visible = visible.replace(/^[\s]*[\{\}][\s]*$/gm, '');
  
  // Удаляем все code fences
  visible = visible.replace(/^```[a-z]*\s*$/gim, '');
  visible = visible.replace(/^```\s*$/gim, '');
  
  visible = visible.trim();

  // Конвертируем в Telegram Markdown
  visible = convertToTelegramMarkdown(visible);

  if (visible.length > maxLen) {
    visible = `${visible.slice(0, maxLen)}\n…[усечено]`;
  }

  return visible;
}

export function formatBlockForUser(rawAnswer, blockId, blockTitle) {
  const visible = extractMetacomments(rawAnswer, 50000);

  if (!visible) {
    return (
      `📦 *Блок ${blockId}: ${blockTitle}*\n\n` +
      'Анализ блока выполнен. Структурированные данные сохранены в системе.\n\n' +
      'Нажми «Следующий блок», чтобы продолжить.'
    );
  }

  return `📦 *Блок ${blockId}: ${blockTitle}*\n\n${visible}`;
}

export function splitTelegramMessages(text, maxLen = 4096) {
  if (text.length <= maxLen) {
    return [text];
  }

  const parts = [];
  let rest = text;
  while (rest.length > 0) {
    parts.push(rest.slice(0, maxLen));
    rest = rest.slice(maxLen);
  }
  return parts;
}
