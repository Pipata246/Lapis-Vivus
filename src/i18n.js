// Multilingual support for Lapis Vivus Bot

import { btn, formatWelcome, formatHelp, letterhead } from './ui/brand.js';
import { u as userCopy } from './ui/userCopy.js';

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
    editProfile: 'Edit profile',

    settingsTitle: 'Settings',
    settingsText: `${letterhead('Settings', 'en')}\n\nInterface preferences:`,
    changeLanguage: btn('en', 'changeLanguage'),
    languageEn: btn('en', 'languageEn'),
    languageRu: btn('en', 'languageRu'),
    languageChanged: 'Language changed to English',

    helpTitle: 'About',
    helpText: formatHelp('en'),

    adminPanel: 'Administrator',
    adminText: 'Select an action:',
    editSystemPrompt: 'System prompt',
    editBlocks: 'Analysis modules',
    editGlossary: 'Glossary',
    editBibliography: 'Bibliography',
    editCalculators: 'Calculators',
    insufficientRights: 'Insufficient access rights',

    errorOccurred: 'Something went wrong',
    tryAgain: 'Please try again or send /start',
    commandsDisabled: 'Send /start to open the main menu.',
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
    editProfile: 'Редактировать профиль',

    settingsTitle: 'Настройки',
    settingsText: `${letterhead('Настройки', 'ru')}\n\nПараметры интерфейса:`,
    changeLanguage: btn('ru', 'changeLanguage'),
    languageEn: btn('ru', 'languageEn'),
    languageRu: btn('ru', 'languageRu'),
    languageChanged: 'Язык изменён на русский',

    helpTitle: 'О системе',
    helpText: formatHelp('ru'),

    adminPanel: 'Администратор',
    adminText: 'Выберите действие:',
    editSystemPrompt: 'Системный промпт',
    editBlocks: 'Модули анализа',
    editGlossary: 'Глоссарий',
    editBibliography: 'Библиография',
    editCalculators: 'Калькуляторы',
    insufficientRights: 'Недостаточно прав доступа',

    errorOccurred: 'Не удалось выполнить действие',
    tryAgain: 'Попробуйте ещё раз или отправьте /start',
    commandsDisabled: 'Используйте /start для главного меню.',
  },
};

export function t(lang, key, params = {}) {
  const translation = translations[lang]?.[key] || translations.en[key] || key;
  if (!translation) return key;

  return translation.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return params[paramKey] !== undefined ? params[paramKey] : match;
  });
}

export { userCopy as u };

export function getLanguageName(lang) {
  const names = { en: 'English', ru: 'Русский' };
  return names[lang] || names.en;
}

export function isValidLanguage(lang) {
  return ['en', 'ru'].includes(lang);
}
