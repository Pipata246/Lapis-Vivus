import { Telegraf } from 'telegraf';
import { loadBotConfig } from './config.js';
import {
  initUser,
  handleCallback,
  handleText,
  handleFile,
  sendScenarioReply,
} from './services/scenario.js';

let botInstance = null;

function registerHandlers(bot) {
  bot.start(async (ctx) => {
    if (!ctx.from?.id) return;
    try {
      const payload = await initUser(ctx.from);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка /start:', err.message);
      await ctx.reply('Не удалось запустить бота. Попробуй позже.');
    }
  });

  bot.on('callback_query', async (ctx) => {
    if (!ctx.from?.id) return;

    await ctx.answerCbQuery().catch(() => {});
    await ctx.sendChatAction('typing').catch(() => {});

    try {
      const payload = await handleCallback(ctx.from, ctx.callbackQuery.data);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка callback:', err.message);
      await ctx.reply('Ошибка обработки. Используй меню.');
    }
  });

  bot.on('text', async (ctx) => {
    if (!ctx.from?.id) return;

    const text = ctx.message.text?.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      await ctx.reply(
        'Команды отключены. Используй /start и кнопки сценария Lapis Vivus.',
      );
      return;
    }

    await ctx.sendChatAction('typing').catch(() => {});

    try {
      const payload = await handleText(ctx.from, text);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка text:', err.message);
      await ctx.reply('Ошибка. Используй кнопки меню.');
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
