import { Telegraf } from 'telegraf';
import { handleUserText } from './services/conversation.js';
import { getOrCreateUserChat } from './db/chats.js';
import { upsertUserFromTelegram } from './db/users.js';
import { loadBotConfig } from './config.js';

const TELEGRAM_MAX_MESSAGE = 4096;

const WELCOME_TEXT = 'Привет как дела?';

let botInstance = null;

function registerHandlers(bot) {
  bot.start(async (ctx) => {
    if (!ctx.from?.id) {
      return;
    }

    try {
      await upsertUserFromTelegram(ctx.from);
      await getOrCreateUserChat(ctx.from.id);
    } catch (err) {
      console.error('Ошибка инициализации пользователя:', err.message);
    }

    await ctx.reply(WELCOME_TEXT);
  });

  bot.on('text', async (ctx) => {
    if (!ctx.from?.id) {
      return;
    }

    const text = ctx.message.text?.trim();
    if (!text || text.startsWith('/')) {
      return;
    }

    await ctx.sendChatAction('typing');

    try {
      const answer = await handleUserText(ctx.from, text);
      await ctx.reply(answer.slice(0, TELEGRAM_MAX_MESSAGE));
    } catch (err) {
      console.error('Ошибка ИИ:', err.message);
      await ctx.reply('Сейчас не могу ответить. Попробуй позже.');
    }
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
