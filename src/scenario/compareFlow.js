import { letterhead, ONBOARDING_ICON, escapeHtml, stepDots, btn, section } from '../ui/brand.js';
import { formatForTelegram } from '../ai/formatResponse.js';
import { CALLBACK_PREFIX } from './constants.js';

/** Единый движок сравнения пары — контекст только в prompt, блок один для всех категорий. */
export const COMPARE_ENGINE = {
  targetBlock: '1B',
  blockVariant: 'partner_composite',
};

/** Популярные контексты сравнения. */
export const COMPARE_CONTEXTS = {
  relationships: {
    id: 'relationships',
    label: { ru: 'Отношения', en: 'Relationships' },
    emoji: '💞',
  },
  family: {
    id: 'family',
    label: { ru: 'Семья', en: 'Family' },
    emoji: '🏠',
  },
  business: {
    id: 'business',
    label: { ru: 'Бизнес', en: 'Business' },
    emoji: '💼',
  },
  friendship: {
    id: 'friendship',
    label: { ru: 'Дружба', en: 'Friendship' },
    emoji: '🤝',
  },
};

export function isCompareMode(data) {
  return Boolean(data?.compare_mode);
}

/** Все поля пары заполнены — можно запускать блок 1B. */
export function isCompareDataComplete(data) {
  if (!isCompareMode(data)) return false;
  return Boolean(
    data.compare_context &&
      data.gender &&
      data.birth_date &&
      data.birth_time &&
      data.birth_place &&
      data.partner_name &&
      data.partner_gender &&
      data.partner_birth_date &&
      data.partner_birth_time &&
      data.partner_birth_place,
  );
}

export function hasCompleteBirth(data) {
  return Boolean(data?.gender && data?.birth_date && data?.birth_time && data?.birth_place);
}

export function partnerProfileFromCollected(data) {
  return {
    name: data.partner_name ?? null,
    gender: data.partner_gender ?? null,
    gender_label: data.partner_gender_label ?? null,
    birth_date: data.partner_birth_date ?? null,
    birth_time: data.partner_birth_time ?? null,
    birth_place: data.partner_birth_place ?? null,
  };
}

export function subjectProfileFromCollected(data) {
  return {
    gender: data.gender ?? null,
    gender_label: data.gender_label ?? null,
    birth_date: data.birth_date ?? null,
    birth_time: data.birth_time ?? null,
    birth_place: data.birth_place ?? null,
  };
}

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

export function resolveCompareContext(contextKey, customText, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';

  if (contextKey === 'custom') {
    const text = (customText ?? '').trim();
    if (text.length < 3) {
      return { ok: false, error: code === 'en' ? 'Describe the context (at least 3 characters).' : 'Опишите контекст (минимум 3 символа).' };
    }
    return {
      ok: true,
      compare_context: 'custom',
      compare_context_label: text,
      compare_context_custom: text,
      target_block_id: COMPARE_ENGINE.targetBlock,
      block_variant: COMPARE_ENGINE.blockVariant,
      goal_leaf_label: text,
    };
  }

  const ctx = COMPARE_CONTEXTS[contextKey];
  if (!ctx) {
    return { ok: false, error: code === 'en' ? 'Choose a context from the buttons.' : 'Выберите контекст кнопкой ниже.' };
  }

  const label = ctx.label[code];
  return {
    ok: true,
    compare_context: ctx.id,
    compare_context_label: label,
    compare_context_custom: null,
    target_block_id: COMPARE_ENGINE.targetBlock,
    block_variant: COMPARE_ENGINE.blockVariant,
    goal_leaf_label: label,
  };
}

