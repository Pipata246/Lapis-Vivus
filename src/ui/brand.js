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
    ru: 'Индивидуальный маршрут',
    en: 'Individual route',
  },
};

export const SUPPORT = {
  telegram: 'nikitok_m',
  telegramUrl: 'https://t.me/nikitok_m',
  telegramMention: '@nikitok_m',
};

export const COMMUNITY = {
  telegram: 'LapisVivus',
  telegramUrl: 'https://t.me/LapisVivus',
  telegramMention: '@LapisVivus',
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
  comparePair: '💫',
  myProfile: '👤',
  balance: '💰',
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
  swapToRu: '🇷🇺',
  swapToEn: '🇬🇧',
};

export const BTN = {
  ru: {
    startAnalysis: 'Запустить протокол',
    comparePair: 'Совместимость',
    myProfile: 'Мой профиль',
    balance: 'Баланс',
    settings: 'Настройки',
    help: 'Справка',
    back: 'Назад',
    close: 'Закрыть',
    cancel: 'Отмена',
    menu: 'Главное меню',
    confirm: 'Всё верно — начать',
    editData: 'Изменить данные',
    timeUnknown: 'Время неизвестно',
    runStage: 'Запустить этап',
    skipStage: 'Пропустить',
    nextStage: 'Следующий этап',
    finishSession: 'Завершить сессию',
    useMyProfile: 'Мой профиль',
    enterNewData: 'Ввести заново',
    confirmCompare: 'Запустить анализ',
    editPartner: 'Изменить 2-го',
    editSubject: 'Изменить мои',
    compareCustom: '✏️ Свой вариант',
    retryStage: 'Повторить',
    newAnalysis: 'Новая сессия',
    usefulLinks: 'Калькуляторы',
    howApply: 'Как применить',
    moreDetail: 'Подробнее',
    whatMeans: 'Что это значит',
    menuAbort: 'В меню',
    changeLanguage: 'Язык',
    languageEn: 'English',
    languageRu: 'Русский',
    swapToRu: 'Переключить на русский',
    swapToEn: 'Поменять на английский',
  },
  en: {
    startAnalysis: 'Launch protocol',
    comparePair: 'Pair analysis',
    myProfile: 'My profile',
    balance: 'Balance',
    settings: 'Settings',
    help: 'Help',
    back: 'Back',
    close: 'Close',
    cancel: 'Cancel',
    menu: 'Main menu',
    confirm: 'Confirm & start',
    editData: 'Edit data',
    timeUnknown: 'Time unknown',
    runStage: 'Run step',
    skipStage: 'Skip',
    nextStage: 'Next step',
    finishSession: 'Finish session',
    useMyProfile: 'Use my profile',
    enterNewData: 'Enter again',
    confirmCompare: 'Run analysis',
    editPartner: 'Edit person 2',
    editSubject: 'Edit mine',
    compareCustom: '✏️ Custom',
    retryStage: 'Retry',
    newAnalysis: 'New session',
    usefulLinks: 'Calculators',
    howApply: 'How to apply',
    moreDetail: 'More detail',
    whatMeans: 'What it means',
    menuAbort: 'Main menu',
    changeLanguage: 'Language',
    languageEn: 'English',
    languageRu: 'Russian',
    swapToRu: 'Switch to Russian',
    swapToEn: 'Switch to English',
  },
};

export function btn(lang, key) {
  const code = lang === 'en' ? 'en' : 'ru';
  const label = BTN[code][key] ?? BTN.ru[key] ?? key;
  const emoji = BTN_EMOJI[key];
  return emoji ? `${emoji} ${label}` : label;
}

