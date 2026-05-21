const DATE_RE = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PLACE_RE = /^[\p{L}\s\-'.]{2,120}$/u;

const ALLOWED_CALLBACK_ACTIONS = new Set([
  'start',
  'gender',
  'time_unknown',
  'confirm_yes',
  'confirm_edit',
  'run_block',
  'next_block',
  'retry_block',
  'reset',
  'menu',
]);

export function parseCallbackData(data) {
  if (typeof data !== 'string' || !data.startsWith('lv:')) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const action = parts[1];
  const value = parts[2] ?? null;

  if (!ALLOWED_CALLBACK_ACTIONS.has(action)) {
    return null;
  }

  if (action === 'gender' && value !== 'male' && value !== 'female') {
    return null;
  }

  if (action !== 'gender' && value !== null) {
    return null;
  }

  return { action, value };
}

export function validateBirthDate(text) {
  const trimmed = text?.trim();
  if (!DATE_RE.test(trimmed)) {
    return { ok: false, error: 'Дата в формате ДД.ММ.ГГГГ, например 15.03.1990' };
  }

  const [day, month, year] = trimmed.split('.').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { ok: false, error: 'Некорректная дата. Проверь день и месяц.' };
  }

  return { ok: true, value: trimmed };
}

export function validateBirthTime(text) {
  const trimmed = text?.trim();
  if (!TIME_RE.test(trimmed)) {
    return { ok: false, error: 'Время в формате ЧЧ:ММ, например 14:30' };
  }
  return { ok: true, value: trimmed };
}

export function validateBirthPlace(text) {
  const trimmed = text?.trim();
  if (!trimmed || !PLACE_RE.test(trimmed)) {
    return {
      ok: false,
      error: 'Укажи город текстом (2–120 символов, только буквы, пробелы, дефис).',
    };
  }
  return { ok: true, value: trimmed };
}

export function getBlockAttachments(data, blockId) {
  const attachments = data?.block_attachments ?? {};
  return attachments[blockId] ?? [];
}

/** Файлы для запуска блока (3B может использовать вложения блока 3) */
export function getBlockFilesForRun(data, block) {
  const own = getBlockAttachments(data, block.id);
  if (own.length > 0) return own;
  if (block.id === '3B') {
    return getBlockAttachments(data, '3');
  }
  return own;
}

export function saveBlockAttachment(data, blockId, fileId) {
  const attachments = { ...(data.block_attachments ?? {}) };
  const list = [...(attachments[blockId] ?? []), fileId].slice(-5);
  attachments[blockId] = list;
  return { block_attachments: attachments };
}

export function hasRequiredFiles(data, block) {
  if (!block.requiresExternal) {
    return true;
  }
  return getBlockFilesForRun(data, block).length > 0;
}
