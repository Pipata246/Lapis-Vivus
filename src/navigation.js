import { t } from './i18n.js';
import { btn, SUPPORT, COMMUNITY } from './ui/brand.js';
import { getLegalDocsKeyboard } from './ui/legal.js';

/**
 * Главное меню
 */
export function getMainMenuKeyboard(lang) {
  return {
    inline_keyboard: [
      [
        { text: btn(lang, 'startAnalysis'), callback_data: 'lv:start' },
        { text: btn(lang, 'comparePair'), callback_data: 'lv:compare_start' },
      ],
      [
        { text: btn(lang, 'myProfile'), callback_data: 'nav:profile' },
        { text: btn(lang, 'balance'), callback_data: 'nav:balance' },
      ],
      [
        { text: btn(lang, 'settings'), callback_data: 'nav:settings' },
        { text: btn(lang, 'help'), callback_data: 'nav:help' },
      ],
    ],
  };
}

export {
  getProfileKeyboard,
  getBalanceKeyboard,
  getTopupCancelKeyboard,
  getPaymentLinkKeyboard,
} from './ui/wallet.js';

export function getSettingsKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'changeLanguage'), callback_data: 'nav:change_language' }],
      [{ text: btn(lang, 'back'), callback_data: 'nav:main_menu' }],
    ],
  };
}

export function getLanguageKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'languageEn'), callback_data: 'lang:en' }],
      [{ text: btn(lang, 'languageRu'), callback_data: 'lang:ru' }],
      [{ text: btn(lang, 'back'), callback_data: 'nav:settings' }],
    ],
  };
}

export function getHelpKeyboard(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  const contactLabel = code === 'en' ? '💬 Support' : '💬 Поддержка';
  const communityLabel = code === 'en' ? '👥 Community' : '👥 Сообщество';

  const rows = [
    ...getLegalDocsKeyboard(lang),
    [
      { text: communityLabel, url: COMMUNITY.telegramUrl },
      { text: contactLabel, url: SUPPORT.telegramUrl },
    ],
    [{ text: btn(lang, 'back'), callback_data: 'nav:main_menu' }],
  ];

  return { inline_keyboard: rows };
}

export function getAdminKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'editSystemPrompt'), callback_data: 'admin:edit_system_prompt' }],
      [{ text: t(lang, 'editBlocks'), callback_data: 'admin:edit_blocks' }],
      [{ text: t(lang, 'editGlossary'), callback_data: 'admin:edit_glossary' }],
      [{ text: t(lang, 'editBibliography'), callback_data: 'admin:edit_bibliography' }],
      [{ text: t(lang, 'editCalculators'), callback_data: 'admin:edit_calculators' }],
      [{ text: btn(lang, 'close'), callback_data: 'admin:close' }],
    ],
  };
}

export function getShopKeyboard(lang) {
  return {
    inline_keyboard: [[{ text: btn(lang, 'back'), callback_data: 'nav:balance' }]],
  };
}
