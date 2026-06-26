/**
 * HTTP-клиент для Python compute-сервиса на VPS (Human Design, цифровые матрицы).
 */

import { loadComputeConfig } from '../config.js';

/** Блоки прогона с детерминированным расчётом на сервере до вызова ИИ */
export const SERVER_COMPUTE_BLOCKS = new Set(['1A', '1B']);

const COMPUTE_TIMEOUT_MS = 60_000;

/**
 * @param {Record<string, unknown>} collectedData
 * @returns {{ day: number, month: number, year: number, hour: number, minute: number, city: string, gender?: string } | null}
 */
export function parseBirthProfile(collectedData) {
  if (!collectedData) return null;

  const dateRaw = collectedData.birth_date;
  const timeRaw = collectedData.birth_time;
  const placeRaw = collectedData.birth_place;

  if (typeof dateRaw !== 'string' || typeof timeRaw !== 'string' || typeof placeRaw !== 'string') {
    return null;
  }

  const dateMatch = dateRaw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const timeMatch = timeRaw.trim().match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) return null;

  const city = placeRaw.trim();
  if (!city) return null;

  return {
    day: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    year: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    city,
    gender: collectedData.gender_label ?? collectedData.gender ?? undefined,
  };
}

/**
 * @param {string} blockId
 * @param {Record<string, unknown>} collectedData
 * @returns {Promise<object|null>}
 */
export async function fetchPrecomputedForBlock(blockId, collectedData) {
  if (!SERVER_COMPUTE_BLOCKS.has(blockId)) {
    return null;
  }

  const cfg = loadComputeConfig();
  if (!cfg.enabled) {
    console.warn(`[compute] COMPUTE_API_URL не задан — блок ${blockId} без серверного расчёта`);
    return null;
  }

  const profile = parseBirthProfile(collectedData);
  if (!profile) {
    throw new Error(
      `Для блока ${blockId} нужны точные дата, время (ЧЧ:ММ) и место рождения из анкеты.`,
    );
  }

  return fetchBlockCompute(blockId, profile);
}

/** Профиль партнёра из полей partner_* в collected_data. */
export function parsePartnerBirthProfile(collectedData) {
  if (!collectedData) return null;
  return parseBirthProfile({
    birth_date: collectedData.partner_birth_date,
    birth_time: collectedData.partner_birth_time,
    birth_place: collectedData.partner_birth_place,
    gender: collectedData.partner_gender,
    gender_label: collectedData.partner_gender_label,
  });
}

export async function fetchPrecomputedPairForBlock(blockId, collectedData) {
  if (!SERVER_COMPUTE_BLOCKS.has(blockId)) {
    return null;
  }

  const subject = await fetchPrecomputedForBlock(blockId, collectedData);
  const partnerProfile = parsePartnerBirthProfile(collectedData);
  if (!partnerProfile) {
    throw new Error('Для сравнения нужны полные данные рождения партнёра.');
  }

  const cfg = loadComputeConfig();
  if (!cfg.enabled) {
    return subject ? { subject, partner: null } : null;
  }

  const partner = await fetchBlockCompute(blockId, partnerProfile);
  return { subject, partner };
}

function birthRequestBody(blockId, profile) {
  return {
    block_id: blockId,
    birth_date: `${String(profile.day).padStart(2, '0')}.${String(profile.month).padStart(2, '0')}.${profile.year}`,
    birth_time: `${String(profile.hour).padStart(2, '0')}:${String(profile.minute).padStart(2, '0')}`,
    birth_place: profile.city,
    gender: profile.gender ?? null,
  };
}

async function fetchBlockCompute(blockId, profile) {
  const cfg = loadComputeConfig();
  const endpoint = blockId === '1B' ? '/v1/compute/genesis' : '/v1/compute/human-design';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMPUTE_TIMEOUT_MS);

  try {
    const response = await fetch(`${cfg.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(birthRequestBody(blockId, profile)),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail =
        typeof payload.detail === 'string'
          ? payload.detail
          : JSON.stringify(payload.detail ?? payload);
      throw new Error(`Compute-сервис ${response.status}: ${detail}`);
    }

    if (!payload.ok || !payload.data) {
      throw new Error('Compute-сервис вернул пустой ответ');
    }

    console.info(`[compute] Блок ${blockId}: расчёт получен (${payload.data.engine})`);
    return payload.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Compute-сервис не ответил за 60 секунд. Проверьте VPS.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated используйте fetchBlockCompute */
async function fetchHumanDesign(blockId, profile) {
  return fetchBlockCompute(blockId, profile);
}

export { fetchHumanDesign };
