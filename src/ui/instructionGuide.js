/**
 * Пошаговая инструкция — слайды с навигацией вперёд/назад.
 */

import { letterhead, section, stepDots, btn } from './brand.js';

const SLIDES = {
  ru: [
    {
      icon: '💎',
      title: 'Добро пожаловать',
      body: [
        'Lapis Vivus — персональный протокол глубинного анализа по вашему профилю рождения.',
        '',
        'Всё управление — через <b>главное меню</b>: одно сообщение, кнопки внизу. Нажимайте «🏠 Главное меню», чтобы вернуться в любой момент.',
      ].join('\n'),
    },
    {
      icon: '▶',
      title: 'Запуск протокола',
      body: [
        'Нажмите <b>«💎 Запустить протокол»</b> в главном меню.',
        '',
        'Бот соберёт данные рождения и предложит выбрать фокус сессии или пройти полный маршрут из пяти частей.',
      ].join('\n'),
    },
    {
      icon: '👤',
      title: 'Профиль рождения',
      body: [
        'Укажите по шагам:',
        '· пол',
        '· дату рождения <b>ДД.ММ.ГГГГ</b>',
        '· время <b>ЧЧ:ММ</b> или «⏳ Время неизвестно»',
        '· город рождения',
        '',
        'Проверьте сводку и нажмите <b>«✓ Всё верно — начать»</b>. Данные можно изменить в «👤 Мой профиль».',
      ].join('\n'),
    },
    {
      icon: '🎯',
      title: 'Фокус сессии',
      body: [
        'Выберите запрос кнопкой в дереве целей — бот подберёт нужный этап протокола.',
        '',
        'Или пройдите <b>полный маршрут</b> шаг за шагом: происхождение → полярность → сущность → связи → интеграция.',
      ].join('\n'),
    },
    {
      icon: '🔮',
      title: 'Этапы протокола',
      body: [
        'На каждом этапе:',
        '1. Прочитайте описание шага',
        '2. Нажмите <b>«▶ Запустить этап»</b>',
        '3. Дождитесь интерпретации',
        '4. Задайте уточняющий вопрос или перейдите к следующему этапу',
        '',
        'Длинные ответы можно листать кнопками ◀ Назад / Далее ▶.',
      ].join('\n'),
    },
    {
      icon: '💫',
      title: 'Совместимость пары',
      body: [
        'Кнопка <b>«💫 Совместимость»</b> в главном меню — отдельный сценарий.',
        '',
        'Выберите контекст (отношения, семья, бизнес, дружба), заполните данные обоих людей и запустите анализ.',
        '',
        'В отчёте — динамика связи, сильные стороны, риски и <b>итоговый вердикт</b> с рекомендацией.',
      ].join('\n'),
    },
    {
      icon: '💰',
      title: 'Профиль и баланс',
      body: [
        '<b>«👤 Мой профиль»</b> — данные рождения и прогресс текущей сессии.',
        '',
        '<b>«💰 Баланс»</b> — пополнение через ЮKassa (счёт действует 10 минут) и магазин.',
        '',
        '<b>«⚙️ Настройки»</b> — смена языка интерфейса (русский / English).',
      ].join('\n'),
    },
    {
      icon: '💬',
      title: 'Поддержка и документы',
      body: [
        'Вопросы по работе сервиса — кнопка <b>«💬 Поддержка»</b> в справке.',
        '',
        'Сообщество — <b>«👥 Сообщество»</b>. Политика и оферта — кнопками в разделе «📖 Справка».',
        '',
        'Готовы? Вернитесь в главное меню и нажмите <b>«💎 Запустить протокол»</b> или <b>«💫 Совместимость»</b>.',
      ].join('\n'),
    },
  ],
  en: [
    {
      icon: '💎',
      title: 'Welcome',
      body: [
        'Lapis Vivus is a personal deep-analysis protocol built on your birth profile.',
        '',
        'Everything runs from the <b>main menu</b> — one message, buttons below. Tap «🏠 Main menu» anytime to return.',
      ].join('\n'),
    },
    {
      icon: '▶',
      title: 'Launch protocol',
      body: [
        'Tap <b>«💎 Launch protocol»</b> in the main menu.',
        '',
        'The bot collects birth data and lets you choose a session focus or the full five-part route.',
      ].join('\n'),
    },
    {
      icon: '👤',
      title: 'Birth profile',
      body: [
        'Enter step by step:',
        '· gender',
        '· birth date <b>DD.MM.YYYY</b>',
        '· time <b>HH:MM</b> or «⏳ Time unknown»',
        '· birth city',
        '',
        'Review the summary and tap <b>«✓ Confirm & start»</b>. Edit anytime in «👤 My profile».',
      ].join('\n'),
    },
    {
      icon: '🎯',
      title: 'Session focus',
      body: [
        'Pick your question from the goal tree — the bot selects the right protocol step.',
        '',
        'Or follow the <b>full route</b> step by step: origin → polarity → essence → connections → integration.',
      ].join('\n'),
    },
    {
      icon: '🔮',
      title: 'Protocol steps',
      body: [
        'On each step:',
        '1. Read the step overview',
        '2. Tap <b>«▶ Run step»</b>',
        '3. Wait for the interpretation',
        '4. Ask a follow-up or move to the next step',
        '',
        'Long answers can be browsed with ◀ Back / Next ▶.',
      ].join('\n'),
    },
    {
      icon: '💫',
      title: 'Pair compatibility',
      body: [
        '<b>«💫 Pair analysis»</b> in the main menu is a separate flow.',
        '',
        'Choose context (relationships, family, business, friendship), enter both profiles, and run the analysis.',
        '',
        'The report covers dynamics, strengths, risks, and a <b>clear verdict</b> with recommendation.',
      ].join('\n'),
    },
    {
      icon: '💰',
      title: 'Profile & balance',
      body: [
        '<b>«👤 My profile»</b> — birth data and session progress.',
        '',
        '<b>«💰 Balance»</b> — top up via YooKassa (invoice valid 10 minutes) and shop.',
        '',
        '<b>«⚙️ Settings»</b> — interface language (Russian / English).',
      ].join('\n'),
    },
    {
      icon: '💬',
      title: 'Support & documents',
      body: [
        'Service questions — <b>«💬 Support»</b> button in Help.',
        '',
        'Community — <b>«👥 Community»</b>. Privacy policy and offer — buttons in «📖 Help».',
        '',
        'Ready? Return to the main menu and tap <b>«💎 Launch protocol»</b> or <b>«💫 Pair analysis»</b>.',
      ].join('\n'),
    },
  ],
};

