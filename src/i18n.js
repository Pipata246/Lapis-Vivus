// Multilingual support for Lapis Vivus Bot
// Supported languages: en (English), ru (Russian)

import { BRAND, btn } from './ui/brand.js';

const translations = {
  en: {
    welcome: `<b>${BRAND.name}</b>`,
    welcomeText:
      `<i>${BRAND.tagline.en}</i>\n\n` +
      'Structured multi-stage analysis based on your birth profile.\n\n' +
      'Select an action:',

    mainMenu: 'Main menu',
    startAnalysis: btn('en', 'startAnalysis'),
    myProfile: btn('en', 'myProfile'),
    settings: btn('en', 'settings'),
    help: btn('en', 'help'),
    back: btn('en', 'back'),
    close: btn('en', 'close'),

    profileTitle: 'Profile',
    profileInfo:
      `<b>Your profile</b>\n\n` +
      `Telegram ID · {telegramId}\n` +
      `Name · {name}\n` +
      `Language · {language}\n` +
      `Registered · {createdAt}\n\n` +
      'Select an action:',
    editProfile: 'Edit profile',

    settingsTitle: 'Settings',
    settingsText: 'Configure your preferences:',
    changeLanguage: btn('en', 'changeLanguage'),
    languageEn: btn('en', 'languageEn'),
    languageRu: btn('en', 'languageRu'),
    languageChanged: 'Language changed to English',

    helpTitle: 'Help',
    helpText:
      `<b>${BRAND.name}</b>\n\n` +
      'The system performs structured psychological and astrological analysis in sequential stages.\n\n' +
      '<b>Workflow</b>\n' +
      '1. Start analysis from the main menu\n' +
      '2. Enter your birth data\n' +
      '3. Complete each stage in order\n' +
      '4. Review results and proceed to the next stage\n\n' +
      '<b>Support</b>\n' +
      'For technical issues, contact the administrator.',

    adminPanel: 'Administrator panel',
    adminText: 'Select an action:',
    editSystemPrompt: 'System prompt',
    editBlocks: 'Analysis stages',
    editGlossary: 'Glossary',
    editBibliography: 'Bibliography',
    editCalculators: 'Calculators',
    insufficientRights: 'Insufficient access rights',

    errorOccurred: 'Error',
    tryAgain: 'Please try again or send /start',
    commandsDisabled: 'Commands are disabled. Use /start and menu buttons.',
  },

  ru: {
    welcome: `<b>${BRAND.name}</b>`,
    welcomeText:
      `<i>${BRAND.tagline.ru}</i>\n\n` +
      'Структурированный многоэтапный анализ на основе вашего профиля рождения.\n\n' +
      'Выберите действие:',

    mainMenu: 'Главное меню',
    startAnalysis: btn('ru', 'startAnalysis'),
    myProfile: btn('ru', 'myProfile'),
    settings: btn('ru', 'settings'),
    help: btn('ru', 'help'),
    back: btn('ru', 'back'),
    close: btn('ru', 'close'),

    profileTitle: 'Профиль',
    profileInfo:
      `<b>Ваш профиль</b>\n\n` +
      `Telegram ID · {telegramId}\n` +
      `Имя · {name}\n` +
      `Язык · {language}\n` +
      `Регистрация · {createdAt}\n\n` +
      'Выберите действие:',
    editProfile: 'Редактировать профиль',

    settingsTitle: 'Настройки',
    settingsText: 'Параметры интерфейса:',
    changeLanguage: btn('ru', 'changeLanguage'),
    languageEn: btn('ru', 'languageEn'),
    languageRu: btn('ru', 'languageRu'),
    languageChanged: 'Язык изменён на русский',

    helpTitle: 'Справка',
    helpText:
      `<b>${BRAND.name}</b>\n\n` +
      'Система проводит структурированный психологический и астрологический анализ в последовательных этапах.\n\n' +
      '<b>Порядок работы</b>\n' +
      '1. Запустите анализ из главного меню\n' +
      '2. Введите данные рождения\n' +
      '3. Пройдите этапы в заданном порядке\n' +
      '4. Изучите результат и переходите к следующему этапу\n\n' +
      '<b>Поддержка</b>\n' +
      'По техническим вопросам обращайтесь к администратору.',

    adminPanel: 'Панель администратора',
    adminText: 'Выберите действие:',
    editSystemPrompt: 'Системный промпт',
    editBlocks: 'Этапы анализа',
    editGlossary: 'Глоссарий',
    editBibliography: 'Библиография',
    editCalculators: 'Калькуляторы',
    insufficientRights: 'Недостаточно прав доступа',

    errorOccurred: 'Ошибка',
    tryAgain: 'Повторите попытку или отправьте /start',
    commandsDisabled: 'Команды отключены. Используйте /start и кнопки меню.',
  },
};

export function t(lang, key, params = {}) {
  const translation = translations[lang]?.[key] || translations.en[key] || key;

  return translation.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return params[paramKey] !== undefined ? params[paramKey] : match;
  });
}

export function getLanguageName(lang) {
  const names = {
    en: 'English',
    ru: 'Русский',
  };
  return names[lang] || names.en;
}

export function isValidLanguage(lang) {
  return ['en', 'ru'].includes(lang);
}
