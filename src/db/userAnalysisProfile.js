/**
 * Накопительный JSON-профиль пользователя (users.profile).
 * Полный прогон и точечные сессии дополняют blocks[block_id] без затирания остального.
 */

import { BLOCK_IDS } from '../scenario/constants.js';
import { getSupabase } from './supabase.js';

const PROFILE_SCHEMA_VERSION = 1;

const USER_DATA_KEYS = [
  'gender',
  'gender_label',
  'birth_date',
  'birth_time',
  'birth_place',
  'session_mode',
  'target_block_id',
  'block_variant',
  'goal_leaf_label',
  'goal_maslow',
  'goal_path',
  'compare_mode',
  'partner_name',
  'partner_gender',
  'partner_gender_label',
  'partner_birth_date',
  'partner_birth_time',
  'partner_birth_place',
];

export function emptyAnalysisProfile() {
  return {
    schema_version: PROFILE_SCHEMA_VERSION,
    updated_at: null,
    user_data: {},
    blocks: {},
  };
}

/** @param {unknown} raw */
export function normalizeAnalysisProfile(raw) {
  if (!raw || typeof raw !== 'object') {
    return emptyAnalysisProfile();
  }

  const profile = /** @type {Record<string, unknown>} */ (raw);

  if (Array.isArray(profile.blocks)) {
    const blocks = {};
    for (const row of profile.blocks) {
      if (row?.block_id) {
        blocks[row.block_id] = row;
      }
    }
    return {
      schema_version: PROFILE_SCHEMA_VERSION,
      updated_at: profile.completed_at ?? profile.updated_at ?? null,
      user_data: profile.user_data ?? {},
      blocks,
    };
  }

  return {
    schema_version: profile.schema_version ?? PROFILE_SCHEMA_VERSION,
    updated_at: profile.updated_at ?? null,
    user_data: profile.user_data ?? {},
    blocks: profile.blocks ?? {},
  };
}

function pickUserData(collectedData) {
  if (!collectedData || typeof collectedData !== 'object') {
    return {};
  }

  const picked = {};
  for (const key of USER_DATA_KEYS) {
    const value = collectedData[key];
    if (value !== undefined && value !== null && value !== '') {
      picked[key] = value;
    }
  }
  return picked;
}

export async function loadUserAnalysisProfile(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('profile')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось загрузить профиль: ${error.message}`);
  }

  return normalizeAnalysisProfile(data?.profile);
}

/**
 * Дописать или обновить один блок в users.profile (остальные блоки не трогаются).
 */
export async function mergeBlockIntoUserProfile(
  userId,
  { blockId, jsonPayload, responseText, completedAt, userData },
) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Некорректный user_id.');
  }

  const current = await loadUserAnalysisProfile(userId);
  const userPatch = pickUserData(userData);

  if (Object.keys(userPatch).length > 0) {
    current.user_data = { ...current.user_data, ...userPatch };
  }

  current.blocks[blockId] = {
    block_id: blockId,
    json_payload: jsonPayload ?? null,
    completed_at: completedAt ?? new Date().toISOString(),
  };

  if (responseText) {
    current.blocks[blockId].response_excerpt = String(responseText).slice(0, 400);
  }

  current.updated_at = new Date().toISOString();

  const supabase = getSupabase();
  const { error } = await supabase.from('users').update({ profile: current }).eq('id', userId);

  if (error) {
    throw new Error(`Не удалось обновить профиль пользователя: ${error.message}`);
  }

  return current;
}

/** Массив блоков в порядке BLOCK_STACK для отображения и отчётов. */
export function profileBlocksInStackOrder(profile) {
  const blocks = profile?.blocks ?? {};
  return BLOCK_IDS.filter((id) => blocks[id]).map((id) => blocks[id]);
}

/** Профиль для formatProfileSummary (совместимость со старым форматом). */
export function profileForSummary(profile) {
  return {
    completed_at: profile.updated_at,
    user_data: profile.user_data ?? {},
    blocks: profileBlocksInStackOrder(profile),
  };
}
