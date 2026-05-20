import { getSupabase } from './supabase.js';

export function mapTelegramUser(from) {
  return {
    id: from.id,
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    language_code: from.language_code ?? null,
    is_premium: Boolean(from.is_premium),
    last_seen_at: new Date().toISOString(),
  };
}

export async function upsertUserFromTelegram(from) {
  const supabase = getSupabase();
  const row = mapTelegramUser(from);

  const { data, error } = await supabase
    .from('users')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Не удалось сохранить пользователя: ${error.message}`);
  }

  return data;
}