export function compareGoalKeyboard(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const rel = COMPARE_CONTEXTS.relationships;
  const fam = COMPARE_CONTEXTS.family;
  const biz = COMPARE_CONTEXTS.business;
  const fr = COMPARE_CONTEXTS.friendship;

  return {
    inline_keyboard: [
      [
        { text: `${rel.emoji} ${rel.label[code]}`, callback_data: cb('compare_context', 'relationships') },
        { text: `${fam.emoji} ${fam.label[code]}`, callback_data: cb('compare_context', 'family') },
      ],
      [
        { text: `${biz.emoji} ${biz.label[code]}`, callback_data: cb('compare_context', 'business') },
        { text: `${fr.emoji} ${fr.label[code]}`, callback_data: cb('compare_context', 'friendship') },
      ],
      [{ text: btn(lang, 'compareCustom'), callback_data: cb('compare_context', 'custom') }],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function compareConfirmKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'confirmCompare'), callback_data: cb('compare_confirm_yes') }],
      [
        { text: btn(lang, 'editPartner'), callback_data: cb('compare_edit_partner') },
        { text: btn(lang, 'editSubject'), callback_data: cb('compare_edit_subject') },
      ],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function partnerGenderKeyboard(lang = 'ru') {
  const male = lang === 'en' ? '👨 Male' : '👨 Мужской';
  const female = lang === 'en' ? '👩 Female' : '👩 Женский';
  return {
    inline_keyboard: [
      [
        { text: male, callback_data: cb('partner_gender', 'male') },
        { text: female, callback_data: cb('partner_gender', 'female') },
      ],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function partnerTimeKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'timeUnknown'), callback_data: cb('partner_time_unknown') }],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function formatCompareStartScreen(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  if (code === 'en') {
    return [
      letterhead('Compatibility', lang),
      '',
      '💫 <b>Pair compatibility</b>',
      '',
      '<i>Choose the context — you will receive a dynamics report and a clear verdict.</i>',
    ].join('\n');
  }
  return [
    letterhead('Совместимость', lang),
    '',
    '💫 <b>Совместимость пары</b>',
    '',
    '<i>Выберите контекст — в отчёте будет динамика связи и чёткий итог с рекомендацией.</i>',
  ].join('\n');
}

/** @deprecated используйте formatCompareStartScreen */
export function formatCompareIntro(lang = 'ru') {
  return formatCompareStartScreen(lang);
}

/** @deprecated используйте formatCompareStartScreen */
export function formatCompareGoalStep(lang = 'ru') {
  return '';
}

export function formatCompareCustomContextPrompt(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  return [
    letterhead(code === 'en' ? 'Your context' : 'Свой контекст', lang),
    '',
    code === 'en' ? '<b>Describe in a few words</b>' : '<b>Опишите своими словами</b>',
  ].join('\n');
}

export function formatCompareSubjectIntro(contextLabel, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  return [
    letterhead(code === 'en' ? 'You' : 'Вы', lang),
    '',
    `<i>${escapeHtml(contextLabel)}</i>`,
  ].join('\n');
}

