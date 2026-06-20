import { getSupabase } from './supabase.js';
import { BLOCK_IDS } from '../scenario/constants.js';

export async function saveBlockResult({ chatId, userId, blockId, responseText, jsonPayload }) {
  if (!BLOCK_IDS.includes(blockId)) {
    throw new Error('Некорректный block_id.');
  }

  const supabase = getSupabase();
  const baseRow = {
    chat_id: chatId,
    user_id: userId,
    block_id: blockId,
    response_text: responseText.slice(0, 50000),
  };

  let { error } = await supabase.from('analysis_block_results').insert({
    ...baseRow,
    json_payload: jsonPayload ?? null,
  });

  if (error && /json_payload|column/i.test(error.message)) {
    ({ error } = await supabase.from('analysis_block_results').insert(baseRow));
    if (!error) {
      console.warn(
        'Сохранён блок без json_payload — выполни миграцию 004_block_results_v21.sql в Supabase.',
      );
    }
  }

  if (error) {
    if (/block_id_check|check constraint/i.test(error.message)) {
      throw new Error(
        `Не удалось сохранить результат блока: ${error.message}. Примени миграцию 004_block_results_v21.sql в Supabase.`,
      );
    }
    throw new Error(`Не удалось сохранить результат блока: ${error.message}`);
  }
}

export async function getCompletedBlocks(chatId) {
  const supabase = getSupabase();

  let { data, error } = await supabase
    .from('analysis_block_results')
    .select('block_id, response_text, json_payload, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error && /json_payload/i.test(error.message)) {
    ({ data, error } = await supabase
      .from('analysis_block_results')
      .select('block_id, response_text, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true }));
  }

  if (error) {
    throw new Error(`Не удалось загрузить блоки: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    block_id: row.block_id,
    response_text: row.response_text,
    json_payload: row.json_payload ?? null,
    created_at: row.created_at ?? null,
  }));
}

/** Блоки текущей сессии (с session_start_at), последняя запись на block_id. */
export async function getCompletedBlocksForSession(chatId, sessionStartAt) {
  const supabase = getSupabase();

  let query = supabase
    .from('analysis_block_results')
    .select('block_id, response_text, json_payload, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (sessionStartAt) {
    query = query.gte('created_at', sessionStartAt);
  }

  let { data, error } = await query;

  if (error && /json_payload/i.test(error.message)) {
    let fallback = supabase
      .from('analysis_block_results')
      .select('block_id, response_text, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (sessionStartAt) {
      fallback = fallback.gte('created_at', sessionStartAt);
    }
    ({ data, error } = await fallback);
  }

  if (error) {
    throw new Error(`Не удалось загрузить блоки сессии: ${error.message}`);
  }

  const latestByBlock = new Map();
  for (const row of data ?? []) {
    latestByBlock.set(row.block_id, {
      block_id: row.block_id,
      response_text: row.response_text,
      json_payload: row.json_payload ?? null,
      created_at: row.created_at ?? null,
    });
  }

  return [...latestByBlock.values()];
}
