import { getSupabase } from './supabase.js';
import { BLOCK_IDS } from '../scenario/constants.js';

export async function saveBlockResult({ chatId, userId, blockId, responseText, jsonPayload }) {
  if (!BLOCK_IDS.includes(blockId)) {
    throw new Error('Некорректный block_id.');
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('analysis_block_results').insert({
    chat_id: chatId,
    user_id: userId,
    block_id: blockId,
    response_text: responseText.slice(0, 50000),
    json_payload: jsonPayload ?? null,
  });

  if (error) {
    throw new Error(`Не удалось сохранить результат блока: ${error.message}`);
  }
}

/** Все завершённые блоки целиком (для контекста ИИ). */
export async function getCompletedBlocks(chatId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('analysis_block_results')
    .select('block_id, response_text, json_payload, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Не удалось загрузить блоки: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    block_id: row.block_id,
    response_text: row.response_text,
    json_payload: row.json_payload,
  }));
}
