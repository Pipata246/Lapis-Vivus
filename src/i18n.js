// Multilingual support for Lapis Vivus Bot

import { BRAND, btn, formatWelcome, letterhead, divider } from './ui/brand.js';

const translations = {
  en: {
    welcome: formatWelcome('en'),
    welcomeText: '',

    mainMenu: 'Main menu',
    startAnalysis: btn('en', 'startAnalysis'),
    myProfile: btn('en', 'myProfile'),
    settings: btn('en', 'settings'),
    help: btn('en', 'help'),
    back: btn('en', 'back'),
    close: btn('en', 'close'),

    profileTitle: 'Client Profile',
    profileInfo:
      `${letterhead('Client Profile', 'en')}\n${divider()}\n` +
      `Telegram ID\n{telegramId}\n\n` +
      `Name\n{name}\n\n` +
      `Language\n{language}\n\n` +
      `Registered\n{createdAt}`,
    editProfile: 'Edit profile',

    settingsTitle: 'Settings',
    settingsText: `${letterhead('Settings', 'en')}\n${divider()}\nInterface preferences:`,
    changeLanguage: btn('en', 'changeLanguage'),
    languageEn: btn('en', 'languageEn'),
    languageRu: btn('en', 'languageRu'),
    languageChanged: 'Language changed to English',

    helpTitle: 'About',
    helpText:
      `${letterhead('About', 'en')}\n${divider()}\n` +
      `<i>${BRAND.tagline.en}</i>\n\n` +
      '<b>Session structure</b>\n' +
      '36 modules across 5 parts — from origin mapping to integration protocol.\n\n' +
      '<b>How to begin</b>\n' +
      '1. Start session from the main menu\n' +
      '2. Complete the profile protocol\n' +
      '3. Initiate each module in sequence\n' +
      '4. Review interpretation and proceed\n\n' +
      '<b>Support</b>\nContact the administrator for technical assistance.',

    adminPanel: 'Administrator',
    adminText: 'Select an action:',
    editSystemPrompt: 'System prompt',
    editBlocks: 'Analysis modules',
    editGlossary: 'Glossary',
    editBibliography: 'Bibliography',
    editCalculators: 'Calculators',
    insufficientRights: 'Insufficient access rights',

    errorOccurred: 'Error',
    tryAgain: 'Please try again or send /start',
    commandsDisabled: 'Commands are disabled. Use /start.',
  },

  ru: {
    welcome: formatWelcome('ru'),
    welcomeText: '',

    mainMenu: 'Главное меню',
    startAnalysis: btn('ru', 'startAnalysis'),
    myProfile: btn('ru', 'myProfile'),
    settings: btn('ru', 'settings'),
    help: btn('ru', 'help'),
    back: btn('ru', 'back'),
    close: btn('ru', 'close'),

    profileTitle: 'Профиль клиента',
    profileInfo:
      `${letterhead('Профиль клиента', 'ru')}\n${divider()}\n` +
      `Telegram ID\n{telegramId}\n\n` +
      `Имя\n{name}\n\n` +
      `Язык\n{language}\n\n` +
      `Регистрация\n{createdAt}`,
    editProfile: 'Редактировать профиль',

    settingsTitle: 'Настройки',
    settingsText: `${letterhead('Настройки', 'ru')}\n${divider()}\nПараметры интерфейса:`,
    changeLanguage: btn('ru', 'changeLanguage'),
    languageEn: btn('ru', 'languageEn'),
    languageRu: btn('ru', 'languageRu'),
    languageChanged: 'Язык изменён на русский',

    helpTitle: 'О системе',
    helpText:
      `${letterhead('О системе', 'ru')}\n${divider()}\n` +
      `<i>${BRAND.tagline.ru}</i>\n\n` +
      '<b>Структура сессии</b>\n' +
      '36 модулей в 5 частях — от карты происхождения до протокола интеграции.\n\n' +
      '<b>Как начать</b>\n' +
      '1. Начните сессию из главного меню\n' +
      '2. Пройдите протокол профиля\n' +
      '3. Инициируйте модули по порядку\n' +
      '4. Изучите интерпретацию и двигайтесь дальше\n\n' +
      '<b>Поддержка</b>\nПо техническим вопросам — администратор.',

    adminPanel: 'Администратор',
    adminText: 'Выберите действие:',
    editSystemPrompt: 'Системный промпт',
    editBlocks: 'Модули анализа',
    editGlossary: 'Глоссарий',
    editBibliography: 'Библиография',
    editCalculators: 'Калькуляторы',
    insufficientRights: 'Недостаточно прав доступа',

    errorOccurred: 'Ошибка',
    tryAgain: 'Повторите попытку или отправьте /start',
    commandsDisabled: 'Команды отключены. Используйте /start.',
  },
};

export function t(lang, key, params = {}) {
  const translation = translations[lang]?.[key] || translations.en[key] || key;
  if (!translation) return key;

  return translation.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return params[paramKey] !== undefined ? params[paramKey] : match;
  });
}

export function getLanguageName(lang) {
  const names = { en: 'English', ru: 'Русский' };
  return names[lang] || names.en;
}

export function isValidLanguage(lang) {
  return ['en', 'ru'].includes(lang);
}
