/** Разделение личных сообщений и бесед (group / supergroup). */

let cachedBotUser = null;

export function isPrivateChat(ctx) {
  return ctx.chat?.type === 'private';
}

export function isGroupChat(ctx) {
  const type = ctx.chat?.type;
  return type === 'group' || type === 'supergroup';
}

export async function getBotUser(telegram) {
  if (!cachedBotUser) {
    cachedBotUser = await telegram.getMe();
  }
  return cachedBotUser;
}
