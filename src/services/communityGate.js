import { loadCommunityConfig } from '../config.js';

/** Статусы участника, при которых доступ к боту разрешён. */
const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);

/**
 * Проверяет, подписан ли пользователь на сообщество.
 * Бот должен быть администратором канала/группы (getChatMember).
 */
export async function isUserInCommunity(telegram, userId) {
  if (!telegram || !userId) return false;

  const { chatId } = loadCommunityConfig();

  try {
    const member = await telegram.getChatMember(chatId, userId);
    return MEMBER_STATUSES.has(member?.status);
  } catch (err) {
    console.error('[communityGate] getChatMember:', err.message, { chatId, userId });
    return false;
  }
}
