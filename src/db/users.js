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

export async function isAdmin(userId) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();

  if (error) {
    return false;
  }

  return Boolean(data?.is_admin);
}

export async function upsertUserFromTelegram(from) {
  const supabase = getSupabase();
  const row = mapTelegramUser(from);

  // Проверяем существует ли пользователь
  const { data: existing } = await supabase
    .from('users')
    .select('id, language')
    .eq('id', from.id)
    .single();

  // Если новый пользователь - устанавливаем язык по умолчанию (английский)
  if (!existing) {
    row.language = 'en';
  }

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

export async function getUserLanguage(userId) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('users')
    .select('language')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return 'en'; // Default language
  }

  return data.language || 'en';
}

export async function setUserLanguage(userId, language) {
  if (!['en', 'ru'].includes(language)) {
    throw new Error('Unsupported language. Use: en, ru');
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('users')
    .update({ language })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to update language: ${error.message}`);
  }

  return language;
}

export async function getUserProfile(userId) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to get user profile: ${error.message}`);
  }

  return data;
}

export async function hasLegalAccepted(userId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('users')
    .select('legal_accepted')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[users] legal_accepted read:', error.message);
    return false;
  }

  return Boolean(data?.legal_accepted);
}

export async function acceptLegalDocuments(userId) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('users')
    .update({ legal_accepted: true, legal_accepted_at: now })
    .eq('id', userId);

  if (error) {
    throw new Error(`Не удалось сохранить согласие: ${error.message}`);
  }

  return true;
}

export async function saveUserProfile(userId, profileData) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Некорректный user_id.');
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('users')
    .update({ profile: profileData })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Не удалось сохранить профиль пользователя: ${error.message}`);
  }

  return data;
}
