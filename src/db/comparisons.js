import { getSupabase } from './supabase.js';

function assertUserId(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Некорректный user_id.');
  }
}

export async function saveComparison(userId, record) {
  assertUserId(userId);
  const supabase = getSupabase();

  const row = {
    user_id: userId,
    subject_data: record.subjectData ?? {},
    partner_data: record.partnerData ?? {},
    goal_data: record.goalData ?? {},
    target_block_id: record.targetBlockId ?? null,
    block_variant: record.blockVariant ?? null,
    response_text: record.responseText ?? null,
    json_payload: record.jsonPayload ?? null,
  };

  const { data, error } = await supabase.from('user_comparisons').insert(row).select('id').single();

  if (error) {
    console.error('[comparisons] save:', error.message);
    throw new Error(`Не удалось сохранить сравнение: ${error.message}`);
  }

  return data;
}

export async function listComparisons(userId, limit = 10) {
  assertUserId(userId);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('user_comparisons')
    .select('id, partner_data, goal_data, target_block_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[comparisons] list:', error.message);
    return [];
  }

  return data ?? [];
}
