/**
 * Премиальный визуальный язык Lapis Vivus.
 * Структура: letterhead → раздел → контент → footer.
 */

import { getModuleMeta, SESSION_TOTAL } from './modules.js';

export const BRAND = {
  name: 'Lapis Vivus',
  nameUpper: 'LAPIS VIVUS',
  sessionLabel: { ru: 'Private Session', en: 'Private Session' },
  tagline: {
    ru: 'Персональный протокол глубинного анализа',
    en: 'Personal protocol of deep analysis',
  },
  subtitle: {
    ru: '36 модулей · индивидуальный маршрут',
    en: '36 modules · individual route',
  },
};

export const BTN = {
  ru: {
    startAnalysis: 'Начать сессию',
    myProfile: 'Профиль клиента',
    settings: 'Настройки',
    help: 'О системе',
    back: 'Назад',
    close: 'Закрыть',
    cancel: 'Прервать',
    menu: 'Главное меню',
    confirm: 'Подтвердить профиль',
    editData: 'Изменить данные',
    timeUnknown: 'Время неизвестно',
    runStage: 'Инициировать модуль',
    skipStage: 'Пропустить модуль',
    nextStage: 'Следующий модуль',
    retryStage: 'Повторить модуль',
    newAnalysis: 'Новая сессия',
    usefulLinks: 'Инструменты расчёта',
    howApply: 'Практическое применение',
    moreDetail: 'Расширить трактовку',
    whatMeans: 'Смысл для меня',
    menuAbort: 'Прервать сессию',
    changeLanguage: 'Язык',
    languageEn: 'English',
    languageRu: 'Русский',
  },
  en: {
    startAnalysis: 'Begin session',
    myProfile: 'Client profile',
    settings: 'Settings',
    help: 'About',
    back: 'Back',
    close: 'Close',
    cancel: 'Abort',
    menu: 'Main menu',
    confirm: 'Confirm profile',
    editData: 'Edit data',
    timeUnknown: 'Time unknown',
    runStage: 'Initiate module',
    skipStage: 'Skip module',
    nextStage: 'Next module',
    retryStage: 'Retry module',
    newAnalysis: 'New session',
    usefulLinks: 'Calculation tools',
    howApply: 'Practical application',
    moreDetail: 'Expand reading',
    whatMeans: 'Meaning for me',
    menuAbort: 'Abort session',
    changeLanguage: 'Language',
    languageEn: 'English',
    languageRu: 'Russian',
  },
};

