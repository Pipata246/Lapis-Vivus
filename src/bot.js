import { Telegraf } from 'telegraf';
import { loadBotConfig } from './config.js';
import {
  initUser,
  handleCallback,
  handleText,
  handleFile,
  sendScenarioReply,
} from './services/scenario.js';
import { t, u } from './i18n.js';
import { renderInstructionSlide } from './ui/instructionGuide.js';
import {
  getMainMenuKeyboard,
  getProfileKeyboard,
  getBalanceKeyboard,
  getSettingsKeyboard,
  getLanguageKeyboard,
  getHelpKeyboard,
  getAdminKeyboard,
  getTopupCancelKeyboard,
  getPaymentLinkKeyboard,
  getShopKeyboard,
} from './navigation.js';
import {
  formatTopupPrompt,
  formatTopupInvalidAmount,
  formatPaymentLinkMessage,
  formatShopStub,
  formatUserProfileCard,
  formatBalanceCard,
} from './ui/wallet.js';
import { createTopupPayment, parseTopupAmount } from './services/topup.js';
import {
  getUserLanguage,
  setUserLanguage,
  getUserProfile,
  isAdmin,
  hasLegalAccepted,
  acceptLegalDocuments,
  upsertUserFromTelegram,
} from './db/users.js';
import { expireStalePayments } from './db/payments.js';
import { getSession, updateSession, resetSession } from './db/sessions.js';
import { STEPS } from './scenario/constants.js';
import { formatOracleThinkingScreen, oracleRunningKeyboard } from './scenario/oracleFlow.js';
import { getOrCreateUserChat } from './db/chats.js';
import { deliverSingleMessage } from './ui/singleMessage.js';
import {
  formatLegalGateMessage,
  getLegalGateKeyboard,
  formatSubscriptionGateMessage,
  getSubscriptionGateKeyboard,
} from './ui/legal.js';
import { checkUserInCommunity } from './services/communityGate.js';
import { isPrivateChat, isGroupChat, getBotUser } from './services/chatContext.js';
import {
  formatGroupRules,
  formatGroupStartHint,
  formatGroupWelcome,
  getOpenBotKeyboard,
} from './ui/groupChat.js';

let botInstance = null;

// Map для отслеживания обработки callback'ов и сообщений (debounce)
const processingCallbacks = new Map();
const processingMessages = new Map();
const CALLBACK_DEBOUNCE_MS = 1000;
const MESSAGE_DEBOUNCE_MS = 500;

async function buildProfileText(userId, lang) {
  const profile = await getUserProfile(userId);
  return formatUserProfileCard(profile, lang);
}

async function buildBalanceText(userId, lang) {
  await expireStalePayments();
  const profile = await getUserProfile(userId);
  return formatBalanceCard(profile, lang);
}

async function deliverScreen(ctx, { text, keyboard, userId, lang, skipMainMenu = false }) {
  await deliverSingleMessage(ctx, {
    text,
    keyboard,
    userId: userId ?? ctx.from?.id,
    lang: lang ?? 'ru',
    skipMainMenu,
  });
}

async function sendLegalGate(ctx, lang) {
  await deliverScreen(ctx, {
    text: formatLegalGateMessage(lang),
    keyboard: getLegalGateKeyboard(lang),
    userId: ctx.from?.id,
    lang,
    skipMainMenu: true,
  });
}

async function sendMainMenu(ctx, lang) {
  await deliverScreen(ctx, {
    text: t(lang, 'welcome'),
    keyboard: getMainMenuKeyboard(lang),
    userId: ctx.from?.id,
    lang,
    skipMainMenu: true,
  });
}

async function ensureAccessOrGate(ctx, lang, { freshSubscription = false } = {}) {
  const userId = ctx.from?.id;
  if (!userId) return false;

  if (!(await hasLegalAccepted(userId))) {
    await sendLegalGate(ctx, lang);
    return false;
  }

  const subscribed = await checkUserInCommunity(ctx.telegram, userId, { fresh: freshSubscription });
  if (!subscribed) {
    await deliverScreen(ctx, {
      text: formatSubscriptionGateMessage(lang),
      keyboard: getSubscriptionGateKeyboard(lang),
      userId,
      lang,
      skipMainMenu: true,
    });
    return false;
  }

  return true;
}

