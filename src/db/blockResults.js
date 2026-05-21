import { getSupabase } from './supabase.js';

const ALLOWED_BLOCKS = new Set(['1A', '1B', '1C', '1D', '2', '3', '4', '5']);

export async function saveBlockResult({ chatId, userId, blockId, responseText }) {
  if (!ALLOWED_BLOCKS.has(blockId)) {
    throw new Error('Некорректный block_id.');
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('analysis_block_results').insert({
    chat_id: chatId,
    user_id: userId,
    block_id: blockId,
    response_text: responseText.slice(0, 50000),
  });

  if (error) {
    throw new Error(`Не удалось сохранить результат блока: ${error.message}`);
  }
}

export async function getCompletedBlockSummaries(chatId, limit = 8) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('analysis_block_results')
    .select('block_id, response_text, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Не удалось загрузить блоки: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    block_id: row.block_id,
    excerpt: row.response_text.slice(0, 1500),
  }));
}