export function formatPartnerInitStep(step, total, field, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const labels = {
    partner_name: { ru: 'Имя', en: 'Name' },
    partner_gender: { ru: 'Пол', en: 'Gender' },
    partner_birth_date: { ru: 'Дата рождения', en: 'Birth date' },
    partner_birth_time: { ru: 'Время рождения', en: 'Birth time' },
    partner_birth_place: { ru: 'Место рождения', en: 'Birth place' },
  };
  const hints = {
    partner_name: {
      ru: 'Как обращаться к человеку в отчёте (имя или псевдоним).',
      en: 'How to address this person in the report (name or alias).',
    },
    partner_birth_date: {
      ru: 'Формат · ДД.ММ.ГГГГ',
      en: 'Format · DD.MM.YYYY',
    },
    partner_birth_time: {
      ru: 'Формат · ЧЧ:ММ или «время неизвестно»',
      en: 'Format · HH:MM or tap «Time unknown»',
    },
    partner_birth_place: {
      ru: 'Город рождения · например, Москва',
      en: 'Birth city · e.g. Moscow',
    },
  };

  const iconKey = field.replace('partner_', '');
  const icon = ONBOARDING_ICON[iconKey] ?? '👤';
  const label = labels[field]?.[code] ?? field;
  const hint = hints[field]?.[code] ?? '';

  return [
    letterhead(code === 'en' ? 'Person 2' : 'Человек 2', lang),
    '',
    `<i>${stepDots(step, total)} · ${step}/${total}</i>`,
    '',
    `${icon} <b>${label}</b>`,
    hint ? `\n<i>${hint}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatCompareContextSummary(data, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const label = data.compare_context_label ?? data.goal_leaf_label;
  if (!label) return '';

  const ctx = COMPARE_CONTEXTS[data.compare_context];
  const emoji = ctx?.emoji ?? '💞';
  const modeLabel = code === 'en' ? 'Context' : 'Контекст';
  return `${emoji} ${modeLabel} · <b>${escapeHtml(label)}</b>`;
}

function formatBirthSummary(date, time, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const label = code === 'en' ? 'Birth' : 'Рождение';
  const d = escapeHtml(String(date ?? '—'));
  const t = escapeHtml(String(time ?? '—'));
  return `${label} · ${d} · ${t}`;
}

function formatPersonSummary({ icon, title, suffix, gender, birthDate, birthTime, birthPlace, lang }) {
  const code = lang === 'en' ? 'en' : 'ru';
  const genderLabel = code === 'en' ? 'Gender' : 'Пол';
  const placeLabel = code === 'en' ? 'Place' : 'Место';

  const header = suffix
    ? `${icon} <b>${escapeHtml(title)}</b> · ${escapeHtml(suffix)}`
    : `${icon} <b>${escapeHtml(title)}</b>`;

  const rows = [
    `${genderLabel} · ${escapeHtml(String(gender ?? '—'))}`,
    formatBirthSummary(birthDate, birthTime, lang),
    `${placeLabel} · ${escapeHtml(String(birthPlace ?? '—'))}`,
  ];

  return [header, ...rows].join('\n');
}

export function formatComparePairProfile(data, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const contextSummary = formatCompareContextSummary(data, lang);

  const subjectBlock = formatPersonSummary({
    icon: '👤',
    title: code === 'en' ? 'Person 1' : 'Человек 1',
    suffix: code === 'en' ? 'you' : 'вы',
    gender: data.gender_label,
    birthDate: data.birth_date,
    birthTime: data.birth_time,
    birthPlace: data.birth_place,
    lang,
  });

  const partnerBlock = formatPersonSummary({
    icon: '💫',
    title: code === 'en' ? 'Person 2' : 'Человек 2',
    suffix: data.partner_name?.trim() || null,
    gender: data.partner_gender_label,
    birthDate: data.partner_birth_date,
    birthTime: data.partner_birth_time,
    birthPlace: data.partner_birth_place,
    lang,
  });

  return [
    letterhead(code === 'en' ? 'Pair check' : 'Проверка пары', lang),
    '',
    ...(contextSummary ? [contextSummary, ''] : []),
    subjectBlock,
    '',
    partnerBlock,
    '',
    `<i>${ONBOARDING_ICON.confirm} ${code === 'en' ? 'Confirm to continue.' : 'Подтвердите, чтобы продолжить.'}</i>`,
  ].join('\n');
}

export function compareCompleteKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'comparePair'), callback_data: cb('compare_start') }],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function formatCompareRunning(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  return [
    letterhead(code === 'en' ? 'Compatibility' : 'Совместимость', lang),
    '',
    `💫 <b>${code === 'en' ? 'Pair analysis' : 'Анализ пары'}</b>`,
    '',
    `<i>${code === 'en' ? 'Building compatibility report…' : 'Собираем отчёт о совместимости…'}</i>`,
  ].join('\n');
}

export function formatCompareResultHeader(data, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const contextSummary = formatCompareContextSummary(data, lang);
  const partnerName = escapeHtml(data?.partner_name?.trim() || (code === 'en' ? 'Person 2' : 'Человек 2'));
  const pairLine =
    code === 'en'
      ? `👤 <b>You</b>  ·  💫 <b>${partnerName}</b>`
      : `👤 <b>Вы</b>  ·  💫 <b>${partnerName}</b>`;

  return [
    letterhead(code === 'en' ? 'Compatibility' : 'Совместимость', lang),
    '',
    ...(contextSummary ? [contextSummary, ''] : []),
    pairLine,
    '',
    `<i>${code === 'en' ? 'Compatibility report' : 'Отчёт о совместимости'}</i>`,
  ].join('\n');
}

const COMPARE_SECTION_DEFS = [
  {
    icon: '💞',
    ru: 'Динамика связи',
    en: 'Relationship dynamics',
    match: /динамика\s+связи|relationship\s+dynamics/i,
  },
  {
    icon: '✨',
    ru: 'Сильные стороны пары',
    en: 'Pair strengths',
    match: /сильные\s+стороны|pair\s+strengths|strengths\s+of\s+the\s+pair/i,
  },
  {
    icon: '⚠️',
    ru: 'Риски и напряжения',
    en: 'Risks and tensions',
    match: /риски\s+и\s+напряжения|risks\s+and\s+tensions/i,
  },
  {
    icon: '🎯',
    ru: 'Итог и вердикт',
    en: 'Verdict',
    match: /итог\s+и\s+вердикт|verdict|final\s+verdict/i,
  },
];

function stripSectionHeaderLine(line) {
  return String(line ?? '')
    .replace(/^\d+\.\s*/, '')
    .replace(/^\*\*([^*]+)\*\*\s*:?\s*/, '$1')
    .replace(/^<b>([^<]+)<\/b>\s*:?\s*/, '$1')
    .trim();
}

/** Премиальные секции отчёта — как в остальном боте. */
function enhanceCompareSections(html, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const text = String(html ?? '').trim();
  if (!text) return text;
  if (/💞\s*<b>/.test(text) || /🎯\s*<b>/.test(text)) return text;

  const lines = text.split('\n');
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const plain = stripSectionHeaderLine(line.replace(/<[^>]+>/g, ''));
    const def = COMPARE_SECTION_DEFS.find((d) => d.match.test(plain));
    if (def) {
      if (current) blocks.push(current);
      current = { def, body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) blocks.push(current);

  if (blocks.length < 2) return text;

  return blocks
    .map(({ def, body }) => {
      const title = code === 'en' ? def.en : def.ru;
      const content = body.join('\n').trim();
      return section(title, content || '—', def.icon);
    })
    .filter(Boolean)
    .join('\n\n');
}

const COMPARE_BODY_STRIP_RE = [
  /Задайте вопрос или перейдите к следующему этапу\.?/gi,
  /Ask a question or continue to the next step\.?/gi,
  /Когда готовы — запустите этап\.?/gi,
  /When ready — run the step\.?/gi,
  /✅\s*Готово/gi,
  /✓\s*Complete/gi,
  /Этап\s+\d+\s+из\s+\d+/gi,
  /Step\s+\d+\s+of\s+\d+/gi,
  /Part\s+[IVX]+/gi,
  /🔮\s*<b>Интерпретация<\/b>/gi,
  /🔮\s*<b>Interpretation<\/b>/gi,
];

/** Убирает хвосты протокола и служебные фразы из тела отчёта совместимости. */
export function sanitizeCompareBody(html, lang = 'ru') {
  let text = String(html ?? '').trim();
  for (const re of COMPARE_BODY_STRIP_RE) {
    text = text.replace(re, '');
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Тело отчёта совместимости для пейджера — без шапки протокола и без «следующего этапа».
 */
export function formatCompareForUser(rawAnswer, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const body = enhanceCompareSections(sanitizeCompareBody(formatForTelegram(rawAnswer, 50000), lang), lang);
  if (!body) {
    return code === 'en'
      ? '<i>Analysis completed. Please try again.</i>'
      : '<i>Анализ завершён. Попробуйте ещё раз.</i>';
  }
  return body;
}

/** Инструкция ИИ для отчёта совместимости — динамика связи + итоговый вердикт. */
export function buildCompareExecutionInstruction(blockId, ctxLabel, remaining, jsonName) {
  return [
    `STRICT: PAIRED COMPATIBILITY — person 1 (universal_input) × person 2 (partner_input).`,
    `Context: «${ctxLabel}». Execute block ${blockId} ONLY.`,
    `JSON artifact: ${jsonName} with remaining_blocks_in_stack=${remaining}.`,
    '',
    'ПРОФАНСКИЙ КОММЕНТАРИЙ (RU, читаемый текст для Telegram) MUST use EXACTLY these sections:',
    '1. **Динамика связи** — как будут развиваться взаимоотношения в выбранном контексте; сценарий «как это будет жить»',
    '2. **Сильные стороны пары** — что усиливает связь и взаимную выгоду',
    '3. **Риски и напряжения** — конфликтные зоны, что может разрушить контакт',
    '4. **Итог и вердикт** — прямой ответ: **Стоит** / **С осторожностью** / **Не рекомендуется** + чёткая рекомендация (вкладываться, держать дистанцию, условия)',
    '',
    'FORBIDDEN: «следующий этап», «задайте вопрос», другие блоки протокола, сухой перечень без вердикта.',
    'One block per answer.',
  ].join('\n');
}

export function compareBlockPrepIntro() {
  return '';
}
