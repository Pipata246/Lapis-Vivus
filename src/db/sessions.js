import { getSupabase } from './supabase.js';
import { STEPS } from '../scenario/constants.js';

function assertUserId(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Некорректный user_id.');
  }
}

export async function getSession(userId) {
  assertUserId(userId);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось загрузить сессию: ${error.message}`);
  }

  return data;
}

export async function upsertSession(userId, chatId, patch) {
  assertUserId(userId);
  const supabase = getSupabase();

  const row = {
    user_id: userId,
    chat_id: chatId,
    updated_at: new Date().toISOString(),
    ...patch,
  };

  const { data, error } = await supabase
    .from('user_sessions')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Не удалось сохранить сессию: ${error.message}`);
  }

  return data;
}

export async function resetSession(userId, chatId) {
  return upsertSession(userId, chatId, {
    step: STEPS.MENU,
    block_index: 0,
    collected_data: {},
    last_block_id: null,
  });
}

export async function updateSession(userId, patch) {
  assertUserId(userId);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('user_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Не удалось обновить сессию: ${error.message}`);
  }

  return data;
}

export function mergeCollectedData(session, additions) {
  return {
    ...(session?.collected_data ?? {}),
    ...additions,
  };
}
