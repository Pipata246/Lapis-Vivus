/**
 * JSON уходит в БД; в Telegram — читаемый текст после JSON (метакомментарии или профанский комментарий).
 */

const JSON_FENCE_RE = /```json[\s\S]*?```/gi;

const TECHNICAL_LINE_PATTERNS = [
  /^#\s*core:/gim,
  /^#\s*matrix/gim,
  /^#\s*trajectory:/gim,
  /^#\s*operator_subject:/gim,
  /^#\s*prox_matrix:/gim,
  /^RUNNING(?:_DIAGNOSTIC)?:/gim,
  /^TARGET(?:_BLOCK)?:/gim,
  /^0x[0-9A-F]+/gim,
  /^lapis.*v\d+\.\d+/gim,
  /^\[RUNTIME_INVARIANT/gim,
  /^\[ANCHOR_GATE\]/gim,
  /^\[OBJECT_GATE\]/gim,
  /^Noise_Gate /gim,
  /^_INTRO\s*──>/gim,
  /^_OUTRO/gim,
  /^⟦MAX_DENSITY/gim,
];

function stripTechnicalLines(text) {
  let result = text;
  for (const pattern of TECHNICAL_LINE_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
}

function sanitizeForTelegram(text) {
  let result = text;
  result = result.replace(/(?<!\*)_(?!\*)/g, '');
  result = result.replace(/\[(?![^\]]*\]\()/g, '');
  result = result.replace(/\](?!\()/g, '');
  result = result.replace(/(?<!`)`(?!`)/g, '');
  return result;
}

function convertToTelegramMarkdown(text) {
  let result = stripTechnicalLines(text);
  result = sanitizeForTelegram(result);
  result = result.replace(/^##\s+(.+)$/gm, '\n*$1*\n');
  result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

export function extractJsonFromAnswer(rawAnswer) {
  let match = rawAnswer.match(/```json\s*([\s\S]*?)```/i);

  if (!match) {
    match = rawAnswer.match(/(\{[\s\S]*?"(?:block_|блок_)[^}]+\}[\s\S]*?\})/i);
  }

  if (!match) {
    return { jsonRaw: null, jsonParsed: null };
  }

  const jsonRaw = match[1].trim();
  let jsonParsed = null;

  try {
    jsonParsed = JSON.parse(jsonRaw);
  } catch (err) {
    console.error('Ошибка парсинга JSON:', err.message);
    jsonParsed = { _parse_error: true, raw: jsonRaw };
  }

  return { jsonRaw, jsonParsed };
}

export function extractMetacomments(rawAnswer, maxLen = 4000) {
  const jsonMatch = rawAnswer.match(/```json[\s\S]*?```/i);
  let visible = jsonMatch
    ? rawAnswer.slice(jsonMatch.index + jsonMatch[0].length)
    : rawAnswer.replace(JSON_FENCE_RE, '');

  visible = visible.replace(/^```\s*$/gim, '');
  visible = visible.trim();

  if (!visible) {
    const profanMatch = rawAnswer.match(/ПРОФАНСКИЙ\s+КОММЕНТАРИЙ[\s\S]*/i);
    if (profanMatch) {
      visible = profanMatch[0];
    }
  }

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

  while (rest.length > maxLen) {
    let cut = maxLen;
    const slice = rest.slice(0, maxLen);
    const paraBreak = slice.lastIndexOf('\n\n');
    const lineBreak = slice.lastIndexOf('\n');
    if (paraBreak > maxLen * 0.5) {
      cut = paraBreak + 2;
    } else if (lineBreak > maxLen * 0.5) {
      cut = lineBreak + 1;
    }
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }

  if (rest.length > 0) {
    parts.push(rest);
  }

  return parts;
}

/** Разбивает текст; клавиатура — на последнем сообщении */
export function splitForTelegramWithKeyboard(text, keyboard, maxLen = 4096) {
  const chunks = splitTelegramMessages(text, maxLen);
  if (chunks.length === 0) {
    return [{ text: text || '—', keyboard }];
  }
  if (chunks.length === 1) {
    return [{ text: chunks[0], keyboard }];
  }
  return chunks.map((chunk, i) => ({
    text: chunk,
    keyboard: i === chunks.length - 1 ? keyboard : undefined,
  }));
}
