/**
 * Визуальный язык Lapis Vivus — чистые отступы, без декоративных линий.
 */

import { getModuleMeta, SESSION_TOTAL } from './modules.js';
import { formatGoalSummary } from '../scenario/diagnosticTree.js';

export const BRAND = {
  name: 'Lapis Vivus',
  nameUpper: 'LAPIS VIVUS',
  tagline: {
    ru: 'Персональный протокол глубинного анализа',
    en: 'Personal protocol of deep analysis',
  },
  subtitle: {
    ru: '36 модулей · индивидуальный маршрут',
    en: '36 modules · individual route',
  },
};

export const PART_ICON = {
  I: '🌱',
  II: '☯️',
  III: '✨',
  IV: '🔗',
  V: '🕊',
};

export const ONBOARDING_ICON = {
  gender: '👤',
  birth_date: '📅',
  birth_time: '🕐',
  birth_place: '📍',
  confirm: '✅',
};

const BTN_EMOJI = {
  startAnalysis: '💎',
  myProfile: '👤',
  settings: '⚙️',
  help: '📖',
  back: '◀️',
  close: '✕',
  cancel: '✕',
  menu: '🏠',
  confirm: '✓',
  editData: '✎',
  timeUnknown: '⏳',
  runStage: '▶',
  skipStage: '⏭',
  nextStage: '→',
  retryStage: '↻',
  newAnalysis: '💎',
  usefulLinks: '🔗',
  howApply: '💡',
  moreDetail: '📖',
  whatMeans: '🔍',
  menuAbort: '🏠',
  changeLanguage: '🌐',
  languageEn: '🇬🇧',
  languageRu: '🇷🇺',
};

export const BTN = {
  ru: {
    startAnalysis: 'Начать сессию',
    myProfile: 'Мой профиль',
    settings: 'Настройки',
    help: 'Справка',
    back: 'Назад',
    close: 'Закрыть',
    cancel: 'Отмена',
    menu: 'Главное меню',
    confirm: 'Всё верно — начать',
    editData: 'Изменить данные',
    timeUnknown: 'Время неизвестно',
    runStage: 'Запустить модуль',
    skipStage: 'Пропустить',
    nextStage: 'Следующий модуль',
    finishSession: 'Завершить сессию',
    fullSession: 'Полная сессия · 36 модулей',
    retryStage: 'Повторить',
    newAnalysis: 'Новая сессия',
    usefulLinks: 'Калькуляторы',
    howApply: 'Как применить',
    moreDetail: 'Подробнее',
    whatMeans: 'Что это значит',
    menuAbort: 'В меню · прервать',
    changeLanguage: 'Язык',
    languageEn: 'English',
    languageRu: 'Русский',
  },
  en: {
    startAnalysis: 'Begin session',
    myProfile: 'My profile',
    settings: 'Settings',
    help: 'Help',
    back: 'Back',
    close: 'Close',
    cancel: 'Cancel',
    menu: 'Main menu',
    confirm: 'Confirm & start',
    editData: 'Edit data',
    timeUnknown: 'Time unknown',
    runStage: 'Run module',
    skipStage: 'Skip',
    nextStage: 'Next module',
    finishSession: 'Finish session',
    fullSession: 'Full session · 36 modules',
    retryStage: 'Retry',
    newAnalysis: 'New session',
    usefulLinks: 'Calculators',
    howApply: 'How to apply',
    moreDetail: 'More detail',
    whatMeans: 'What it means',
    menuAbort: 'Menu · abort',
    changeLanguage: 'Language',
    languageEn: 'English',
    languageRu: 'Russian',
  },
};