export function btn(lang, key) {
  const code = lang === 'en' ? 'en' : 'ru';
  return BTN[code][key] ?? BTN.ru[key] ?? key;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function divider() {
  return '━━━━━━━━━━━━━━━━━━━━';
}

export function letterhead(context, lang = 'ru') {
  const session = BRAND.sessionLabel[lang === 'en' ? 'en' : 'ru'];
  return `<b>${BRAND.nameUpper}</b>\n<i>${session}${context ? ` · ${context}` : ''}</i>`;
}

export function progressLine(step, total = SESSION_TOTAL, lang = 'ru') {
  const pct = Math.min(100, Math.round((step / total) * 100));
  const num = String(step).padStart(2, '0');
  const label = lang === 'en' ? 'Progress' : 'Прогресс';
  return `<i>${label} · ${num} / ${total} · ${pct}%</i>`;
}

export function section(title, body) {
  if (!body) return '';
  return `<b>${escapeHtml(title)}</b>\n${body}`;
}

/** Заголовок модуля (экран подготовки и результат) */
export function formatModuleHeader(blockId, blockIndex, lang = 'ru') {
  const meta = getModuleMeta(blockId, lang);
  const step = blockIndex + 1;

  return [
    letterhead(`Module ${String(step).padStart(2, '0')}`, lang),
    divider(),
    `<b>${escapeHtml(meta.title)}</b>`,
    `<i>Part ${meta.part} · ${escapeHtml(meta.partName)}</i>`,
    progressLine(step, SESSION_TOTAL, lang),
  ].join('\n');
}

/** Экран подготовки модуля */
export function formatModulePrep(blockId, blockIndex, sections, lang = 'ru') {
  const meta = getModuleMeta(blockId, lang);
  const parts = [
    formatModuleHeader(blockId, blockIndex, lang),
    divider(),
    section(lang === 'en' ? 'Overview' : 'Описание', `<i>${escapeHtml(meta.brief)}</i>`),
    ...sections.filter(Boolean),
    divider(),
    `<i>${lang === 'en' ? 'When ready, initiate the module.' : 'Когда будете готовы — инициируйте модуль.'}</i>`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

/** Обёртка результата модуля / ответа ИИ */
export function formatModuleResult(blockId, blockIndex, bodyHtml, lang = 'ru') {
  const label = lang === 'en' ? 'Interpretation' : 'Интерпретация';
  const footer =
    lang === 'en'
      ? 'Ask a clarifying question or proceed to the next module.'
      : 'Задайте уточняющий вопрос или перейдите к следующему модулю.';

  return [
    formatModuleHeader(blockId, blockIndex, lang),
    divider(),
    `<b>${label}</b>`,
    '',
    bodyHtml || `<i>${lang === 'en' ? 'Module completed. Data recorded.' : 'Модуль выполнен. Данные зафиксированы.'}</i>`,
    divider(),
    `<i>${footer}</i>`,
  ].join('\n');
}

/** Обёртка уточняющего ответа (без полного letterhead) */
export function formatClarification(blockId, bodyHtml, lang = 'ru') {
  const meta = getModuleMeta(blockId, lang);
  const label = lang === 'en' ? 'Clarification' : 'Уточнение';
  return [
    `<b>${label}</b> · <i>${escapeHtml(meta.title)}</i>`,
    divider(),
    bodyHtml,
  ].join('\n\n');
}

/** Протокол инициализации (анкета) */
export function formatInitStep(step, total, label, prompt, lang = 'ru') {
  const protocol = lang === 'en' ? 'Profile Protocol' : 'Протокол профиля';
  return [
    letterhead(protocol, lang),
    divider(),
    `<b>${escapeHtml(label)}</b>`,
    progressLine(step, total, lang),
    '',
    prompt,
  ].join('\n');
}

/** Профиль перед подтверждением */
export function formatClientProfile(data, lang = 'ru') {
  const title = lang === 'en' ? 'Client Profile' : 'Профиль клиента';
  const fields = [
    [lang === 'en' ? 'Gender' : 'Пол', data.gender_label ?? '—'],
    [lang === 'en' ? 'Birth date' : 'Дата рождения', data.birth_date ?? '—'],
    [lang === 'en' ? 'Birth time' : 'Время рождения', data.birth_time ?? '—'],
    [lang === 'en' ? 'Birth place' : 'Место рождения', data.birth_place ?? '—'],
  ];

  const rows = fields.map(([k, v]) => `${k}\n${v}`).join('\n\n');

  return [
    letterhead(title, lang),
    divider(),
    rows,
    divider(),
    `<i>${lang === 'en' ? 'Verify before starting the session.' : 'Проверьте данные перед началом сессии.'}</i>`,
  ].join('\n\n');
}

/** Завершение полной сессии */
export function formatSessionComplete(reportHtml, lang = 'ru') {
  const done = lang === 'en' ? 'Session Complete' : 'Сессия завершена';
  return [
    letterhead(done, lang),
    divider(),
    reportHtml,
    divider(),
    `<i>${lang === 'en' ? 'Thank you for completing the full protocol.' : 'Благодарим за прохождение полного протокола.'}</i>`,
  ].join('\n\n');
}

/** Главное меню — текст приветствия */
export function formatWelcome(lang = 'ru') {
  return [
    letterhead(null, lang),
    divider(),
    `<i>${BRAND.tagline[lang === 'en' ? 'en' : 'ru']}</i>`,
    `<i>${BRAND.subtitle[lang === 'en' ? 'en' : 'ru']}</i>`,
    '',
    lang === 'en' ? 'Select an action below.' : 'Выберите действие ниже.',
  ].join('\n');
}
