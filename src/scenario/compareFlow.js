import { letterhead, section, ONBOARDING_ICON, escapeHtml, stepDots, btn } from '../ui/brand.js';
import { CALLBACK_PREFIX } from './constants.js';

/** Популярные контексты сравнения. */
export const COMPARE_CONTEXTS = {
  relationships: {
    id: 'relationships',
    label: { ru: 'Отношения', en: 'Relationships' },
    emoji: '💞',
    targetBlock: '1B',
    blockVariant: 'partner_composite',
  },
  family: {
    id: 'family',
    label: { ru: 'Семья', en: 'Family' },
    emoji: '🏠',
    targetBlock: '1B',
    blockVariant: 'partner_composite',
  },
  business: {
    id: 'business',
    label: { ru: 'Бизнес', en: 'Business' },
    emoji: '💼',
    targetBlock: '1C',
    blockVariant: 'intersubjective_composite',
  },
  friendship: {
    id: 'friendship',
    label: { ru: 'Дружба', en: 'Friendship' },
    emoji: '🤝',
    targetBlock: '1C',
    blockVariant: 'intersubjective_composite',
  },
};

const CUSTOM_CONTEXT = {
  targetBlock: '1B',
  blockVariant: 'partner_composite',
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
      target_block_id: CUSTOM_CONTEXT.targetBlock,
      block_variant: CUSTOM_CONTEXT.blockVariant,
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
    target_block_id: ctx.targetBlock,
    block_variant: ctx.blockVariant,
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

export function formatCompareIntro(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  if (code === 'en') {
    return [
      letterhead('Compatibility', lang),
      '',
      '<i>Compare two birth profiles — same data as in a protocol session.</i>',
      '',
      section(
        'How it works',
        [
          '1. Choose context · relationships, family, business, friendship — or your own',
          '2. Enter your birth profile · gender, date, time, place',
          '3. Enter the other person\'s birth profile',
          '4. Receive a pair synthesis for your chosen context',
        ].join('\n'),
        '◆',
      ),
    ].join('\n');
  }

  return [
    letterhead('Совместимость', lang),
    '',
    '<i>Сравнение двух профилей рождения — те же данные, что при прогоне протокола.</i>',
    '',
    section(
      'Как это работает',
      [
        '1. Выберите контекст · отношения, семья, бизнес, дружба — или свой вариант',
        '2. Введите свой профиль · пол, дата, время, место рождения',
        '3. Введите профиль второго человека',
        '4. Получите синтез пары для выбранного контекста',
      ].join('\n'),
      '◆',
    ),
  ].join('\n');
}

export function formatCompareGoalStep(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  return [
    letterhead(code === 'en' ? 'Context' : 'Контекст', lang),
    '',
    code === 'en'
      ? '<b>What is this comparison about?</b>'
      : '<b>В каком контексте сравниваем?</b>',
    '',
    code === 'en'
      ? '<i>Choose a category or describe your own focus.</i>'
      : '<i>Выберите категорию или опишите свой запрос.</i>',
  ].join('\n');
}

export function formatCompareCustomContextPrompt(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  return [
    letterhead(code === 'en' ? 'Your context' : 'Ваш контекст', lang),
    '',
    code === 'en'
      ? '<b>Describe the focus of this comparison.</b>'
      : '<b>Опишите, в каком контексте нужно сравнение.</b>',
    '',
    code === 'en'
      ? '<i>Examples · co-parenting, creative partnership, relocation together…</i>'
      : '<i>Например · совместное воспитание, творческий дуэт, переезд вместе…</i>',
  ].join('\n');
}

export function formatCompareSubjectIntro(contextLabel, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  return [
    letterhead(code === 'en' ? 'Person 1 · you' : 'Человек 1 · вы', lang),
    '',
    section(code === 'en' ? 'Context' : 'Контекст', `<b>${escapeHtml(contextLabel)}</b>`, '◆'),
    '',
    code === 'en'
      ? '<i>Enter your birth profile — step 1 of 4.</i>'
      : '<i>Введите свой профиль рождения — шаг 1 из 4.</i>',
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
    `<i>${ONBOARDING_ICON.confirm} ${code === 'en' ? 'Confirm to run analysis.' : 'Подтвердите для запуска анализа.'}</i>`,
  ].join('\n');
}

export function compareBlockPrepIntro(data, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const ctx = escapeHtml(data.compare_context_label ?? data.goal_leaf_label ?? '');
  const other = data.partner_name ? escapeHtml(data.partner_name) : code === 'en' ? 'person 2' : 'человека 2';
  return code === 'en'
    ? `<i>Pair mode · ${ctx} · synthesis for you and ${other}.</i>`
    : `<i>Режим пары · ${ctx} · синтез для вас и ${other}.</i>`;
}
