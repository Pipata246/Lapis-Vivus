const DATE_RE = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PLACE_CHARS_RE = /^[\p{L}\s\-'.]+$/u;

const MIN_BIRTH_YEAR = 1900;

/** Однословные города из 3–5 букв (исключение из правила «одно слово ≥ 6»). */
const SHORT_CITY_ALLOWLIST = new Set([
  'омск',
  'уфа',
  'пермь',
  'тула',
  'орёл',
  'орел',
  'ижа',
  'клин',
  'рязань',
  'псков',
  'тверь',
  'сочи',
  'казань',
  'киев',
  'минск',
  'рига',
  'омск',
]);

const PLACE_BLOCKLIST = new Set([
  'пизда',
  'хуй',
  'хер',
  'блять',
  'блядь',
  'ебать',
  'сука',
  'мудак',
  'test',
  'тест',
  'asdf',
  'qwerty',
  'нет',
  'да',
  'xxx',
]);

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
  'links',
  'quick_question',
]);

function parseDateParts(dateStr) {
  const [day, month, year] = dateStr.split('.').map(Number);
  return { day, month, year };
}

function isRealCalendarDate(day, month, year) {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

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

  // quick_question может иметь value (индекс вопроса)
  if (action === 'quick_question' && value === null) {
    return null;
  }

  if (action !== 'gender' && action !== 'quick_question' && value !== null) {
    return null;
  }

  return { action, value };
}

export function validateBirthDate(text) {
  const trimmed = text?.trim();
  if (!DATE_RE.test(trimmed)) {
    return { ok: false, error: 'Дата в формате ДД.ММ.ГГГГ, например 15.03.1990' };
  }

  const { day, month, year } = parseDateParts(trimmed);

  if (!isRealCalendarDate(day, month, year)) {
    return { ok: false, error: 'Некорректная дата. Проверь день и месяц.' };
  }

  if (year < MIN_BIRTH_YEAR) {
    return {
      ok: false,
      error: `Год рождения не раньше ${MIN_BIRTH_YEAR}.`,
    };
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const birth = new Date(year, month - 1, day);

  if (birth > todayStart) {
    return {
      ok: false,
      error: 'Дата рождения не может быть в будущем. Укажи прошедшую дату.',
    };
  }

  const ageDays = (todayStart - birth) / (24 * 60 * 60 * 1000);
  if (ageDays < 1) {
    return { ok: false, error: 'Дата рождения должна быть минимум вчера.' };
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
  const trimmed = text?.trim().replace(/\s+/g, ' ');
  const normalized = trimmed.toLowerCase();

  if (!trimmed || trimmed.length < 2 || trimmed.length > 80) {
    return {
      ok: false,
      error: 'Укажи город или населённый пункт (2–80 символов).',
    };
  }

  if (!PLACE_CHARS_RE.test(trimmed)) {
    return {
      ok: false,
      error: 'Только буквы, пробелы, дефис и апостроф (например: Москва, Санкт-Петербург).',
    };
  }

  if (!/[\p{L}]/u.test(trimmed)) {
    return { ok: false, error: 'В названии должны быть буквы.' };
  }

  if (PLACE_BLOCKLIST.has(normalized)) {
    return {
      ok: false,
      error: 'Укажи реальный город или населённый пункт рождения.',
    };
  }

  const tokens = trimmed.split(/[\s\-]+/).filter(Boolean);
  const hasMultiPart = tokens.length >= 2;
  const single = tokens.length === 1 ? tokens[0] : null;

  if (!hasMultiPart && single) {
    const singleNorm = single.toLowerCase();
    if (single.length < 3) {
      return { ok: false, error: 'Слишком короткое название. Пример: Москва, Казань.' };
    }
    if (
      single.length < 6 &&
      !SHORT_CITY_ALLOWLIST.has(singleNorm) &&
      !/^[\p{Lu}]/u.test(single)
    ) {
      return {
        ok: false,
        error:
          'Для одного слова укажи полное название города (от 6 букв) или с заглавной (Омск, Уфа).',
      };
    }
  }

  if (/(.)\1{4,}/iu.test(trimmed)) {
    return { ok: false, error: 'Некорректное название места.' };
  }

  return { ok: true, value: trimmed };
}

export function getBlockAttachments(data, blockId) {
  const attachments = data?.block_attachments ?? {};
  return attachments[blockId] ?? [];
}

export function getBlockFilesForRun(data, block) {
  const own = getBlockAttachments(data, block.id);
  if (own.length > 0) return own;
  if (block.id === '3B') {
    return getBlockAttachments(data, '3');
  }
  return own;
}

export function saveBlockAttachment(data, blockId, fileInfo) {
  const attachments = { ...(data.block_attachments ?? {}) };
  // fileInfo может быть строкой (старый формат) или объектом
  const fileObj = typeof fileInfo === 'string' 
    ? { file_id: fileInfo, type: 'photo' } 
    : fileInfo;
  const list = [...(attachments[blockId] ?? []), fileObj].slice(-5);
  attachments[blockId] = list;
  return { block_attachments: attachments };
}

export function hasRequiredFiles(data, block) {
  if (!block.requiresExternal) {
    return true;
  }
  return getBlockFilesForRun(data, block).length > 0;
}

/** Есть ли незавершённый прогресс (не сбрасывать на меню). */
export function hasAnalysisProgress(session) {
  if (!session) return false;
  const data = session.collected_data ?? {};
  if (data.birth_date || data.gender) return true;
  const activeSteps = new Set([
    'gender',
    'birth_date',
    'birth_time',
    'birth_place',
    'confirm',
    'block_prep',
    'block_running',
    'block_review',
    'block_failed',
    'completed',
  ]);
  return activeSteps.has(session.step);
}
