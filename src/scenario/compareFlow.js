import { letterhead, section, ONBOARDING_ICON, escapeHtml, stepDots, btn } from '../ui/brand.js';
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
      [{ text: btn(lang, 'cancel'), callback_data: cb('menu') }],
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
      [{ text: btn(lang, 'cancel'), callback_data: cb('menu') }],
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
      [{ text: btn(lang, 'cancel'), callback_data: cb('menu') }],
    ],
  };
}

export function partnerTimeKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'timeUnknown'), callback_data: cb('partner_time_unknown') }],
      [{ text: btn(lang, 'cancel'), callback_data: cb('menu') }],
    ],
  };
}

/** Экран выбора контекста — один блок, без инструкций. */
export function formatCompareStartScreen(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  if (code === 'en') {
    return [
      letterhead('Compatibility', lang),
      '',
      '<b>Choose or describe the context</b>',
    ].join('\n');
  }
  return [
    letterhead('Совместимость', lang),
    '',
    '<b>Выберите или опишите контекст</b>',
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

  const modeLabel = code === 'en' ? 'Comparison context' : 'Контекст сравнения';
  return `${modeLabel}\n<b>${escapeHtml(label)}</b>`;
}

function profileRows(fields) {
  return fields
    .map(([icon, k, v]) => `${icon} <b>${k}</b>\n${escapeHtml(String(v ?? '—'))}`)
    .join('\n\n');
}

export function formatComparePairProfile(data, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const contextSummary = formatCompareContextSummary(data, lang);

  const subjectLabel = code === 'en' ? 'Person 1 · you' : 'Человек 1 · вы';
  const partnerLabel = code === 'en' ? 'Person 2' : 'Человек 2';

  const subjectRows = profileRows([
    [ONBOARDING_ICON.gender, code === 'en' ? 'Gender' : 'Пол', data.gender_label],
    [ONBOARDING_ICON.birth_date, code === 'en' ? 'Birth date' : 'Дата', data.birth_date],
    [ONBOARDING_ICON.birth_time, code === 'en' ? 'Birth time' : 'Время', data.birth_time],
    [ONBOARDING_ICON.birth_place, code === 'en' ? 'Birth place' : 'Место', data.birth_place],
  ]);

  const partnerRows = profileRows([
    ['✦', code === 'en' ? 'Name' : 'Имя', data.partner_name ?? '—'],
    [ONBOARDING_ICON.gender, code === 'en' ? 'Gender' : 'Пол', data.partner_gender_label],
    [ONBOARDING_ICON.birth_date, code === 'en' ? 'Birth date' : 'Дата', data.partner_birth_date],
    [ONBOARDING_ICON.birth_time, code === 'en' ? 'Birth time' : 'Время', data.partner_birth_time],
    [ONBOARDING_ICON.birth_place, code === 'en' ? 'Birth place' : 'Место', data.partner_birth_place],
  ]);

  return [
    letterhead(code === 'en' ? 'Pair check' : 'Проверка пары', lang),
    '',
    ...(contextSummary ? [contextSummary, ''] : []),
    section(subjectLabel, subjectRows, '👤'),
    '',
    section(partnerLabel, partnerRows, '💫'),
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
    `<i>${code === 'en' ? 'Analyzing the pair…' : 'Анализируем связь…'}</i>`,
  ].join('\n');
}

export function formatCompareResultHeader(data, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const ctx = escapeHtml(data?.compare_context_label ?? '');
  return [
    letterhead(code === 'en' ? 'Result' : 'Результат', lang),
    '',
    ctx ? `<i>${ctx}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function compareBlockPrepIntro() {
  return '';
}
