import { getSupabase } from './supabase.js';
import { STEPS } from '../scenario/constants.js';

const BLOCK_RUNNING_STALE_MS = 12 * 60 * 1000;

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
    session_start_at: new Date().toISOString(),
    session_mode: 'full',
    target_block_id: null,
    goal_tree_path: [],
  });
}

export async function createSessionIfMissing(userId, chatId) {
  const existing = await getSession(userId);
  if (existing) {
    return existing;
  }
  return upsertSession(userId, chatId, {
    step: STEPS.MENU,
    block_index: 0,
    collected_data: {},
    last_block_id: null,
    session_start_at: new Date().toISOString(),
    session_mode: 'full',
    target_block_id: null,
    goal_tree_path: [],
  });
}

export async function updateSession(userId, patch, retries = 3) {
  assertUserId(userId);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const existing = await getSession(userId);
      if (!existing) {
        throw new Error('Сессия не найдена. Нажми /start.');
      }

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
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      // Exponential backoff: 100ms, 200ms, 400ms
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
    }
  }
}

export function mergeCollectedData(session, additions) {
  return {
    ...(session?.collected_data ?? {}),
    ...additions,
  };
}

/** Сброс «зависшего» block_running после таймаута Vercel. */
export function recoverStaleBlockRunning(session) {
  if (!session || session.step !== STEPS.BLOCK_RUNNING) {
    return session;
  }

  const updatedAt = session.updated_at ? new Date(session.updated_at).getTime() : 0;
  if (Date.now() - updatedAt < BLOCK_RUNNING_STALE_MS) {
    return session;
  }

  return {
    ...session,
    step: STEPS.BLOCK_PREP,
  };
}
