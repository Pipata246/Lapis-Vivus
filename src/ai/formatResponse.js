/**
 * JSON уходит в БД; в Telegram — только метакомментарии (без ```json).
 */

const JSON_FENCE_RE = /```json\s*([\s\S]*?)```/i;

export function extractJsonFromAnswer(rawAnswer) {
  const match = rawAnswer.match(JSON_FENCE_RE);
  if (!match) {
    return { jsonRaw: null, jsonParsed: null, suggestedPrompts: [] };
  }

  const jsonRaw = match[1].trim();
  let jsonParsed = null;
  let suggestedPrompts = [];
  
  try {
    jsonParsed = JSON.parse(jsonRaw);
    
    // Извлекаем suggested_prompts из JSON
    if (jsonParsed?.suggested_prompts && Array.isArray(jsonParsed.suggested_prompts)) {
      suggestedPrompts = jsonParsed.suggested_prompts
        .filter(p => typeof p === 'string' && p.trim().length > 0)
        .map(p => p.trim().slice(0, 40)) // Ограничиваем длину
        .slice(0, 3); // Максимум 3 промпта
    }
  } catch {
    jsonParsed = { _parse_error: true, raw: jsonRaw };
  }

  return { jsonRaw, jsonParsed, suggestedPrompts };
}

export function extractMetacomments(rawAnswer, maxLen = 4000) {
  let visible = rawAnswer.replace(JSON_FENCE_RE, '').trim();
  visible = visible
    .replace(/^```[a-z]*\s*$/gim, '')
    .replace(/^```\s*$/gim, '')
    .trim();

  // НЕ обрезаем начало — оставляем весь текст кроме JSON
  // Метакомментарии будут в конце, но и остальной контент сохранится

  if (visible.length > maxLen) {
    visible = `${visible.slice(0, maxLen)}\n…[усечено]`;
  }

  return visible;
}

export function formatBlockForUser(rawAnswer, blockId, blockTitle) {
  const visible = extractMetacomments(rawAnswer, 50000);

  if (!visible) {
    return (
      `📦 Блок ${blockId}: ${blockTitle}\n\n` +
      'Анализ блока выполнен. Структурированные данные (JSON) сохранены в системе.\n\n' +
      'Нажми «Следующий блок», чтобы продолжить.'
    );
  }

  return `📦 Блок ${blockId}: ${blockTitle}\n\n${visible}`;
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
