import { getSupabase } from './supabase.js';

const ALLOWED_ROLES = new Set(['user', 'assistant', 'system']);
const MAX_USER_MESSAGE_LENGTH = 4000;
const MAX_STORED_CONTENT_LENGTH = 16000;

function assertValidUserId(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Некорректный идентификатор пользователя.');
  }
}

function assertValidRole(role) {
  if (!ALLOWED_ROLES.has(role)) {
    throw new Error('Некорректная роль сообщения.');
  }
}

function normalizeContent(content, maxLength) {
  const trimmed = content?.trim();
  if (!trimmed) {
    throw new Error('Пустое сообщение.');
  }
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

export function normalizeUserMessage(content) {
  return normalizeContent(content, MAX_USER_MESSAGE_LENGTH);
}

export async function getOrCreateUserChat(userId) {
  assertValidUserId(userId);
  const supabase = getSupabase();

  const { data: existing, error: selectError } = await supabase
    .from('user_chats')
    .select('id, user_id, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Не удалось получить чат: ${selectError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from('user_chats')
    .insert({ user_id: userId })
    .select('id, user_id, created_at, updated_at')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: retry, error: retryError } = await supabase
        .from('user_chats')
        .select('id, user_id, created_at, updated_at')
        .eq('user_id', userId)
        .single();

      if (retryError) {
        throw new Error(`Не удалось получить чат после гонки: ${retryError.message}`);
      }
      return retry;
    }
    throw new Error(`Не удалось создать чат: ${insertError.message}`);
  }

  return created;
}

export async function saveChatMessages(chatId, messages) {
  if (!chatId || !Array.isArray(messages) || messages.length === 0) {
    throw new Error('Нет сообщений для сохранения.');
  }

  const rows = messages.map(({ role, content }) => {
    assertValidRole(role);
    return {
      chat_id: chatId,
      role,
      content: normalizeContent(content, MAX_STORED_CONTENT_LENGTH),
    };
  });

  const supabase = getSupabase();
  const { error } = await supabase.from('user_chat_messages').insert(rows);

  if (error) {
    throw new Error(`Не удалось сохранить сообщения: ${error.message}`);
  }

  await supabase
    .from('user_chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId);
}
