import { loadCommunityConfig } from '../config.js';

/** Статусы участника, при которых доступ к боту разрешён. */
const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);

/** Свежий результат кэшируется на 60 с — меньше нагрузки на Telegram API. */
const CACHE_TTL_MS = 60_000;
/** При сбое API доверяем недавнему положительному ответу до 5 минут. */
const STALE_GRACE_MS = 300_000;

/** @type {Map<number, { subscribed: boolean, checkedAt: number }>} */
const membershipCache = new Map();

const NOT_MEMBER_ERRORS = /user not found|participant_id_invalid|member not found|chat not found/i;

function pruneCache() {
  const now = Date.now();
  for (const [id, entry] of membershipCache) {
    if (now - entry.checkedAt > STALE_GRACE_MS) {
      membershipCache.delete(id);
    }
  }
}

export function invalidateCommunityCache(userId) {
  if (userId) membershipCache.delete(userId);
}

function readCache(userId) {
  return membershipCache.get(userId) ?? null;
}

function writeCache(userId, subscribed) {
  membershipCache.set(userId, { subscribed, checkedAt: Date.now() });
  if (membershipCache.size > 2000) pruneCache();
}

/**
 * Проверяет подписку на сообщество с кэшем.
 * @param {{ fresh?: boolean }} options — fresh: true обходит кэш (кнопка «Проверить подписку»).
 */
export async function checkUserInCommunity(telegram, userId, { fresh = false } = {}) {
  if (!telegram || !userId) return false;

  const cached = readCache(userId);
  const now = Date.now();

  if (!fresh && cached && now - cached.checkedAt < CACHE_TTL_MS) {
    return cached.subscribed;
  }

  const { chatId } = loadCommunityConfig();

  try {
    const member = await telegram.getChatMember(chatId, userId);
    const subscribed = MEMBER_STATUSES.has(member?.status);
    writeCache(userId, subscribed);
    return subscribed;
  } catch (err) {
    console.error('[communityGate] getChatMember:', err.message, { chatId, userId });

    if (NOT_MEMBER_ERRORS.test(err.message ?? '')) {
      writeCache(userId, false);
      return false;
    }

    if (memberStatusIsLeft(err)) {
      writeCache(userId, false);
      return false;
    }

    if (cached?.subscribed && now - cached.checkedAt < STALE_GRACE_MS) {
      return true;
    }

    return cached?.subscribed ?? false;
  }
}

function memberStatusIsLeft(err) {
  const desc = String(err?.response?.description ?? err?.description ?? '');
  return /user is not a member|kicked|left/i.test(desc);
}

/**
 * Проверяет подписку без кэша (для «Принимаю» и явной перепроверки).
 * @deprecated Используйте checkUserInCommunity(telegram, userId, { fresh: true }).
 */
export async function isUserInCommunity(telegram, userId) {
  return checkUserInCommunity(telegram, userId, { fresh: true });
}
