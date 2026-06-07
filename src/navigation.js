import { t } from './i18n.js';

/**
 * Главное меню
 */
export function getMainMenuKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'startAnalysis'), callback_data: 'nav:start_analysis' }],
      [{ text: t(lang, 'myProfile'), callback_data: 'nav:profile' }],
      [
        { text: t(lang, 'settings'), callback_data: 'nav:settings' },
        { text: t(lang, 'help'), callback_data: 'nav:help' },
      ],
    ],
  };
}

/**
 * Профиль пользователя
 */
export function getProfileKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'back'), callback_data: 'nav:main_menu' }],
    ],
  };
}

/**
 * Настройки
 */
export function getSettingsKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'changeLanguage'), callback_data: 'nav:change_language' }],
      [{ text: t(lang, 'back'), callback_data: 'nav:main_menu' }],
    ],
  };
}

/**
 * Выбор языка
 */
export function getLanguageKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'languageEn'), callback_data: 'lang:en' }],
      [{ text: t(lang, 'languageRu'), callback_data: 'lang:ru' }],
      [{ text: t(lang, 'back'), callback_data: 'nav:settings' }],
    ],
  };
}

/**
 * Справка
 */
export function getHelpKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'back'), callback_data: 'nav:main_menu' }],
    ],
  };
}

/**
 * Админ панель
 */
export function getAdminKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'editSystemPrompt'), callback_data: 'admin:edit_system_prompt' }],
      [{ text: t(lang, 'editBlocks'), callback_data: 'admin:edit_blocks' }],
      [{ text: t(lang, 'editGlossary'), callback_data: 'admin:edit_glossary' }],
      [{ text: t(lang, 'editBibliography'), callback_data: 'admin:edit_bibliography' }],
      [{ text: t(lang, 'editCalculators'), callback_data: 'admin:edit_calculators' }],
      [{ text: t(lang, 'close'), callback_data: 'admin:close' }],
    ],
  };
}
