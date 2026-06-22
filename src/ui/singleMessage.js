/**
 * Single-message navigation — одно сообщение бота на весь UI.
 */

import { TELEGRAM_PARSE_MODE, htmlToPlain } from '../ai/formatResponse.js';
import { btn } from './brand.js';
import { getSession, updateSession } from '../db/sessions.js';

const TELEGRAM_MAX = 4096;
const MAIN_MENU_CALLBACKS = new Set(['nav:main_menu', 'lv:menu']);

export function hasMainMenuRow(keyboard) {
  const rows = keyboard?.inline_keyboard ?? [];
  return rows.some((row) =>
    row.some((b) => MAIN_MENU_CALLBACKS.has(b.callback_data)),
  );
}

/** Нижняя строка «Главное меню» на каждом экране (кроме самого главного меню). */
export function ensureMainMenuRow(keyboard, lang = 'ru') {
  if (!keyboard?.inline_keyboard) {
    return { inline_keyboard: [[{ text: btn(lang, 'menu'), callback_data: 'lv:menu' }]] };
  }
  if (hasMainMenuRow(keyboard)) {
    return keyboard;
  }
  return {
    inline_keyboard: [
      ...keyboard.inline_keyboard.map((row) => [...row]),
      [{ text: btn(lang, 'menu'), callback_data: 'lv:menu' }],
    ],
  };
}

export function resolveUiTarget(ctx, session) {
  const chatId = ctx.chat?.id ?? session?.chat_id ?? null;
  const fromCallback = ctx.callbackQuery?.message?.message_id ?? null;
  const fromSession = session?.ui_message_id ?? session?.collected_data?._ui_message_id ?? null;
  const messageId = fromCallback ?? fromSession ?? null;
  return { chatId, messageId };
}

export async function persistUiMessageId(userId, messageId, session = null) {
  if (!userId || !messageId) return;
  try {
    await updateSession(userId, { ui_message_id: messageId });
  } catch (err) {
    const msg = String(err.message ?? '');
    if (/ui_message_id|column|schema cache/i.test(msg)) {
      try {
        const s = session ?? (await getSession(userId));
        if (s) {
          await updateSession(userId, {
            collected_data: { ...(s.collected_data ?? {}), _ui_message_id: messageId },
          });
        }
      } catch (fallbackErr) {
        console.error('[singleMessage] persist id (fallback):', fallbackErr.message);
      }
      return;
    }
    console.error('[singleMessage] persist id:', msg);
  }
}

export async function deleteUserInput(ctx) {
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;
  if (!chatId || !messageId) return;
  await ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
}

export function collapsePayloadText(text, extraMessages) {
  if (!extraMessages?.length) return text ?? '';
  const parts = [text];
  for (const part of extraMessages) {
    parts.push(typeof part === 'string' ? part : part?.text);
  }
  const joined = parts.filter(Boolean).join('\n\n');
  if (joined.length <= TELEGRAM_MAX) return joined;
  return `${joined.slice(0, TELEGRAM_MAX - 16)}\n\n<i>…</i>`;
}

async function sendPlain(ctx, text, keyboard) {
  const plainOptions = keyboard ? { reply_markup: keyboard } : {};
  return ctx.reply(htmlToPlain(text), plainOptions);
}

/**
 * Доставляет экран: редактирует сохранённое сообщение или создаёт новое.
 */
export async function deliverSingleMessage(
  ctx,
  { text, keyboard, userId, lang = 'ru', skipMainMenu = false },
) {
  // Сообщение пользователя (текст, команда /profile и т.д.) — убираем из чата
  if (ctx.message?.message_id && !ctx.callbackQuery) {
    await deleteUserInput(ctx);
  }

  const session = userId ? await getSession(userId).catch(() => null) : null;
  const finalKeyboard = skipMainMenu ? keyboard : ensureMainMenuRow(keyboard, lang);

  const replyOptions = {
    parse_mode: TELEGRAM_PARSE_MODE,
    ...(finalKeyboard ? { reply_markup: finalKeyboard } : {}),
  };

  const { chatId, messageId } = resolveUiTarget(ctx, session);

  const sendNew = async () => {
    try {
      const msg = await ctx.reply(text, replyOptions);
      if (userId && msg?.message_id) await persistUiMessageId(userId, msg.message_id, session);
      return msg;
    } catch (err) {
      if (err.message?.includes('parse') || err.message?.includes('entities')) {
        const msg = await sendPlain(ctx, text, finalKeyboard);
        if (userId && msg?.message_id) await persistUiMessageId(userId, msg.message_id, session);
        return msg;
      }
      if (err.message?.includes('message is too long')) {
        const short = `${htmlToPlain(text).slice(0, TELEGRAM_MAX - 16)}…`;
        const msg = await ctx.reply(short, finalKeyboard ? { reply_markup: finalKeyboard } : {});
        if (userId && msg?.message_id) await persistUiMessageId(userId, msg.message_id, session);
        return msg;
      }
      throw err;
    }
  };

  if (!chatId || !messageId) {
    return sendNew();
  }

  try {
    await ctx.telegram.editMessageText(chatId, messageId, undefined, text, replyOptions);
    if (userId) await persistUiMessageId(userId, messageId, session);
    return { message_id: messageId, chat: { id: chatId } };
  } catch (err) {
    if (/message is not modified/i.test(err.message)) {
      if (userId) await persistUiMessageId(userId, messageId, session);
      return { message_id: messageId, chat: { id: chatId } };
    }
    console.log('[singleMessage] edit failed → new:', err.message);
    await ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
    return sendNew();
  }
}
