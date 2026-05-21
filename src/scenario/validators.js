const DATE_RE = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PLACE_RE = /^[\p{L}\s\-'.]{2,120}$/u;

const ALLOWED_CALLBACK_ACTIONS = new Set([
  'start',
  'gender',
  'time_unknown',
  'confirm_yes',
  'confirm_edit',
  'next_block',
  'retry_block',
  'upload_done',
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

export function validateExternalDump(text, label) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (trimmed.length < 50) {
    return {
      ok: false,
      error: `${label}: текстовый дамп минимум 50 символов или отправь скриншот.`,
    };
  }
  if (trimmed.length > 12000) {
    return { ok: false, error: `${label}: слишком длинный текст (макс. 12000 символов).` };
  }
  return { ok: true, value: trimmed };
}

export function hasExternalFaktura(data, dumpKey, photoKey) {
  const dump = data?.[dumpKey];
  const photos = data?.[photoKey] ?? [];
  return Boolean(dump?.trim()) || photos.length > 0;
}

export function sanitizeTelegramUserId(id) {
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}
