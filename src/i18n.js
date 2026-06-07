// Multilingual support for Lapis Vivus Bot
// Supported languages: en (English), ru (Russian)

const translations = {
  en: {
    // Start and Welcome
    welcome: '👋 Welcome to Lapis Vivus',
    welcomeText: 'AI-powered system for deep psychological and astrological analysis.\n\nChoose an action:',
    
    // Main Menu
    mainMenu: '📋 Main Menu',
    startAnalysis: '🔮 Start Analysis',
    myProfile: '👤 My Profile',
    settings: '⚙️ Settings',
    help: '❓ Help',
    back: '◀️ Back',
    close: '❌ Close',
    
    // Profile
    profileTitle: '👤 Your Profile',
    profileInfo: `*Your Profile*\n\n` +
      `📱 Telegram ID: {telegramId}\n` +
      `👤 Name: {name}\n` +
      `🌐 Language: {language}\n` +
      `📅 Registered: {createdAt}\n` +
      `📊 Sessions: {sessions}\n\n` +
      `Choose an action:`,
    editProfile: '✏️ Edit Profile',
    viewSessions: '📊 View Sessions',
    
    // Settings
    settingsTitle: '⚙️ Settings',
    settingsText: 'Configure your preferences:',
    changeLanguage: '🌐 Change Language',
    languageEn: '🇬🇧 English',
    languageRu: '🇷🇺 Русский',
    languageChanged: '✅ Language changed to English',
    
    // Help
    helpTitle: '❓ Help',
    helpText: `*Lapis Vivus Help*\n\n` +
      `This bot provides deep psychological and astrological analysis based on your profile.\n\n` +
      `*How to use:*\n` +
      `1. Start analysis by pressing 🔮 Start Analysis\n` +
      `2. Follow the bot instructions\n` +
      `3. View your profile and sessions in 👤 My Profile\n\n` +
      `*Settings:*\n` +
      `You can change language and other preferences in ⚙️ Settings\n\n` +
      `*Support:*\n` +
      `If you have questions, contact administrator.`,
    
    // Admin
    adminPanel: '🔐 Administrator Panel',
    adminText: 'Choose an action:',
    editSystemPrompt: '📝 Edit System Prompt',
    editBlocks: '🔄 Edit Blocks',
    editGlossary: '📖 Edit Glossary',
    editBibliography: '📚 Edit Bibliography',
    editCalculators: '🔗 Edit Calculators',
    insufficientRights: 'Insufficient rights',
    
    // Errors
    errorOccurred: '❌ Error occurred',
    tryAgain: 'Try again or use /start',
    commandsDisabled: 'Commands are disabled. Use /start and scenario buttons.',
  },
  
  ru: {
    // Start and Welcome
    welcome: '👋 Добро пожаловать в Lapis Vivus',
    welcomeText: 'ИИ-система для глубокого психологического и астрологического анализа.\n\nВыберите действие:',
    
    // Main Menu
    mainMenu: '📋 Главное меню',
    startAnalysis: '🔮 Начать анализ',
    myProfile: '👤 Мой профиль',
    settings: '⚙️ Настройки',
    help: '❓ Помощь',
    back: '◀️ Назад',
    close: '❌ Закрыть',
    
    // Profile
    profileTitle: '👤 Ваш профиль',
    profileInfo: `*Ваш профиль*\n\n` +
      `📱 Telegram ID: {telegramId}\n` +
      `👤 Имя: {name}\n` +
      `🌐 Язык: {language}\n` +
      `📅 Дата регистрации: {createdAt}\n` +
      `📊 Сессий: {sessions}\n\n` +
      `Выберите действие:`,
    editProfile: '✏️ Редактировать профиль',
    viewSessions: '📊 Просмотр сессий',
    
    // Settings
    settingsTitle: '⚙️ Настройки',
    settingsText: 'Настройте ваши предпочтения:',
    changeLanguage: '🌐 Изменить язык',
    languageEn: '🇬🇧 English',
    languageRu: '🇷🇺 Русский',
    languageChanged: '✅ Язык изменён на русский',
    
    // Help
    helpTitle: '❓ Помощь',
    helpText: `*Справка Lapis Vivus*\n\n` +
      `Этот бот предоставляет глубокий психологический и астрологический анализ на основе вашего профиля.\n\n` +
      `*Как использовать:*\n` +
      `1. Начните анализ нажав 🔮 Начать анализ\n` +
      `2. Следуйте инструкциям бота\n` +
      `3. Просматривайте профиль и сессии в 👤 Мой профиль\n\n` +
      `*Настройки:*\n` +
      `Вы можете изменить язык и другие параметры в ⚙️ Настройки\n\n` +
      `*Поддержка:*\n` +
      `При возникновении вопросов обращайтесь к администратору.`,
    
    // Admin
    adminPanel: '🔐 Панель администратора',
    adminText: 'Выберите действие:',
    editSystemPrompt: '📝 Изменить системный промпт',
    editBlocks: '🔄 Изменить этапы',
    editGlossary: '📖 Изменить глоссарий',
    editBibliography: '📚 Изменить библиографию',
    editCalculators: '🔗 Изменить калькуляторы',
    insufficientRights: 'Недостаточно прав',
    
    // Errors
    errorOccurred: '❌ Произошла ошибка',
    tryAgain: 'Попробуйте ещё раз или используйте /start',
    commandsDisabled: 'Команды отключены. Используйте /start и кнопки сценария.',
  },
};

/**
 * Получить перевод для ключа
 * @param {string} lang - Код языка (en, ru)
 * @param {string} key - Ключ перевода
 * @param {Object} params - Параметры для подстановки {name: 'value'}
 * @returns {string} Переведенная строка
 */
export function t(lang, key, params = {}) {
  const translation = translations[lang]?.[key] || translations['en'][key] || key;
  
  // Подставляем параметры
  return translation.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return params[paramKey] !== undefined ? params[paramKey] : match;
  });
}

/**
 * Получить название языка
 */
export function getLanguageName(lang) {
  const names = {
    en: 'English 🇬🇧',
    ru: 'Русский 🇷🇺',
  };
  return names[lang] || names['en'];
}

/**
 * Проверить валидность языка
 */
export function isValidLanguage(lang) {
  return ['en', 'ru'].includes(lang);
}
