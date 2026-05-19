import { Telegraf } from 'telegraf';
import { loadConfig } from './config.js';

const WELCOME_TEXT = 'Привет как дела?';

let botInstance = null;

function registerHandlers(bot) {
  bot.start(async (ctx) => {
    if (!ctx.from?.id) {
      return;
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
