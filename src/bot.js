import { Telegraf } from 'telegraf';
import { upsertUserFromTelegram } from './db/users.js';
import { loadConfig } from './config.js';

const WELCOME_TEXT = 'Привет как дела?';

let botInstance = null;

function registerHandlers(bot) {
  bot.start(async (ctx) => {
    if (!ctx.from?.id) {
      return;
    }

    try {
      await upsertUserFromTelegram(ctx.from);
    } catch (err) {
      console.error('Ошибка сохранения пользователя в БД:', err.message);
    }

    await ctx.reply(WELCOME_TEXT);
  });

  bot.catch((err) => {
    console.error('Ошибка обработки обновления:', err.message);
  });
}

export function getBot() {
  if (!botInstance) {
    const { botToken } = loadConfig();
    botInstance = new Telegraf(botToken);
    registerHandlers(botInstance);
  }

  return botInstance;
}
