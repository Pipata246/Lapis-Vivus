import { letterhead, section, ONBOARDING_ICON, escapeHtml, stepDots } from '../ui/brand.js';
import { formatGoalSummary, formatTreeStepMessage, getTreeNode, resolveTreeChoice } from './diagnosticTree.js';
import { btn } from '../ui/brand.js';
import { CALLBACK_PREFIX } from './constants.js';

/** Узел дерева — только ветка «отношения». */
export const COMPARE_GOAL_NODE = 'shag_5';

export function isCompareMode(data) {
  return Boolean(data?.compare_mode);
}

export function hasCompleteBirth(data) {
  return Boolean(data?.gender && data?.birth_date && data?.birth_time && data?.birth_place);
}

export function hasCompletePartnerBirth(data) {
  return Boolean(
    data?.partner_gender &&
      data?.partner_birth_date &&
      data?.partner_birth_time &&
      data?.partner_birth_place,
  );
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

export function applySubjectFromProfile(profile, lang = 'ru') {
  const d = profile?.user_data ?? {};
  if (!hasCompleteBirth(d)) return null;

  const code = lang === 'en' ? 'en' : 'ru';
  return {
    gender: d.gender,
    gender_label:
      d.gender_label ??
      (d.gender === 'male'
        ? code === 'en'
          ? 'Male'
          : 'Мужской'
        : code === 'en'
          ? 'Female'
          : 'Женский'),
    birth_date: d.birth_date,
    birth_time: d.birth_time,
    birth_place: d.birth_place,
  };
}

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

export function compareGoalKeyboard(lang = 'ru') {
  const node = getTreeNode(COMPARE_GOAL_NODE);
  const code = lang === 'en' ? 'en' : 'ru';
  const rows = Object.entries(node?.variants ?? {}).map(([key, variant]) => [
    { text: variant.short[code], callback_data: `${CALLBACK_PREFIX}:compare_tree:${COMPARE_GOAL_NODE}:${key}` },
  ]);
  rows.push([{ text: btn(lang, 'cancel'), callback_data: cb('menu') }]);
  return { inline_keyboard: rows };
}

export function compareSubjectChoiceKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'useMyProfile'), callback_data: cb('compare_use_profile') }],
      [{ text: btn(lang, 'enterNewData'), callback_data: cb('compare_enter_subject') }],
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
        { text: btn(lang, 'cancel'), callback_data: cb('menu') },
      ],
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
      letterhead('Pair analysis', lang),
      '',
      '<i>Compare two birth profiles through the lens of your current focus.</i>',
      '',
      section(
        'How it works',
        [
          '1. Choose what matters in the relationship',
          '2. Confirm your birth profile',
          '3. Enter the other person\'s data',
          '4. Receive an AI synthesis aligned with your goal',
        ].join('\n'),
        '◆',
      ),
    ].join('\n');
  }

  return [
    letterhead('Анализ пары', lang),
    '',
    '<i>Сравнение двух профилей рождения через призму вашего текущего запроса.</i>',
    '',
    section(
      'Как это работает',
      [
        '1. Выберите, что важно в отношениях',
        '2. Подтвердите свой профиль рождения',
        '3. Введите данные другого человека',
        '4. Получите синтез ИИ с учётом вашей цели',
      ].join('\n'),
      '◆',
    ),
  ].join('\n');
}

export function formatCompareGoalStep(lang = 'ru') {
  const head = lang === 'en' ? 'Your focus' : 'Ваш запрос';
  return [letterhead(head, lang), '', formatTreeStepMessage(COMPARE_GOAL_NODE, lang)].join('\n');
}

export function formatCompareSubjectChoice(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  return [
    letterhead(code === 'en' ? 'Your profile' : 'Ваш профиль', lang),
    '',
    code === 'en'
      ? 'We found birth data in your profile. Use it or enter again.'
      : 'В профиле уже есть данные рождения. Использовать их или ввести заново?',
  ].join('\n');
}

export function formatPartnerInitStep(step, total, field, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const labels = {
    partner_name: { ru: 'Имя партнёра', en: 'Partner name' },
    partner_gender: { ru: 'Пол партнёра', en: 'Partner gender' },
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

  const label = labels[field]?.[code] ?? field;
  const hint = hints[field]?.[code] ?? '';

  return [
    letterhead(code === 'en' ? 'Partner profile' : 'Профиль партнёра', lang),
    '',
    `<i>${stepDots(step, total)} · ${step}/${total}</i>`,
    '',
    `${ONBOARDING_ICON[field.replace('partner_', '')] ?? '👤'} <b>${label}</b>`,
    hint ? `\n<i>${hint}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function profileRows(fields, lang) {
  return fields
    .map(([icon, k, v]) => `${icon} <b>${k}</b>\n${escapeHtml(String(v ?? '—'))}`)
    .join('\n\n');
}

export function formatComparePairProfile(data, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const goalSummary = formatGoalSummary(data, lang);

  const subjectLabel = code === 'en' ? 'You' : 'Вы';
  const partnerLabel = code === 'en' ? 'Partner' : 'Партнёр';

  const subjectRows = profileRows(
    [
      [ONBOARDING_ICON.gender, code === 'en' ? 'Gender' : 'Пол', data.gender_label],
      [ONBOARDING_ICON.birth_date, code === 'en' ? 'Birth date' : 'Дата', data.birth_date],
      [ONBOARDING_ICON.birth_time, code === 'en' ? 'Birth time' : 'Время', data.birth_time],
      [ONBOARDING_ICON.birth_place, code === 'en' ? 'Birth place' : 'Место', data.birth_place],
    ],
    lang,
  );

  const partnerRows = profileRows(
    [
      ['✦', code === 'en' ? 'Name' : 'Имя', data.partner_name ?? '—'],
      [ONBOARDING_ICON.gender, code === 'en' ? 'Gender' : 'Пол', data.partner_gender_label],
      [ONBOARDING_ICON.birth_date, code === 'en' ? 'Birth date' : 'Дата', data.partner_birth_date],
      [ONBOARDING_ICON.birth_time, code === 'en' ? 'Birth time' : 'Время', data.partner_birth_time],
      [ONBOARDING_ICON.birth_place, code === 'en' ? 'Birth place' : 'Место', data.partner_birth_place],
    ],
    lang,
  );

  return [
    letterhead(code === 'en' ? 'Pair check' : 'Проверка пары', lang),
    '',
    ...(goalSummary ? [goalSummary, ''] : []),
    section(subjectLabel, subjectRows, '👤'),
    '',
    section(partnerLabel, partnerRows, '💫'),
    '',
    `<i>${ONBOARDING_ICON.confirm} ${code === 'en' ? 'Confirm to run analysis.' : 'Подтвердите для запуска анализа.'}</i>`,
  ].join('\n');
}

export function resolveCompareTreeChoice(nodeId, variantKey, lang = 'ru') {
  return resolveTreeChoice(nodeId, variantKey, lang);
}

export function compareBlockPrepIntro(data, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const partner = data.partner_name ? escapeHtml(data.partner_name) : code === 'en' ? 'partner' : 'партнёра';
  return code === 'en'
    ? `<i>Pair mode · synthesis for you and ${partner} based on your focus.</i>`
    : `<i>Режим пары · синтез для вас и ${partner} с учётом вашего запроса.</i>`;
}