export function btn(lang, key) {
  const code = lang === 'en' ? 'en' : 'ru';
  const label = BTN[code][key] ?? BTN.ru[key] ?? key;
  const emoji = BTN_EMOJI[key];
  return emoji ? `${emoji} ${label}` : label;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** @deprecated декоративные линии убраны — пустая строка для совместимости */
export function divider() {
  return '';
}

export function stepDots(current, total) {
  const dots = [];
  for (let i = 1; i <= total; i += 1) {
    dots.push(i <= current ? '●' : '○');
  }
  return dots.join(' ');
}

/** Заголовок: только бренд, опционально подпись экрана */
export function letterhead(context, lang = 'ru') {
  void lang;
  if (context) {
    return `💎 <b>${BRAND.nameUpper}</b>\n${escapeHtml(context)}`;
  }
  return `💎 <b>${BRAND.nameUpper}</b>`;
}

export function progressLine(step, total = SESSION_TOTAL, lang = 'ru') {
  const pct = Math.min(100, Math.round((step / total) * 100));
  const num = String(step).padStart(2, '0');
  const label = lang === 'en' ? 'Progress' : 'Прогресс';
  return `<i>${label} · ${num}/${total} · ${pct}%</i>`;
}

export function section(title, body, icon = '') {
  if (!body) return '';
  const head = icon ? `${icon} <b>${escapeHtml(title)}</b>` : `<b>${escapeHtml(title)}</b>`;
  return `${head}\n${body}`;
}

export function formatSessionStart(lang = 'ru') {
  const intro =
    lang === 'en'
      ? 'Welcome.\nFirst we\'ll collect your birth profile — about a minute.'
      : 'Добро пожаловать.\nСначала соберём профиль рождения — это займёт около минуты.';

  return [letterhead(null, lang), '', intro, '', formatInitStep(1, 4, 'gender', lang)].join('\n');
}

const ONBOARDING_STEPS = {
  gender: {
    ru: { label: 'Пол', prompt: 'Выберите пол — это нужно для корректной интерпретации систем.' },
    en: { label: 'Gender', prompt: 'Select gender for accurate system interpretation.' },
  },
  birth_date: {
    ru: { label: 'Дата рождения', prompt: 'Введите дату в формате <b>ДД.ММ.ГГГГ</b>' },
    en: { label: 'Birth date', prompt: 'Enter date as <b>DD.MM.YYYY</b>' },
  },
  birth_time: {
    ru: {
      label: 'Время рождения',
      prompt: 'Введите время <b>ЧЧ:ММ</b> или нажмите «⏳ Время неизвестно».',
    },
    en: {
      label: 'Birth time',
      prompt: 'Enter time as <b>HH:MM</b> or tap «⏳ Time unknown».',
    },
  },
  birth_place: {
    ru: { label: 'Место рождения', prompt: 'Город или населённый пункт.\n<i>Например: Москва</i>' },
    en: { label: 'Birth place', prompt: 'City or town.\n<i>e.g. Moscow</i>' },
  },
};

export function formatInitStep(stepIndex, total, stepKey, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const meta = ONBOARDING_STEPS[stepKey]?.[code] ?? ONBOARDING_STEPS.gender[code];
  const icon = ONBOARDING_ICON[stepKey] ?? '▸';
  const stepLabel = code === 'en' ? `Step ${stepIndex} of ${total}` : `Шаг ${stepIndex} из ${total}`;

  return [
    `<i>${stepDots(stepIndex, total)}  ${stepLabel}</i>`,
    '',
    `${icon} <b>${escapeHtml(meta.label)}</b>`,
    meta.prompt,
  ].join('\n');
}

export function formatModuleHeader(blockId, blockIndex, lang = 'ru') {
  const meta = getModuleMeta(blockId, lang);
  const step = blockIndex + 1;
  const partIcon = PART_ICON[meta.part] ?? '◆';
  const moduleLabel =
    lang === 'en' ? `Module ${String(step).padStart(2, '0')}` : `Модуль ${String(step).padStart(2, '0')}`;

  return [
    letterhead(null, lang),
    '',
    `${partIcon} <b>${escapeHtml(meta.title)}</b>`,
    `<i>Part ${meta.part} · ${escapeHtml(meta.partName)} · ${moduleLabel}</i>`,
    progressLine(step, SESSION_TOTAL, lang),
  ].join('\n');
}

export function formatModulePrep(blockId, blockIndex, sections, lang = 'ru') {
  const meta = getModuleMeta(blockId, lang);
  return [
    formatModuleHeader(blockId, blockIndex, lang),
    '',
    section('Описание', `<i>${escapeHtml(meta.brief)}</i>`, '📋'),
    ...sections.filter(Boolean),
    '',
    `<i>▶ ${lang === 'en' ? 'When ready — run the module.' : 'Когда готовы — запустите модуль.'}</i>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function formatModuleResult(blockId, blockIndex, bodyHtml, lang = 'ru') {
  const label = lang === 'en' ? 'Interpretation' : 'Интерпретация';
  const footer =
    lang === 'en'
      ? 'Ask a question or proceed to the next module.'
      : 'Задайте вопрос или перейдите к следующему модулю.';

  return [
    formatModuleHeader(blockId, blockIndex, lang),
    '',
    `🔮 <b>${label}</b>`,
    '',
    bodyHtml || `<i>${lang === 'en' ? 'Module completed.' : 'Модуль выполнен.'}</i>`,
    '',
    `<i>💬 ${footer}</i>`,
  ].join('\n');
}

export function formatClarification(blockId, bodyHtml, lang = 'ru') {
  const meta = getModuleMeta(blockId, lang);
  return [`💬 <b>${lang === 'en' ? 'Clarification' : 'Уточнение'}</b> · <i>${escapeHtml(meta.title)}</i>`, '', bodyHtml].join(
    '\n'
  );
}

export function formatClientProfile(data, lang = 'ru') {
  const goalSummary = formatGoalSummary(data, lang);

  const fields = [
    [ONBOARDING_ICON.gender, lang === 'en' ? 'Gender' : 'Пол', data.gender_label ?? '—'],
    [ONBOARDING_ICON.birth_date, lang === 'en' ? 'Birth date' : 'Дата', data.birth_date ?? '—'],
    [ONBOARDING_ICON.birth_time, lang === 'en' ? 'Birth time' : 'Время', data.birth_time ?? '—'],
    [ONBOARDING_ICON.birth_place, lang === 'en' ? 'Birth place' : 'Место', data.birth_place ?? '—'],
  ];

  const rows = fields.map(([icon, k, v]) => `${icon} <b>${k}</b>\n${escapeHtml(String(v))}`).join('\n\n');

  return [
    letterhead(lang === 'en' ? 'Profile check' : 'Проверка профиля', lang),
    '',
    ...(goalSummary ? [goalSummary, ''] : []),
    rows,
    '',
    `<i>${ONBOARDING_ICON.confirm} ${lang === 'en' ? 'Confirm to begin.' : 'Подтвердите, чтобы начать.'}</i>`,
  ].join('\n');
}

export function formatSessionComplete(reportHtml, lang = 'ru') {
  return [
    letterhead(lang === 'en' ? 'Complete' : 'Завершено', lang),
    '',
    reportHtml,
    '',
    `<i>🎉 ${lang === 'en' ? 'Thank you for completing the full protocol.' : 'Спасибо за прохождение полного протокола.'}</i>`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export function formatWelcome(lang = 'ru') {
  return [
    letterhead(null, lang),
    '',
    `<i>${BRAND.tagline[lang === 'en' ? 'en' : 'ru']}</i>`,
    `<i>${BRAND.subtitle[lang === 'en' ? 'en' : 'ru']}</i>`,
    '',
    lang === 'en' ? 'Choose an action:' : 'Выберите действие:',
  ].join('\n');
}

export function onboardingHeader(step, total, label, lang = 'ru') {
  return formatInitStep(step, total, 'gender', lang);
}
