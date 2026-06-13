/**
 * Визуальный язык Lapis Vivus — сдержанный, деловой, премиальный.
 * Без эмодзи в интерфейсе; HTML для Telegram.
 */

export const BRAND = {
  name: 'Lapis Vivus',
  tagline: {
    ru: 'Персональная система глубинного анализа',
    en: 'Personal deep analysis system',
  },
};

export const BTN = {
  ru: {
    startAnalysis: 'Начать анализ',
    myProfile: 'Профиль',
    settings: 'Настройки',
    help: 'Справка',
    back: 'Назад',
    close: 'Закрыть',
    cancel: 'Отмена',
    menu: 'Главное меню',
    confirm: 'Подтвердить и продолжить',
    editData: 'Изменить данные',
    timeUnknown: 'Время неизвестно',
    runStage: 'Запустить этап',
    skipStage: 'Пропустить этап',
    nextStage: 'Следующий этап',
    retryStage: 'Повторить этап',
    newAnalysis: 'Новый анализ',
    usefulLinks: 'Справочные ресурсы',
    howApply: 'Как применить',
    moreDetail: 'Подробнее',
    whatMeans: 'Уточнить значение',
    menuAbort: 'Главное меню · прервать',
    changeLanguage: 'Язык интерфейса',
    languageEn: 'English',
    languageRu: 'Русский',
  },
  en: {
    startAnalysis: 'Start analysis',
    myProfile: 'Profile',
    settings: 'Settings',
    help: 'Help',
    back: 'Back',
    close: 'Close',
    cancel: 'Cancel',
    menu: 'Main menu',
    confirm: 'Confirm and continue',
    editData: 'Edit data',
    timeUnknown: 'Time unknown',
    runStage: 'Run stage',
    skipStage: 'Skip stage',
    nextStage: 'Next stage',
    retryStage: 'Retry stage',
    newAnalysis: 'New analysis',
    usefulLinks: 'Reference resources',
    howApply: 'How to apply',
    moreDetail: 'More detail',
    whatMeans: 'Clarify meaning',
    menuAbort: 'Main menu · abort',
    changeLanguage: 'Interface language',
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

/** Тонкая линия-разделитель в Telegram HTML */
export function divider() {
  return '<i>———————————————</i>';
}

/** Заголовок этапа анализа */
export function stageHeader(title, step, total) {
  return `<b>${escapeHtml(title)}</b>\n<i>Этап ${step} из ${total} · ${BRAND.name}</i>`;
}

/** Заголовок шага анкеты */
export function onboardingHeader(step, total, label, lang = 'ru') {
  const prefix = lang === 'en' ? 'Step' : 'Шаг';
  const of = lang === 'en' ? 'of' : 'из';
  return `<b>${BRAND.name}</b>\n<i>${prefix} ${step} ${of} ${total} · ${escapeHtml(label)}</i>`;
}

/** Профиль перед подтверждением */
export function formatClientProfile(data, lang = 'ru') {
  const title = lang === 'en' ? 'Client profile' : 'Профиль клиента';
  const lines = [
    `<b>${title}</b>`,
    divider(),
    `${lang === 'en' ? 'Gender' : 'Пол'} · ${data.gender_label ?? '—'}`,
    `${lang === 'en' ? 'Birth date' : 'Дата рождения'} · ${data.birth_date ?? '—'}`,
    `${lang === 'en' ? 'Birth time' : 'Время рождения'} · ${data.birth_time ?? '—'}`,
    `${lang === 'en' ? 'Birth place' : 'Место рождения'} · ${data.birth_place ?? '—'}`,
  ];
  return lines.join('\n');
}

/** Итоговый отчёт после полного цикла */
export function formatCompletionReport(profileHtml) {
  return [
    `<b>${BRAND.name}</b>`,
    `<i>Анализ завершён</i>`,
    divider(),
    profileHtml,
  ].join('\n\n');
}
