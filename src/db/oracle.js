import { getSupabase } from './supabase.js';
import { loadUserAnalysisProfile } from './userAnalysisProfile.js';

export const MAX_ORACLE_HISTORY = 5;
export const MAX_ORACLE_AI_TURNS = 10;

export const ORACLE_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
};

function assertUserId(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Некорректный user_id.');
  }
}

function assertChatId(chatId) {
  if (typeof chatId !== 'string' || !/^[0-9a-f-]{36}$/i.test(chatId)) {
    throw new Error('Некорректный id чата Оракула.');
  }
}

/** Сжатый снимок профиля для контекста ИИ (без полных JSON блоков). */
export function buildProfileSnapshot(analysisProfile) {
  const blocks = analysisProfile?.blocks ?? {};
  const blocksSummary = {};

  for (const [blockId, row] of Object.entries(blocks)) {
    blocksSummary[blockId] = {
      completed_at: row?.completed_at ?? null,
      excerpt: row?.response_excerpt ? String(row.response_excerpt).slice(0, 240) : null,
    };
  }

  return {
    schema_version: analysisProfile?.schema_version ?? 1,
    updated_at: analysisProfile?.updated_at ?? null,
    user_data: analysisProfile?.user_data ?? {},
    blocks_completed: Object.keys(blocks),
    blocks_summary: blocksSummary,
  };
}

export async function loadProfileSnapshotForOracle(userId) {
  const profile = await loadUserAnalysisProfile(userId);
  return buildProfileSnapshot(profile);
}

export function hasOracleReadyProfile(snapshot) {
  const ud = snapshot?.user_data ?? {};
  return Boolean(ud.gender && ud.birth_date && ud.birth_place);
}

export function chatHasUserDialogue(chat) {
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];
  return messages.some((m) => m.role === 'user');
}

async function pruneArchivedChats(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('oracle_chats')
    .select('id')
    .eq('user_id', userId)
    .eq('status', ORACLE_STATUS.ARCHIVED)
    .order('updated_at', { ascending: false });

  if (error || !data?.length) return;

  const toDelete = data.slice(MAX_ORACLE_HISTORY).map((row) => row.id);
  if (toDelete.length === 0) return;

  await supabase.from('oracle_chats').delete().in('id', toDelete);
}

/** Архивные чаты (история), без активного. */
export async function listArchivedOracleChats(userId, limit = MAX_ORACLE_HISTORY) {
  assertUserId(userId);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('oracle_chats')
    .select('id, ai_turns, messages, created_at, updated_at, status')
    .eq('user_id', userId)
    .eq('status', ORACLE_STATUS.ARCHIVED)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[oracle] list archived:', error.message);
    return [];
  }

  return data ?? [];
}

/** @deprecated используйте listArchivedOracleChats */
export async function listOracleChats(userId, limit = MAX_ORACLE_HISTORY) {
  return listArchivedOracleChats(userId, limit);
}

export async function getActiveOracleChat(userId) {
  assertUserId(userId);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('oracle_chats')
    .select('*')
    .eq('user_id', userId)
    .eq('status', ORACLE_STATUS.ACTIVE)
    .maybeSingle();

  if (error) {
    console.error('[oracle] get active:', error.message);
    return null;
  }

  return data;
}

export async function getOracleChat(userId, chatId) {
  assertUserId(userId);
  assertChatId(chatId);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('oracle_chats')
    .select('*')
    .eq('user_id', userId)
    .eq('id', chatId)
    .maybeSingle();

  if (error) {
    console.error('[oracle] get:', error.message);
    return null;
  }

  return data;
}

export async function archiveOracleChat(userId, chatId) {
  assertUserId(userId);
  assertChatId(chatId);

  const chat = await getOracleChat(userId, chatId);
  if (!chat) {
    throw new Error('Чат не найден.');
  }

  if (chat.status === ORACLE_STATUS.ARCHIVED) {
    return chat;
  }

  return updateOracleChat(userId, chatId, { status: ORACLE_STATUS.ARCHIVED });
}

export async function createActiveOracleChat(userId, profileSnapshot, welcomeText) {
  assertUserId(userId);

  const existing = await getActiveOracleChat(userId);
  if (existing) {
    throw new Error('У пользователя уже есть активный чат Оракула.');
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  const row = {
    user_id: userId,
    status: ORACLE_STATUS.ACTIVE,
    messages: [
      {
        role: 'assistant',
        content: welcomeText,
        ts: now,
        kind: 'welcome',
      },
    ],
    profile_snapshot: profileSnapshot ?? {},
    ai_turns: 0,
    context_segment: 0,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from('oracle_chats').insert(row).select('*').single();

  if (error) {
    console.error('[oracle] create active:', error.message);
    throw new Error(`Не удалось создать чат Оракула: ${error.message}`);
  }

  return data;
}

/**
 * Архивирует текущий активный чат и создаёт новый с приветствием.
 * Старый чат сохраняется в истории (если был диалог).
 */
export async function rotateActiveOracleChat(userId, profileSnapshot, welcomeText) {
  assertUserId(userId);

  const active = await getActiveOracleChat(userId);
  if (active) {
    if (chatHasUserDialogue(active)) {
      await archiveOracleChat(userId, active.id);
      await pruneArchivedChats(userId);
    } else {
      await deleteOracleChat(userId, active.id, { allowActive: true });
    }
  }

  return createActiveOracleChat(userId, profileSnapshot, welcomeText);
}

export async function ensureActiveOracleChat(userId, profileSnapshot, welcomeText) {
  const active = await getActiveOracleChat(userId);
  if (active) {
    return active;
  }
  return createActiveOracleChat(userId, profileSnapshot, welcomeText);
}

export async function deleteOracleChat(userId, chatId, { allowActive = false } = {}) {
  assertUserId(userId);
  assertChatId(chatId);

  const chat = await getOracleChat(userId, chatId);
  if (!chat) {
    return;
  }

  if (chat.status === ORACLE_STATUS.ACTIVE && !allowActive) {
    throw new Error('Нельзя удалить активный чат. Начните новый диалог.');
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('oracle_chats').delete().eq('user_id', userId).eq('id', chatId);

  if (error) {
    console.error('[oracle] delete:', error.message);
    throw new Error(`Не удалось удалить чат: ${error.message}`);
  }
}

export async function updateOracleChat(userId, chatId, patch) {
  assertUserId(userId);
  assertChatId(chatId);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('oracle_chats')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', chatId)
    .select('*')
    .single();

  if (error) {
    console.error('[oracle] update:', error.message);
    throw new Error(`Не удалось обновить чат: ${error.message}`);
  }

  return data;
}

export function dialogueMessages(chat) {
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];
  return messages.filter((m) => m.kind !== 'welcome');
}

export async function appendOracleMessages(userId, chatId, newMessages, { aiTurnDelta = 0 } = {}) {
  const chat = await getOracleChat(userId, chatId);
  if (!chat) {
    throw new Error('Чат не найден.');
  }

  if (chat.status !== ORACLE_STATUS.ACTIVE) {
    throw new Error('Чат не активен.');
  }

  const stamped = newMessages.map((m) => ({
    role: m.role,
    content: m.content,
    ts: m.ts ?? new Date().toISOString(),
    kind: m.kind ?? null,
  }));

  const messages = [...(Array.isArray(chat.messages) ? chat.messages : []), ...stamped];
  const aiTurns = (chat.ai_turns ?? 0) + aiTurnDelta;

  return updateOracleChat(userId, chatId, {
    messages,
    ai_turns: aiTurns,
  });
}