function slidesFor(lang) {
  return SLIDES[lang === 'en' ? 'en' : 'ru'];
}

export function getInstructionSlideCount(lang = 'ru') {
  return slidesFor(lang).length;
}

export function instructionKeyboard(lang, pageIndex, total) {
  const code = lang === 'en' ? 'en' : 'ru';
  const rows = [];
  const navRow = [];

  if (pageIndex > 0) {
    navRow.push({ text: code === 'en' ? '◀ Back' : '◀ Назад', callback_data: `nav:inst:${pageIndex - 1}` });
  }
  if (pageIndex < total - 1) {
    navRow.push({ text: code === 'en' ? 'Next ▶' : 'Далее ▶', callback_data: `nav:inst:${pageIndex + 1}` });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  if (pageIndex >= total - 1) {
    rows.push([{ text: btn(lang, 'help'), callback_data: 'nav:help' }]);
  }

  rows.push([{ text: btn(lang, 'menu'), callback_data: 'lv:menu' }]);

  return { inline_keyboard: rows };
}

/**
 * @param {string} lang
 * @param {number} pageIndex — 0-based
 */
export function renderInstructionSlide(lang = 'ru', pageIndex = 0) {
  const code = lang === 'en' ? 'en' : 'ru';
  const slides = slidesFor(lang);
  const total = slides.length;
  const index = Math.min(Math.max(Number(pageIndex) || 0, 0), total - 1);
  const slide = slides[index];
  const step = index + 1;

  const header = letterhead(code === 'en' ? 'Guide' : 'Инструкция', lang);
  const progress = `<i>${stepDots(step, total)} · ${code === 'en' ? 'Step' : 'Шаг'} ${step}/${total}</i>`;
  const body = section(slide.title, slide.body, slide.icon);

  const text = [header, '', progress, '', body].join('\n');
  const keyboard = instructionKeyboard(lang, index, total);

  return { text, keyboard, index, total };
}
