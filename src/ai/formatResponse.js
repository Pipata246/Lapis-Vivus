/**
 * JSON уходит в БД; в Telegram — только метакомментарии (без ```json).
 */

const JSON_FENCE_RE = /```json\s*([\s\S]*?)```/i;

export function extractJsonFromAnswer(rawAnswer) {
  const match = rawAnswer.match(JSON_FENCE_RE);
  if (!match) {
    return { jsonRaw: null, jsonParsed: null };
  }

  const jsonRaw = match[1].trim();
  let jsonParsed = null;
  try {
    jsonParsed = JSON.parse(jsonRaw);
  } catch {
    jsonParsed = { _parse_error: true, raw: jsonRaw };
  }

  return { jsonRaw, jsonParsed };
}

export function extractMetacomments(rawAnswer, maxLen = 4000) {
  let visible = rawAnswer.replace(JSON_FENCE_RE, '').trim();
  visible = visible
    .replace(/^```[a-z]*\s*$/gim, '')
    .replace(/^```\s*$/gim, '')
    .trim();

  const metaIdx = visible.search(/##\s*Метакомментарии_Блока/i);
  if (metaIdx >= 0) {
    visible = visible.slice(metaIdx);
  }

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
