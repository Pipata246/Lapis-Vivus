import { Telegraf } from 'telegraf';
import { loadBotConfig } from './config.js';
import {
  initUser,
  handleCallback,
  handleText,
  handleFile,
  sendScenarioReply,
} from './services/scenario.js';
import { t } from './i18n.js';
import {
  getMainMenuKeyboard,
  getProfileKeyboard,
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
} from './ui/wallet.js';
import { createTopupPayment, parseTopupAmount } from './services/topup.js';
import { syncUserPendingPayments } from './services/paymentNotify.js';
import {
  getUserLanguage,
  setUserLanguage,
  getUserProfile,
  isAdmin,
} from './db/users.js';
import { getSession, updateSession } from './db/sessions.js';

let botInstance = null;

// Map для отслеживания обработки callback'ов и сообщений (debounce)
const processingCallbacks = new Map();
const processingMessages = new Map();
const CALLBACK_DEBOUNCE_MS = 1000;
const MESSAGE_DEBOUNCE_MS = 500;

async function buildProfileText(userId, lang) {
  await syncUserPendingPayments(userId);
  const profile = await getUserProfile(userId);
  return formatUserProfileCard(profile, lang);
}

function registerHandlers(bot) {
  bot.start(async (ctx) => {
    if (!ctx.from?.id) return;
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
      
      // Отправляем главное меню
      await ctx.reply(
        t(lang, 'welcome'),
        {
          parse_mode: 'HTML',
          reply_markup: getMainMenuKeyboard(lang),
        }
      );
    } catch (err) {
      console.error('Ошибка /start:', err.message);
      await ctx.reply('Failed to start bot. Try again later.');
    }
  });

  bot.command('admin', async (ctx) => {
    if (!ctx.from?.id) return;
    
    try {
      const userId = ctx.from.id;
      const lang = await getUserLanguage(userId);
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        await ctx.reply(t(lang, 'insufficientRights'));
        return;
      }
      
      await ctx.reply(
        `${t(lang, 'adminPanel')}\n\n${t(lang, 'adminText')}`,
        {
          parse_mode: 'HTML',
          reply_markup: getAdminKeyboard(lang),
        }
      );
    } catch (err) {
      console.error('Ошибка /admin:', err.message);
      await ctx.reply('Error checking access rights.');
    }
  });

  bot.on('callback_query', async (ctx) => {
    if (!ctx.from?.id) return;

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

      try {
        const payload = await handleCallback(ctx.from, callbackData);
        await sendScenarioReply(ctx, payload);
      } catch (err) {
        console.error('Ошибка callback:', err.message, err.stack);
        await ctx
          .reply(`${t(lang, 'errorOccurred')} · ${err.message}\n\n${t(lang, 'tryAgain')}`)
          .catch(() => {});
      } finally {
        processingCallbacks.delete(key);
      }

      return;
    }

    // Обработка навигационных callback'ов
    if (callbackData.startsWith('nav:')) {
      const action = callbackData.split(':')[1];
      
      switch (action) {
        case 'main_menu':
          await ctx.editMessageText(
            t(lang, 'welcome'),
            {
              parse_mode: 'HTML',
              reply_markup: getMainMenuKeyboard(lang),
            }
          ).catch(() => {});
          break;

        case 'start_analysis': {
          // Старые сообщения с кнопкой nav:start_analysis (до перехода на lv:start)
          try {
            await ctx.sendChatAction('typing').catch(() => {});
            const payload = await handleCallback(ctx.from, 'lv:start');
            await sendScenarioReply(ctx, payload);
          } catch (err) {
            console.error('Ошибка start_analysis (legacy):', err.message, err.stack);
            await ctx
              .reply(`${t(lang, 'errorOccurred')}: ${err.message}\n\n${t(lang, 'tryAgain')}`)
              .catch(() => {});
          }
          break;
        }
          
        case 'profile':
          try {
            await updateSession(userId, { ui_mode: null });
            const profileText = await buildProfileText(userId, lang);

            await ctx.editMessageText(profileText, {
              parse_mode: 'HTML',
              reply_markup: getProfileKeyboard(lang),
            }).catch(() => {});
          } catch (err) {
            console.error('Error loading profile:', err.message);
            await ctx.reply(t(lang, 'errorOccurred'));
          }
          break;

        case 'topup':
          try {
            await updateSession(userId, { ui_mode: 'topup' });
            await ctx.editMessageText(formatTopupPrompt(lang), {
              parse_mode: 'HTML',
              reply_markup: getTopupCancelKeyboard(lang),
            }).catch(() => {});
          } catch (err) {
            console.error('Error starting topup:', err.message);
            await ctx.reply(t(lang, 'errorOccurred'));
          }
          break;

        case 'topup_cancel':
          try {
            await updateSession(userId, { ui_mode: null });
            const profileText = await buildProfileText(userId, lang);
            await ctx.editMessageText(profileText, {
              parse_mode: 'HTML',
              reply_markup: getProfileKeyboard(lang),
            }).catch(() => {});
          } catch (err) {
            console.error('Error canceling topup:', err.message);
            await ctx.reply(t(lang, 'errorOccurred'));
          }
          break;

        case 'shop':
          await ctx.editMessageText(formatShopStub(lang), {
            parse_mode: 'HTML',
            reply_markup: getShopKeyboard(lang),
          }).catch(() => {});
          break;
          
        case 'settings':
          await ctx.editMessageText(
            `${t(lang, 'settingsTitle')}\n\n${t(lang, 'settingsText')}`,
            {
              parse_mode: 'HTML',
              reply_markup: getSettingsKeyboard(lang),
            }
          ).catch(() => {});
          break;
          
        case 'change_language':
          await ctx.editMessageText(
            `${t(lang, 'changeLanguage')}:`,
            {
              parse_mode: 'HTML',
              reply_markup: getLanguageKeyboard(lang),
            }
          ).catch(() => {});
          break;
          
        case 'help':
          await ctx.editMessageText(
            t(lang, 'helpText'),
            {
              parse_mode: 'HTML',
              reply_markup: getHelpKeyboard(lang),
            }
          ).catch(() => {});
          break;
          
        default:
          await ctx.reply(lang === 'ru' ? 'Неизвестное действие.' : 'Unknown action.');
      }
      
      return;
    }

    // Обработка смены языка
    if (callbackData.startsWith('lang:')) {
      const newLang = callbackData.split(':')[1];
      
      try {
        await setUserLanguage(userId, newLang);

        // Обновляем сообщение с настройками на новом языке
        await ctx.editMessageText(
          `${t(newLang, 'settingsTitle')}\n\n${t(newLang, 'settingsText')}`,
          {
            parse_mode: 'HTML',
            reply_markup: getSettingsKeyboard(newLang),
          }
        ).catch(() => {});
      } catch (err) {
        console.error('Error changing language:', err.message);
        await ctx.reply(t(lang, 'errorOccurred')).catch(() => {});
      }
      
      return;
    }
    
    // Обработка admin callback'ов
    if (callbackData.startsWith('admin:')) {
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        await ctx.reply(t(lang, 'insufficientRights')).catch(() => {});
        return;
      }

      const action = callbackData.split(':')[1];
      
      switch (action) {
        case 'edit_system_prompt':
          await updateSession(userId, { admin_mode: 'edit_system_prompt' });
          await ctx.reply(
            '<b>Редактирование системного промпта</b>\n\n' +
            'Отправьте новый текст системного промпта.\n\n' +
            'Формат · текст, TXT или PDF.\n\n' +
            '<i>Изменение повлияет на поведение системы для всех пользователей.</i>\n\n' +
            'Отмена · /admin',
            { parse_mode: 'HTML' }
          );
          break;

        case 'edit_blocks':
          await updateSession(userId, { admin_mode: 'edit_blocks' });
          await ctx.reply(
            '<b>Редактирование этапов</b>\n\n' +
            'Отправьте новый текст этапов анализа.\n\n' +
            'Формат · текст, TXT или PDF.\n\n' +
            '<i>Изменение повлияет на структуру анализа для всех пользователей.</i>\n\n' +
            'Отмена · /admin',
            { parse_mode: 'HTML' }
          );
          break;

        case 'edit_glossary':
          await updateSession(userId, { admin_mode: 'edit_glossary' });
          await ctx.reply(
            '<b>Редактирование глоссария</b>\n\n' +
            'Отправьте новый текст глоссария терминов.\n\n' +
            'Формат · текст, TXT или PDF.\n\n' +
            '<i>Изменение повлияет на определения терминов для всех пользователей.</i>\n\n' +
            'Отмена · /admin',
            { parse_mode: 'HTML' }
          );
          break;

        case 'edit_bibliography':
          await updateSession(userId, { admin_mode: 'edit_bibliography' });
          await ctx.reply(
            '<b>Редактирование библиографии</b>\n\n' +
            'Отправьте новый текст библиографии первоисточников.\n\n' +
            'Формат · текст, TXT или PDF.\n\n' +
            '<i>Изменение повлияет на библиографию для всех пользователей.</i>\n\n' +
            'Отмена · /admin',
            { parse_mode: 'HTML' }
          );
          break;

        case 'edit_calculators':
          await updateSession(userId, { admin_mode: 'edit_calculators' });
          await ctx.reply(
            '<b>Редактирование калькуляторов</b>\n\n' +
            'Отправьте новый список инструментов расчёта и ссылок.\n\n' +
            'Формат · текст, TXT или PDF.\n\n' +
            '<i>Изменение повлияет на список калькуляторов для всех пользователей.</i>\n\n' +
            'Отмена · /admin',
            { parse_mode: 'HTML' }
          );
          break;
          
        case 'close':
          await updateSession(userId, { admin_mode: null });
          await ctx.deleteMessage().catch(() => {});
          break;
          
        default:
          await ctx.reply('Неизвестное действие.');
      }

      return;
    }

    console.warn(`[callback] Неизвестный callback: ${callbackData}`);
    await ctx
      .reply(
        lang === 'ru'
          ? 'Кнопка устарела или не поддерживается. Нажмите /start для актуального меню.'
          : 'This button is outdated. Press /start for the current menu.'
      )
      .catch(() => {});
    } catch (err) {
      console.error('[callback] fatal:', err.message, err.stack);
      await ctx
        .reply(`${t(lang, 'errorOccurred')} · ${err.message}\n\n${t(lang, 'tryAgain')}`)
        .catch(() => {});
    }
  });

  bot.on('text', async (ctx) => {
    if (!ctx.from?.id) return;

    const text = ctx.message.text?.trim();
    if (!text) return;

    const userId = ctx.from.id;
    const lang = await getUserLanguage(userId);

    if (text.startsWith('/')) {
      await ctx.reply(t(lang, 'commandsDisabled'));
      return;
    }
    
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
        await ctx.reply('У вас недостаточно прав');
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
        await ctx.reply(
          `<b>${promptName}</b> успешно обновлён.\n\n` +
          `Длина: ${text.length} символов\n` +
          `Новый промпт будет использоваться для всех новых запросов к ИИ.`
        );
      } catch (err) {
        console.error('Ошибка обновления промпта:', err.message);
        await ctx.reply(`Ошибка · ${err.message}`);
      }
      
      return;
    }

    const sessionForTopup = await getSession(userId);
    if (sessionForTopup?.ui_mode === 'topup') {
      const parsed = parseTopupAmount(text);
      if (!parsed.ok) {
        const hint =
          parsed.error === 'min'
            ? formatTopupInvalidAmount(lang, { min: parsed.min })
            : parsed.error === 'max'
              ? formatTopupInvalidAmount(lang, { max: parsed.max })
              : formatTopupInvalidAmount(lang);
        await ctx.reply(hint, { reply_markup: getTopupCancelKeyboard(lang) }).catch(() => {});
        return;
      }

      try {
        await ctx.sendChatAction('typing').catch(() => {});
        const payment = await createTopupPayment(userId, parsed.amountRub, lang);

        if (!payment.confirmationUrl) {
          throw new Error(lang === 'ru' ? 'Не получена ссылка на оплату.' : 'Payment link missing.');
        }

        await updateSession(userId, { ui_mode: null });

        await ctx.reply(formatPaymentLinkMessage(parsed.amountRub, lang), {
          parse_mode: 'HTML',
          reply_markup: getPaymentLinkKeyboard(payment.confirmationUrl, lang),
        });
      } catch (err) {
        console.error('Topup error:', err.message);
        await ctx
          .reply(
            lang === 'ru'
              ? `Не удалось создать платёж · ${err.message}`
              : `Failed to create payment · ${err.message}`,
            { reply_markup: getTopupCancelKeyboard(lang) },
          )
          .catch(() => {});
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

    try {
      const payload = await handleText(ctx.from, text);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка text:', err.message, err.stack);
      await ctx.reply(`Ошибка · ${err.message}\n\nПовторите попытку.`).catch(() => {});
    } finally {
      setTimeout(() => {
        processingMessages.delete(key);
      }, MESSAGE_DEBOUNCE_MS);
    }
  });

  bot.on('photo', async (ctx) => {
    if (!ctx.from?.id) return;

    const photos = ctx.message.photo ?? [];
    const largest = photos[photos.length - 1];
    if (!largest?.file_id) return;

    await ctx.sendChatAction('typing').catch(() => {});
    
    try {
      const payload = await handleFile(ctx.from, largest.file_id, 'photo');
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка photo:', err.message);
      await ctx.reply('Ошибка обработки фото. Попробуй ещё раз.');
    }
  });

  bot.on('document', async (ctx) => {
    if (!ctx.from?.id) return;

    const document = ctx.message.document;
    if (!document?.file_id) return;
    
    const userId = ctx.from.id;
    
    // Проверяем режим админа из БД
    const { getSession, updateSession } = await import('./db/sessions.js');
    const session = await getSession(userId);
    const adminMode = session?.admin_mode;
    
    console.log(`[document] userId=${userId}, adminMode=${adminMode}, fileName=${document.file_name}`);
    
    if (adminMode) {
      console.log(`[document] Админ в режиме ${adminMode}`);
      const { isAdmin } = await import('./db/users.js');
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        console.log('[document] НЕ админ, сбрасываем режим');
        await updateSession(userId, { admin_mode: null });
        await ctx.reply('У вас недостаточно прав');
        return;
      }
      
      const mimeType = document.mime_type || '';
      const fileName = document.file_name || '';
      
      // Проверяем тип файла - TXT или PDF
      const isTxt = mimeType.includes('text') || fileName.endsWith('.txt');
      const isPdf = mimeType === 'application/pdf' || fileName.endsWith('.pdf');
      
      if (!isTxt && !isPdf) {
        await ctx.reply(
          'Поддерживаются только TXT и PDF файлы.\n\n' +
          'Отправьте промпт в одном из форматов:\n' +
          '• Текстовое сообщение\n' +
          '• TXT файл\n' +
          '• PDF файл'
        );
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
        await ctx.reply(
          `<b>${promptName}</b> успешно обновлён из файла.\n\n` +
          `Файл: ${fileName}\n` +
          `Длина: ${extractedText.length} символов\n` +
          `Новый промпт будет использоваться для всех новых запросов к ИИ.`
        );
      } catch (err) {
        console.error('Ошибка обработки файла промпта:', err.message);
        await ctx.reply(`Ошибка · ${err.message}`);
      }
      
      return;
    }

    await ctx.sendChatAction('typing').catch(() => {});
    
    try {
      const payload = await handleFile(ctx.from, document.file_id, 'document', document.file_name, document.mime_type);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка document:', err.message);
      await ctx.reply('Ошибка обработки документа. Попробуй ещё раз.');
    }
  });

  bot.on('message', async (ctx) => {
    if (ctx.message.text || ctx.message.photo || ctx.message.document) return;
    if (!ctx.from?.id) return;

    await ctx.reply(
      'Этот тип сообщения не поддерживается. Используй кнопки, текст анкеты или файл на экране блока.',
    );
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