/** Одна кнопка «переключить на другой язык» для приветствия и согласия. */
export function languageSwapRow(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  const key = code === 'en' ? 'swapToRu' : 'swapToEn';
  return [{ text: btn(lang, key), callback_data: 'nav:lang_swap' }];
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
  return `<i>${label} · ${num} · ${pct}%</i>`;
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
    lang === 'en' ? `Step ${String(step).padStart(2, '0')}` : `Этап ${String(step).padStart(2, '0')}`;

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
  const descLabel = lang === 'en' ? 'Overview' : 'Описание';
  return [
    formatModuleHeader(blockId, blockIndex, lang),
    '',
    section(descLabel, `<i>${escapeHtml(meta.brief)}</i>`, '◆'),
    ...sections.filter(Boolean),
    '',
    `<i>${lang === 'en' ? 'When ready — run the step.' : 'Когда готовы — запустите этап.'}</i>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function formatModuleResult(blockId, blockIndex, bodyHtml, lang = 'ru') {
  const label = lang === 'en' ? 'Interpretation' : 'Интерпретация';

  return [
    formatModuleHeader(blockId, blockIndex, lang),
    '',
    `🔮 <b>${label}</b>`,
    '',
    bodyHtml || `<i>${lang === 'en' ? 'Step completed.' : 'Этап завершён.'}</i>`,
    '',
    `<i>${lang === 'en' ? 'Ask a question or continue to the next step.' : 'Задайте вопрос или перейдите к следующему этапу.'}</i>`,
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
    `<i>${lang === 'en' ? 'Thank you for completing the full protocol.' : 'Спасибо за прохождение полного протокола.'}</i>`,
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

/** Экран «Справка» — премиальный стиль, контакт поддержки. */
export function formatHelp(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const contact = `<a href="${SUPPORT.telegramUrl}">${SUPPORT.telegramMention}</a>`;

  if (code === 'en') {
    return [
      letterhead('Help', lang),
      '',
      `<i>${BRAND.tagline.en}</i>`,
      `<i>${BRAND.subtitle.en}</i>`,
      '',
      section(
        'About',
        'Lapis Vivus is a personal route through interpretation steps — from your origin map to an integration protocol. Each step is built on your birth profile and session focus.',
        '✨',
      ),
      '',
      section(
        'Session structure',
        'Five parts — origin, polarity, essence, connections, integration. You may choose a focus or follow the full route step by step.',
        '🗺',
      ),
      '',
      section(
        'How to begin',
        [
        '1. Tap «Launch protocol» in the main menu',
        '2. Complete your birth profile (date, time, place)',
        '3. Choose a session focus or the full route',
        '4. Run steps in order and ask clarifying questions',
        ].join('\n'),
        '▶',
      ),
      '',
      section(
        'Profile & balance',
        '«My profile» — birth data and session progress. «Balance» — top up via YooKassa (invoice valid 10 minutes) and shop.',
        '👤',
      ),
      '',
      section(
        'Commands',
        [
          '/start — main menu',
          '/profile — my profile',
          '/balance — balance and top-up',
          '/protocol — launch protocol',
          '/settings — language',
          '/help — this guide',
        ].join('\n'),
        '⚙️',
      ),
      '',
      section('Support', `For service questions, contact ${contact}. Community — <a href="${COMMUNITY.telegramUrl}">${COMMUNITY.telegramMention}</a>.`, '💬'),
    ].join('\n');
  }

  return [
    letterhead('Справка', lang),
    '',
    `<i>${BRAND.tagline.ru}</i>`,
    `<i>${BRAND.subtitle.ru}</i>`,
    '',
    section(
      'О проекте',
      'Lapis Vivus — индивидуальный маршрут через этапы интерпретации: от карты происхождения до протокола интеграции. Каждый шаг строится на вашем профиле рождения и выбранном фокусе сессии.',
      '✨',
    ),
    '',
    section(
      'Структура сессии',
      'Пять частей — происхождение, полярность, сущность, связи, интеграция. Можно выбрать фокус или пройти полный маршрут шаг за шагом.',
      '🗺',
    ),
    '',
    section(
      'Как начать',
      [
        '1. Нажмите «Запустить протокол» в главном меню',
        '2. Заполните профиль рождения (дата, время, место)',
        '3. Выберите фокус сессии или полный маршрут',
        '4. Проходите этапы по очереди и задавайте уточняющие вопросы',
      ].join('\n'),
      '▶',
    ),
    '',
      section(
        'Профиль и баланс',
        '«Мой профиль» — данные рождения и прогресс сессии. «Баланс» — пополнение через ЮKassa (счёт 10 минут) и магазин.',
        '👤',
      ),
    '',
    section(
      'Команды',
      [
          '/start — главное меню',
          '/profile — мой профиль',
          '/balance — баланс и пополнение',
          '/protocol — запустить протокол',
        '/settings — язык интерфейса',
        '/help — эта справка',
      ].join('\n'),
      '⚙️',
    ),
    '',
    section('Поддержка', `По вопросам работы сервиса — ${contact}. Сообщество — <a href="${COMMUNITY.telegramUrl}">${COMMUNITY.telegramMention}</a>.`, '💬'),
  ].join('\n');
}

export function onboardingHeader(step, total, label, lang = 'ru') {
  return formatInitStep(step, total, 'gender', lang);
}
