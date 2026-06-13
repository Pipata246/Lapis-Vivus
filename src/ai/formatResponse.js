/**
 * JSON уходит в БД; в Telegram — читаемый HTML-текст (без сырого Markdown).
 */

import { formatBlockHeader } from '../scenario/constants.js';
import { divider } from '../ui/brand.js';

export const TELEGRAM_PARSE_MODE = 'HTML';

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
  /^ITERATIVE[_\s]BLOCK[^\n]*$/gim,
  /^UNIVERSAL[^\n]*(?:PROCESSOR|CONVEYOR)[^\n]*$/gim,
  /\/\/\s*RUNTIME[^\n]*$/gim,
];

const TECHNICAL_INLINE_PATTERNS = [
  /v\d+\.\d+[_\s]*ORACLE[_\s]*PREMIUM/gi,
  /\[Neo4j\s+SYNTAX\]/gi,
  /\[KENOMY\s+INDEX\]/gi,
  /\[SUPERMANIFEST\]/gi,
  /\[NEIDAN\s+PRACTICES\]/gi,
  /\[ROM-BOARD\]/gi,
  /\[RAM-MUTATION\]/gi,
  /\/\/\s*RUNTIME:\s*v[\d._]+/gi,
];

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Убирает HTML-теги для безопасной plain-text отправки при ошибке парсинга */
export function htmlToPlain(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(b|i|u|s|code|pre)>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function stripTechnicalLines(text) {
  let result = text;
  for (const pattern of TECHNICAL_LINE_PATTERNS) {
    result = result.replace(pattern, '');
  }
  for (const pattern of TECHNICAL_INLINE_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
}

function convertToTelegramHtml(text) {
  let result = text;

  const placeholders = [];
  let phIndex = 0;

  const addPlaceholder = (html) => {
    const token = `\uE000${phIndex++}\uE001`;
    placeholders.push({ token, html });
    return token;
  };

  result = result.replace(/^#{1,6}\s+(.+)$/gm, (_, title) =>
    addPlaceholder(`<b>${escapeHtml(title.trim())}</b>`)
  );

  result = result.replace(/\*\*([^*\n]+)\*\*/g, (_, chunk) =>
    addPlaceholder(`<b>${escapeHtml(chunk.trim())}</b>`)
  );

  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_, chunk) =>
    addPlaceholder(`<b>${escapeHtml(chunk.trim())}</b>`)
  );

  result = result.replace(/_([^_\n]+)_/g, (_, chunk) =>
    addPlaceholder(`<i>${escapeHtml(chunk.trim())}</i>`)
  );

  result = escapeHtml(result);

  for (const { token, html } of placeholders) {
    result = result.split(token).join(html);
  }

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

function extractVisiblePlain(rawAnswer) {
  const jsonMatch = rawAnswer.match(/```json[\s\S]*?```/i);
  let visible = jsonMatch
    ? rawAnswer.slice(jsonMatch.index + jsonMatch[0].length)
    : rawAnswer.replace(JSON_FENCE_RE, '');

  visible = visible.trim();

  if (!visible) {
    const profanMatch = rawAnswer.match(/ПРОФАНСКИЙ\s+КОММЕНТАРИЙ[\s\S]*/i);
    if (profanMatch) {
      visible = profanMatch[0];
    }
  }

  visible = stripTechnicalLines(visible);
  visible = visible.replace(/^#{1,6}\s*ПРОФАНСКИЙ\s+КОММЕНТАРИЙ[^\n]*/gim, '');
  visible = visible.replace(/^ПРОФАНСКИЙ\s+КОММЕНТАРИЙ\s*:?\s*\n?/gim, '');
  visible = visible.replace(/```[\s\S]*?```/g, '');
  visible = visible.replace(/\n{3,}/g, '\n\n');

  return visible.trim();
}

/** Чистый текст для контекста ИИ (без HTML) */
export function extractMetacomments(rawAnswer, maxLen = 4000) {
  let visible = extractVisiblePlain(rawAnswer);
  if (visible.length > maxLen) {
    visible = `${visible.slice(0, maxLen)}…`;
  }
  return visible;
}

/** Единый форматтер для любого ответа ИИ в Telegram */
export function formatForTelegram(rawAnswer, maxLen = 50000) {
  let visible = convertToTelegramHtml(extractVisiblePlain(rawAnswer));

  if (visible.length > maxLen) {
    visible = `${visible.slice(0, maxLen)}\n…`;
  }

  return visible;
}

export function formatBlockForUser(rawAnswer, blockId, blockIndex) {
  const visible = formatForTelegram(rawAnswer, 50000);
  const header = formatBlockHeader(blockId, blockIndex);

  if (!visible) {
    return (
      `${header}\n${divider()}\n\n` +
      '<i>Этап выполнен. Данные сохранены.</i>\n' +
      'Перейдите к следующему этапу.'
    );
  }

  return `${header}\n${divider()}\n\n${visible}`;
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