function registerHandlers(bot) {
  bot.on('new_chat_members', async (ctx) => {
    if (!isGroupChat(ctx)) return;

    try {
      const botUser = await getBotUser(ctx.telegram);
      const newcomers = ctx.message.new_chat_members ?? [];
      const botJoined = newcomers.some((m) => m.id === botUser.id);
      const humans = newcomers.filter((m) => !m.is_bot);

      const replyOpts = {
        parse_mode: 'HTML',
        reply_markup: getOpenBotKeyboard(botUser.username, 'ru'),
      };

      if (botJoined) {
        await ctx.reply(formatGroupRules('ru'), replyOpts);
        return;
      }

      if (humans.length > 0) {
        const names = humans.map((m) => m.first_name);
        await ctx.reply(formatGroupWelcome(names, 'ru'), replyOpts);
      }
    } catch (err) {
      console.error('[group] new_chat_members:', err.message);
    }
  });

  bot.command('rules', async (ctx) => {
    if (!isGroupChat(ctx)) return;

    try {
      const botUser = await getBotUser(ctx.telegram);
      await ctx.reply(formatGroupRules('ru'), {
        parse_mode: 'HTML',
        reply_markup: getOpenBotKeyboard(botUser.username, 'ru'),
      });
    } catch (err) {
      console.error('[group] /rules:', err.message);
    }
  });

  bot.start(async (ctx) => {
    if (!ctx.from?.id) return;

    if (isGroupChat(ctx)) {
      try {
        const botUser = await getBotUser(ctx.telegram);
        await ctx.reply(formatGroupStartHint('ru'), {
          parse_mode: 'HTML',
          reply_markup: getOpenBotKeyboard(botUser.username, 'ru'),
        });
      } catch (err) {
        console.error('[group] /start:', err.message);
      }
      return;
    }

    try {
      const userId = ctx.from.id;
      
      // Сбрасываем режим админа при /start
      const session = await getSession(userId);
      if (session?.admin_mode) {
        await updateSession(userId, { admin_mode: null });
      }
      
      // Инициализируем пользователя
      await initUser(ctx.from);
      
      // Получаем язык пользователя
      const lang = await getUserLanguage(userId);

      if (!(await ensureAccessOrGate(ctx, lang))) return;

      await sendMainMenu(ctx, lang);
    } catch (err) {
      console.error('Ошибка /start:', err.message);
      const lang = await getUserLanguage(ctx.from?.id).catch(() => 'ru');
      await deliverScreen(ctx, { text: u(lang, 'errorStart'), userId: ctx.from?.id, lang, skipMainMenu: true });
    }
  });

  bot.command('admin', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;
    
    try {
      const userId = ctx.from.id;
      const lang = await getUserLanguage(userId);
      if (!(await ensureAccessOrGate(ctx, lang))) return;

      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        await deliverScreen(ctx, { text: t(lang, 'insufficientRights'), userId, lang, skipMainMenu: true });
        return;
      }

      await deliverScreen(ctx, {
        text: `${t(lang, 'adminPanel')}\n\n${t(lang, 'adminText')}`,
        keyboard: getAdminKeyboard(lang),
        userId,
        lang,
        skipMainMenu: true,
      });
    } catch (err) {
      console.error('Ошибка /admin:', err.message);
      await deliverScreen(ctx, { text: u(lang, 'errorAccess'), userId: ctx.from?.id, lang, skipMainMenu: true });
    }
  });

  bot.command('profile', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;
    try {
      await upsertUserFromTelegram(ctx.from);
      const userId = ctx.from.id;
      const lang = await getUserLanguage(userId);
      if (!(await ensureAccessOrGate(ctx, lang))) return;
      await updateSession(userId, { ui_mode: null });
      await deliverScreen(ctx, {
        text: await buildProfileText(userId, lang),
        keyboard: getProfileKeyboard(lang),
        userId,
        lang,
      });
    } catch (err) {
      console.error('Ошибка /profile:', err.message);
      const lang = await getUserLanguage(ctx.from?.id).catch(() => 'ru');
      await deliverScreen(ctx, { text: u(lang, 'errorLoad'), userId: ctx.from?.id, lang, skipMainMenu: true });
    }
  });

  bot.command('balance', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;
    try {
      await upsertUserFromTelegram(ctx.from);
      const userId = ctx.from.id;
      const lang = await getUserLanguage(userId);
      if (!(await ensureAccessOrGate(ctx, lang))) return;
      await updateSession(userId, { ui_mode: null });
      await deliverScreen(ctx, {
        text: await buildBalanceText(userId, lang),
        keyboard: getBalanceKeyboard(lang),
        userId,
        lang,
      });
    } catch (err) {
      console.error('Ошибка /balance:', err.message);
      const lang = await getUserLanguage(ctx.from?.id).catch(() => 'ru');
      await deliverScreen(ctx, { text: u(lang, 'errorLoad'), userId: ctx.from?.id, lang, skipMainMenu: true });
    }
  });

  bot.command('protocol', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;
    try {
      await upsertUserFromTelegram(ctx.from);
      const lang = await getUserLanguage(ctx.from.id);
      if (!(await ensureAccessOrGate(ctx, lang))) return;
      await ctx.sendChatAction('typing').catch(() => {});
      const payload = await handleCallback(ctx.from, 'lv:start');
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      const lang = await getUserLanguage(ctx.from.id).catch(() => 'ru');
      await deliverScreen(ctx, {
        text: `${t(lang, 'errorOccurred')}\n\n${t(lang, 'tryAgain')}`,
        userId: ctx.from.id,
        lang,
        skipMainMenu: true,
      });
    }
  });

  bot.command('settings', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;
    try {
      await upsertUserFromTelegram(ctx.from);
      const lang = await getUserLanguage(ctx.from.id);
      if (!(await ensureAccessOrGate(ctx, lang))) return;
      await deliverScreen(ctx, {
        text: `${t(lang, 'settingsTitle')}\n\n${t(lang, 'settingsText')}`,
        keyboard: getSettingsKeyboard(lang),
        userId: ctx.from.id,
        lang,
      });
    } catch (err) {
      console.error('Ошибка /settings:', err.message);
      const lang = await getUserLanguage(ctx.from?.id).catch(() => 'ru');
      await deliverScreen(ctx, { text: u(lang, 'errorLoad'), userId: ctx.from?.id, lang, skipMainMenu: true });
    }
  });

  bot.command('help', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;
    try {
      await upsertUserFromTelegram(ctx.from);
      const lang = await getUserLanguage(ctx.from.id);
      if (!(await ensureAccessOrGate(ctx, lang))) return;
      await deliverScreen(ctx, {
        text: t(lang, 'helpText'),
        keyboard: getHelpKeyboard(lang),
        userId: ctx.from.id,
        lang,
      });
    } catch (err) {
      console.error('Ошибка /help:', err.message);
      await deliverScreen(ctx, { text: u(lang, 'errorLoad'), userId: ctx.from?.id, lang, skipMainMenu: true });
    }
  });

  bot.on('callback_query', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;

    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data ?? '';

    // Сразу снимаем «часики» — до любых запросов в БД
    await ctx.answerCbQuery().catch(() => {});

    let lang = 'en';
    try {
      lang = await getUserLanguage(userId);
    } catch (err) {
      console.error('[callback] getUserLanguage:', err.message);
    }

    try {
    if (callbackData === 'nav:legal_accept') {
      const subscribed = await checkUserInCommunity(ctx.telegram, userId, { fresh: true });
      if (!subscribed) {
        const gateLang = await getUserLanguage(userId);
        await deliverScreen(ctx, {
          text: formatLegalGateMessage(gateLang, { needSubscription: true }),
          keyboard: getLegalGateKeyboard(gateLang),
          userId,
          lang: gateLang,
          skipMainMenu: true,
        });
        return;
      }

      await acceptLegalDocuments(userId);
      const welcomeLang = await getUserLanguage(userId);
      await deliverScreen(ctx, {
        text: t(welcomeLang, 'welcome'),
        keyboard: getMainMenuKeyboard(welcomeLang),
        userId,
        lang: welcomeLang,
        skipMainMenu: true,
      });
      return;
    }

    if (callbackData === 'nav:sub_check') {
      const subscribed = await checkUserInCommunity(ctx.telegram, userId, { fresh: true });
      if (!subscribed) {
        await deliverScreen(ctx, {
          text: formatSubscriptionGateMessage(lang, { needSubscription: true }),
          keyboard: getSubscriptionGateKeyboard(lang),
          userId,
          lang,
          skipMainMenu: true,
        });
        return;
      }

      await deliverScreen(ctx, {
        text: t(lang, 'welcome'),
        keyboard: getMainMenuKeyboard(lang),
        userId,
        lang,
        skipMainMenu: true,
      });
      return;
    }

    if (callbackData === 'nav:lang_swap') {
      const legalOk = await hasLegalAccepted(userId);

      if (legalOk) {
        const subscribed = await checkUserInCommunity(ctx.telegram, userId);
        if (subscribed) {
          return;
        }

        const current = await getUserLanguage(userId);
        const newLang = current === 'en' ? 'ru' : 'en';
        await setUserLanguage(userId, newLang);

        await deliverScreen(ctx, {
          text: formatSubscriptionGateMessage(newLang),
          keyboard: getSubscriptionGateKeyboard(newLang),
          userId,
          lang: newLang,
          skipMainMenu: true,
        });
        return;
      }

      const current = await getUserLanguage(userId);
      const newLang = current === 'en' ? 'ru' : 'en';
      await setUserLanguage(userId, newLang);

      await deliverScreen(ctx, {
        text: formatLegalGateMessage(newLang),
        keyboard: getLegalGateKeyboard(newLang),
        userId,
        lang: newLang,
        skipMainMenu: true,
      });
      return;
    }

    if (!(await ensureAccessOrGate(ctx, lang))) return;

    // ВАЖНО: Сценарные callback'ы (lv:*) обрабатываются ПЕРВЫМИ
    if (callbackData.startsWith('lv:')) {
      const key = `${userId}:${callbackData}`;
      const now = Date.now();
      const lastProcessed = processingCallbacks.get(key);

      if (lastProcessed && now - lastProcessed < CALLBACK_DEBOUNCE_MS) {
        return;
      }

      processingCallbacks.set(key, now);

      for (const [k, timestamp] of processingCallbacks.entries()) {
        if (now - timestamp > 5000) {
          processingCallbacks.delete(k);
        }
      }

      await ctx.sendChatAction('typing').catch(() => {});

      if (callbackData === 'lv:compare_confirm_yes') {
        const { formatCompareRunning } = await import('./scenario/compareFlow.js');
        await deliverScreen(ctx, {
          text: formatCompareRunning(lang),
          keyboard: { inline_keyboard: [] },
          userId,
          lang,
          skipMainMenu: true,
        });
      }

      try {
        const payload = await handleCallback(ctx.from, callbackData);
        if (!payload?.text) {
          console.error('[callback] пустой payload:', callbackData, payload);
          const { mapErrorToUser } = await import('./ui/userCopy.js');
          await deliverScreen(ctx, {
            text: `${mapErrorToUser(lang, new Error('empty payload'))}\n\n${t(lang, 'tryAgain')}`,
            userId,
            lang,
            skipMainMenu: true,
          });
          return;
        }
        await sendScenarioReply(ctx, payload);
      } catch (err) {
        console.error('Ошибка callback:', err.message, err.stack);
        const { mapErrorToUser } = await import('./ui/userCopy.js');
        await deliverScreen(ctx, {
          text: `${mapErrorToUser(lang, err)}\n\n${t(lang, 'tryAgain')}`,
          userId,
          lang,
          skipMainMenu: true,
        });
      } finally {
        processingCallbacks.delete(key);
      }

      return;
    }

    // Обработка навигационных callback'ов
    if (callbackData.startsWith('nav:')) {
      if (callbackData === 'nav:instruction' || callbackData.startsWith('nav:inst:')) {
        const pageIndex =
          callbackData === 'nav:instruction' ? 0 : parseInt(callbackData.split(':')[2], 10) || 0;
        const { text, keyboard } = renderInstructionSlide(lang, pageIndex);
        await deliverScreen(ctx, { text, keyboard, userId, lang });
        return;
      }

      const action = callbackData.split(':')[1];
      
      switch (action) {
        case 'main_menu': {
          const chat = await getOrCreateUserChat(userId);
          await resetSession(userId, chat.id);
          await deliverScreen(ctx, {
            text: t(lang, 'welcome'),
            keyboard: getMainMenuKeyboard(lang),
            userId,
            lang,
            skipMainMenu: true,
          });
          break;
        }

        case 'start_analysis': {
          try {
            await ctx.sendChatAction('typing').catch(() => {});
            const payload = await handleCallback(ctx.from, 'lv:start');
            await sendScenarioReply(ctx, payload);
          } catch (err) {
            console.error('Ошибка start_analysis (legacy):', err.message, err.stack);
            await deliverScreen(ctx, {
              text: `${t(lang, 'errorOccurred')}\n\n${t(lang, 'tryAgain')}`,
              userId,
              lang,
              skipMainMenu: true,
            });
          }
          break;
        }

        case 'profile':
          try {
            await updateSession(userId, { ui_mode: null });
            await deliverScreen(ctx, {
              text: await buildProfileText(userId, lang),
              keyboard: getProfileKeyboard(lang),
              userId,
              lang,
            });
          } catch (err) {
            console.error('Error loading profile:', err.message);
            await deliverScreen(ctx, { text: t(lang, 'errorOccurred'), userId, lang, skipMainMenu: true });
          }
          break;

        case 'balance':
          try {
            await updateSession(userId, { ui_mode: null });
            await deliverScreen(ctx, {
              text: await buildBalanceText(userId, lang),
              keyboard: getBalanceKeyboard(lang),
              userId,
              lang,
            });
          } catch (err) {
            console.error('Error loading balance:', err.message);
            await deliverScreen(ctx, { text: t(lang, 'errorOccurred'), userId, lang, skipMainMenu: true });
          }
          break;

        case 'topup':
          try {
            await updateSession(userId, { ui_mode: 'topup' });
            await deliverScreen(ctx, {
              text: formatTopupPrompt(lang),
              keyboard: getTopupCancelKeyboard(lang),
              userId,
              lang,
            });
          } catch (err) {
            console.error('Error starting topup:', err.message);
            await deliverScreen(ctx, { text: t(lang, 'errorOccurred'), userId, lang, skipMainMenu: true });
          }
          break;

        case 'topup_cancel':
          try {
            await updateSession(userId, { ui_mode: null });
            await deliverScreen(ctx, {
              text: await buildBalanceText(userId, lang),
              keyboard: getBalanceKeyboard(lang),
              userId,
              lang,
            });
          } catch (err) {
            console.error('Error canceling topup:', err.message);
            await deliverScreen(ctx, { text: t(lang, 'errorOccurred'), userId, lang, skipMainMenu: true });
          }
          break;

        case 'shop':
          await deliverScreen(ctx, {
            text: formatShopStub(lang),
            keyboard: getShopKeyboard(lang),
            userId,
            lang,
          });
          break;

        case 'settings':
          await deliverScreen(ctx, {
            text: `${t(lang, 'settingsTitle')}\n\n${t(lang, 'settingsText')}`,
            keyboard: getSettingsKeyboard(lang),
            userId,
            lang,
          });
          break;

        case 'change_language':
          await deliverScreen(ctx, {
            text: `${t(lang, 'changeLanguage')}:`,
            keyboard: getLanguageKeyboard(lang),
            userId,
            lang,
          });
          break;

        case 'help':
          await deliverScreen(ctx, {
            text: t(lang, 'helpText'),
            keyboard: getHelpKeyboard(lang),
            userId,
            lang,
          });
          break;

        default:
          await deliverScreen(ctx, { text: u(lang, 'errorUnknownAction'), userId, lang, skipMainMenu: true });
      }
      
      return;
    }

    // Обработка смены языка
    if (callbackData.startsWith('lang:')) {
      const newLang = callbackData.split(':')[1];

      try {
        await setUserLanguage(userId, newLang);
        await deliverScreen(ctx, {
          text: `${t(newLang, 'settingsTitle')}\n\n${t(newLang, 'settingsText')}`,
          keyboard: getSettingsKeyboard(newLang),
          userId,
          lang: newLang,
        });
      } catch (err) {
        console.error('Error changing language:', err.message);
        await deliverScreen(ctx, { text: t(lang, 'errorOccurred'), userId, lang, skipMainMenu: true });
      }

      return;
    }
    
    // Обработка admin callback'ов
    if (callbackData.startsWith('admin:')) {
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        await deliverScreen(ctx, { text: t(lang, 'insufficientRights'), userId, lang, skipMainMenu: true });
        return;
      }

      const action = callbackData.split(':')[1];

      switch (action) {
        case 'edit_system_prompt':
          await updateSession(userId, { admin_mode: 'edit_system_prompt' });
          await deliverScreen(ctx, {
            text:
              '<b>Редактирование системного промпта</b>\n\n' +
              'Отправьте новый текст системного промпта.\n\n' +
              'Формат · текст, TXT или PDF.\n\n' +
              '<i>Изменение повлияет на поведение системы для всех пользователей.</i>\n\n' +
              'Отмена · /admin',
            keyboard: getAdminKeyboard(lang),
            userId,
            lang,
            skipMainMenu: true,
          });
          break;

        case 'edit_blocks':
          await updateSession(userId, { admin_mode: 'edit_blocks' });
          await deliverScreen(ctx, {
            text:
              '<b>Редактирование этапов</b>\n\n' +
              'Отправьте новый текст этапов анализа.\n\n' +
              'Формат · текст, TXT или PDF.\n\n' +
              '<i>Изменение повлияет на структуру анализа для всех пользователей.</i>\n\n' +
              'Отмена · /admin',
            keyboard: getAdminKeyboard(lang),
            userId,
            lang,
            skipMainMenu: true,
          });
          break;

        case 'edit_glossary':
          await updateSession(userId, { admin_mode: 'edit_glossary' });
          await deliverScreen(ctx, {
            text:
              '<b>Редактирование глоссария</b>\n\n' +
              'Отправьте новый текст глоссария терминов.\n\n' +
              'Формат · текст, TXT или PDF.\n\n' +
              '<i>Изменение повлияет на определения терминов для всех пользователей.</i>\n\n' +
              'Отмена · /admin',
            keyboard: getAdminKeyboard(lang),
            userId,
            lang,
            skipMainMenu: true,
          });
          break;

        case 'edit_bibliography':
          await updateSession(userId, { admin_mode: 'edit_bibliography' });
          await deliverScreen(ctx, {
            text:
              '<b>Редактирование библиографии</b>\n\n' +
              'Отправьте новый текст библиографии первоисточников.\n\n' +
              'Формат · текст, TXT или PDF.\n\n' +
              '<i>Изменение повлияет на библиографию для всех пользователей.</i>\n\n' +
              'Отмена · /admin',
            keyboard: getAdminKeyboard(lang),
            userId,
            lang,
            skipMainMenu: true,
          });
          break;

        case 'edit_calculators':
          await updateSession(userId, { admin_mode: 'edit_calculators' });
          await deliverScreen(ctx, {
            text:
              '<b>Редактирование калькуляторов</b>\n\n' +
              'Отправьте новый список инструментов расчёта и ссылок.\n\n' +
              'Формат · текст, TXT или PDF.\n\n' +
              '<i>Изменение повлияет на список калькуляторов для всех пользователей.</i>\n\n' +
              'Отмена · /admin',
            keyboard: getAdminKeyboard(lang),
            userId,
            lang,
            skipMainMenu: true,
          });
          break;

        case 'close':
          await updateSession(userId, { admin_mode: null });
          await deliverScreen(ctx, {
            text: t(lang, 'welcome'),
            keyboard: getMainMenuKeyboard(lang),
            userId,
            lang,
            skipMainMenu: true,
          });
          break;

        default:
          await deliverScreen(ctx, { text: u(lang, 'errorUnknownAction'), userId, lang, skipMainMenu: true });
      }

      return;
    }

    console.warn(`[callback] Неизвестный callback: ${callbackData}`);
    await deliverScreen(ctx, {
      text:
        lang === 'ru'
          ? 'Кнопка устарела или не поддерживается. Нажмите /start для актуального меню.'
          : 'This button is outdated. Press /start for the current menu.',
      userId,
      lang,
      skipMainMenu: true,
    });
    } catch (err) {
      console.error('[callback] fatal:', err.message, err.stack);
      await deliverScreen(ctx, {
        text: `${t(lang, 'errorOccurred')}\n\n${t(lang, 'tryAgain')}`,
        userId,
        lang,
        skipMainMenu: true,
      });
    }
  });

  bot.on('text', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;

    const text = ctx.message.text?.trim();
    if (!text) return;

    const userId = ctx.from.id;
    const lang = await getUserLanguage(userId);

    if (text.startsWith('/')) {
      await deliverScreen(ctx, { text: t(lang, 'commandsDisabled'), userId, lang, skipMainMenu: true });
      return;
    }

    if (!(await ensureAccessOrGate(ctx, lang))) return;
    
    // Проверяем режим админа из БД
    const { getSession, updateSession } = await import('./db/sessions.js');
    const session = await getSession(userId);
    const adminMode = session?.admin_mode;
    
    if (adminMode) {
      const { isAdmin } = await import('./db/users.js');
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        console.log('[text] НЕ админ, сбрасываем режим');
        await updateSession(userId, { admin_mode: null });
        await deliverScreen(ctx, { text: t(lang, 'insufficientRights'), userId, lang, skipMainMenu: true });
        return;
      }

      try {
        const { updatePrompt } = await import('./prompts/loadSystemPrompt.js');

        let promptId, promptName;
        if (adminMode === 'edit_system_prompt') {
          promptId = 'system';
          promptName = 'Системный промпт';
        } else if (adminMode === 'edit_blocks') {
          promptId = 'blocks';
          promptName = 'Этапы';
        } else if (adminMode === 'edit_glossary') {
          promptId = 'glossary';
          promptName = 'Глоссарий';
        } else if (adminMode === 'edit_bibliography') {
          promptId = 'bibliography';
          promptName = 'Библиография';
        } else if (adminMode === 'edit_calculators') {
          promptId = 'calculators';
          promptName = 'Калькуляторы';
        }

        await ctx.sendChatAction('typing').catch(() => {});
        await updatePrompt(promptId, text, userId);

        await updateSession(userId, { admin_mode: null });
        await deliverScreen(ctx, {
          text:
            `<b>${promptName}</b> успешно обновлён.\n\n` +
            `Длина: ${text.length} символов\n` +
            `Новый промпт будет использоваться для всех новых запросов к ИИ.`,
          keyboard: getMainMenuKeyboard(lang),
          userId,
          lang,
          skipMainMenu: true,
        });
      } catch (err) {
        console.error('Ошибка обновления промпта:', err.message);
        await deliverScreen(ctx, { text: `Ошибка · ${err.message}`, userId, lang, skipMainMenu: true });
      }

      return;
    }

    const sessionForTopup = await getSession(userId);
    if (sessionForTopup?.ui_mode === 'topup') {
      const { deleteUserInput } = await import('./ui/singleMessage.js');
      await deleteUserInput(ctx);

      const parsed = parseTopupAmount(text);
      if (!parsed.ok) {
        const hint =
          parsed.error === 'min'
            ? formatTopupInvalidAmount(lang, { min: parsed.min })
            : parsed.error === 'max'
              ? formatTopupInvalidAmount(lang, { max: parsed.max })
              : formatTopupInvalidAmount(lang);
        await deliverScreen(ctx, { text: hint, keyboard: getTopupCancelKeyboard(lang), userId, lang });
        return;
      }

      try {
        await ctx.sendChatAction('typing').catch(() => {});
        const payment = await createTopupPayment(userId, parsed.amountRub, lang);

        if (!payment.confirmationUrl) {
          throw new Error(u(lang, 'paymentLinkMissing'));
        }

        await updateSession(userId, { ui_mode: null });

        await deliverScreen(ctx, {
          text: formatPaymentLinkMessage(parsed.amountRub, lang),
          keyboard: getPaymentLinkKeyboard(payment.confirmationUrl, lang),
          userId,
          lang,
        });
      } catch (err) {
        console.error('Topup error:', err.message);
        await deliverScreen(ctx, {
          text: u(lang, 'errorPayment'),
          keyboard: getTopupCancelKeyboard(lang),
          userId,
          lang,
        });
      }

      return;
    }
    
    const key = `${userId}:text`;
    const now = Date.now();
    const lastProcessed = processingMessages.get(key);
    
    if (lastProcessed && (now - lastProcessed) < MESSAGE_DEBOUNCE_MS) {
      return; // Игнорируем дубликаты
    }
    
    processingMessages.set(key, now);
    
    // Очищаем старые записи
    for (const [k, timestamp] of processingMessages.entries()) {
      if (now - timestamp > 3000) {
        processingMessages.delete(k);
      }
    }

    await ctx.sendChatAction('typing').catch(() => {});

    const sessionForOracle = await getSession(userId);
    if (sessionForOracle?.step === STEPS.ORACLE_CHAT) {
      await deliverScreen(ctx, {
        text: formatOracleThinkingScreen(lang),
        keyboard: oracleRunningKeyboard(lang),
        userId,
        lang,
        skipMainMenu: true,
      });
    }

    try {
      const payload = await handleText(ctx.from, text);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка text:', err.message, err.stack);
      await deliverScreen(ctx, {
        text: `${t(lang, 'errorOccurred')}\n\n${t(lang, 'tryAgain')}`,
        userId,
        lang,
        skipMainMenu: true,
      });
    } finally {
      setTimeout(() => {
        processingMessages.delete(key);
      }, MESSAGE_DEBOUNCE_MS);
    }
  });

  bot.on('photo', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;

    const lang = await getUserLanguage(ctx.from.id).catch(() => 'ru');
    if (!(await ensureAccessOrGate(ctx, lang))) return;

    const photos = ctx.message.photo ?? [];
    const largest = photos[photos.length - 1];
    if (!largest?.file_id) return;

    await ctx.sendChatAction('typing').catch(() => {});
    
    try {
      const payload = await handleFile(ctx.from, largest.file_id, 'photo');
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка photo:', err.message);
      await deliverScreen(ctx, { text: u(lang, 'errorPhoto'), userId: ctx.from.id, lang, skipMainMenu: true });
    }
  });

  bot.on('document', async (ctx) => {
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;

    const document = ctx.message.document;
    if (!document?.file_id) return;
    
    const userId = ctx.from.id;
    const lang = await getUserLanguage(userId).catch(() => 'ru');
    
    // Проверяем режим админа из БД
    const { getSession, updateSession } = await import('./db/sessions.js');
    const session = await getSession(userId);
    const adminMode = session?.admin_mode;

    if (!(await ensureAccessOrGate(ctx, lang))) return;
    
    console.log(`[document] userId=${userId}, adminMode=${adminMode}, fileName=${document.file_name}`);
    
    if (adminMode) {
      console.log(`[document] Админ в режиме ${adminMode}`);
      const { isAdmin } = await import('./db/users.js');
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        console.log('[document] НЕ админ, сбрасываем режим');
        await updateSession(userId, { admin_mode: null });
        await deliverScreen(ctx, { text: t(lang, 'insufficientRights'), userId, lang, skipMainMenu: true });
        return;
      }

      const mimeType = document.mime_type || '';
      const fileName = document.file_name || '';

      const isTxt = mimeType.includes('text') || fileName.endsWith('.txt');
      const isPdf = mimeType === 'application/pdf' || fileName.endsWith('.pdf');

      if (!isTxt && !isPdf) {
        const { deleteUserInput } = await import('./ui/singleMessage.js');
        await deleteUserInput(ctx);
        await deliverScreen(ctx, {
          text:
            'Поддерживаются только TXT и PDF файлы.\n\n' +
            'Отправьте промпт в одном из форматов:\n' +
            '• Текстовое сообщение\n' +
            '• TXT файл\n' +
            '• PDF файл',
          keyboard: getAdminKeyboard(lang),
          userId,
          lang,
          skipMainMenu: true,
        });
        return;
      }
      
      try {
        await ctx.sendChatAction('typing').catch(() => {});
        
        const { loadBotConfig } = await import('./config.js');
        const { botToken } = loadBotConfig();
        
        // Получаем файл из Telegram
        const metaRes = await fetch(
          `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(document.file_id)}`
        );
        const meta = await metaRes.json();
        
        if (!meta.ok || !meta.result?.file_path) {
          throw new Error('Не удалось получить файл из Telegram.');
        }
        
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${meta.result.file_path}`;
        const fileRes = await fetch(fileUrl);
        
        if (!fileRes.ok) {
          throw new Error('Не удалось скачать файл.');
        }
        
        const arrayBuffer = await fileRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Извлекаем текст из TXT или PDF
        let extractedText;
        
        if (isTxt) {
          extractedText = buffer.toString('utf-8');
        } else if (isPdf) {
          try {
            const { extractText } = await import('unpdf');
            const { text } = await extractText(buffer);
            extractedText = text;
          } catch (pdfError) {
            console.error('Ошибка извлечения текста из PDF:', pdfError);
            throw new Error('Не удалось извлечь текст из PDF. Попробуйте сохранить документ как .txt файл.');
          }
        }
        
        if (!extractedText || extractedText.trim().length < 10) {
          throw new Error('Не удалось извлечь текст из файла или файл пустой');
        }
        
        const { updatePrompt } = await import('./prompts/loadSystemPrompt.js');
        
        let promptId, promptName;
        if (adminMode === 'edit_system_prompt') {
          promptId = 'system';
          promptName = 'Системный промпт';
        } else if (adminMode === 'edit_blocks') {
          promptId = 'blocks';
          promptName = 'Этапы';
        } else if (adminMode === 'edit_glossary') {
          promptId = 'glossary';
          promptName = 'Глоссарий';
        } else if (adminMode === 'edit_bibliography') {
          promptId = 'bibliography';
          promptName = 'Библиография';
        } else if (adminMode === 'edit_calculators') {
          promptId = 'calculators';
          promptName = 'Калькуляторы';
        }
        
        await updatePrompt(promptId, extractedText, userId);
        
        await updateSession(userId, { admin_mode: null });
        const { deleteUserInput } = await import('./ui/singleMessage.js');
        await deleteUserInput(ctx);
        await deliverScreen(ctx, {
          text:
            `<b>${promptName}</b> успешно обновлён из файла.\n\n` +
            `Файл: ${fileName}\n` +
            `Длина: ${extractedText.length} символов\n` +
            `Новый промпт будет использоваться для всех новых запросов к ИИ.`,
          keyboard: getMainMenuKeyboard(lang),
          userId,
          lang,
          skipMainMenu: true,
        });
      } catch (err) {
        console.error('Ошибка обработки файла промпта:', err.message);
        await deliverScreen(ctx, { text: `Ошибка · ${err.message}`, userId, lang, skipMainMenu: true });
      }

      return;
    }

    await ctx.sendChatAction('typing').catch(() => {});

    try {
      const payload = await handleFile(ctx.from, document.file_id, 'document', document.file_name, document.mime_type);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка document:', err.message);
      await deliverScreen(ctx, { text: u(lang, 'errorDocument'), userId, lang, skipMainMenu: true });
    }
  });

  bot.on('message', async (ctx) => {
    if (ctx.message.text || ctx.message.photo || ctx.message.document) return;
    if (!ctx.from?.id || !isPrivateChat(ctx)) return;

    const lang = await getUserLanguage(ctx.from.id).catch(() => 'ru');
    const { deleteUserInput } = await import('./ui/singleMessage.js');
    await deleteUserInput(ctx);
    await deliverScreen(ctx, {
      text: u(lang, 'unsupportedMessage'),
      userId: ctx.from.id,
      lang,
      skipMainMenu: true,
    });
  });

  bot.catch((err) => {
    console.error('Ошибка обработки обновления:', err.message);
  });
}

export function getBot() {
  if (!botInstance) {
    const { botToken } = loadBotConfig();
    botInstance = new Telegraf(botToken);
    registerHandlers(botInstance);
  }

  return botInstance;
}
