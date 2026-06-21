/**
 * Форматирование итогового профиля пользователя
 */

import { letterhead } from '../ui/brand.js';
import { getModuleMeta } from '../ui/modules.js';
import { u } from '../ui/userCopy.js';

export function formatProfileSummary(profile, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';

  if (!profile || !profile.blocks) {
    return u(lang, 'errorLoad');
  }

  const userData = profile.user_data || {};
  const blocks = profile.blocks || [];

  const lines = [
    letterhead(code === 'en' ? 'Session report' : 'Итог сессии', lang),
    '',
    `<b>${code === 'en' ? 'Birth profile' : 'Профиль рождения'}</b>`,
    '',
    `${code === 'en' ? 'Gender' : 'Пол'}\n${userData.gender_label || '—'}`,
    '',
    `${code === 'en' ? 'Birth date' : 'Дата рождения'}\n${userData.birth_date || '—'}`,
    '',
    `${code === 'en' ? 'Birth time' : 'Время рождения'}\n${userData.birth_time || '—'}`,
    '',
    `${code === 'en' ? 'Birth place' : 'Место рождения'}\n${userData.birth_place || '—'}`,
    '',
    `${code === 'en' ? 'Completed' : 'Завершение'}\n${formatDate(profile.completed_at)}`,
    '',
    `<b>${code === 'en' ? 'Completed steps' : 'Пройденные этапы'}</b>`,
    '',
  ];

  blocks.forEach((block, index) => {
    const meta = getModuleMeta(block.block_id, lang);
    lines.push(`${String(index + 1).padStart(2, '0')} · ${meta.title}`);
    lines.push(`   ${formatDate(block.completed_at)}`);

    if (block.json_payload) {
      const summary = extractJsonSummary(block.json_payload, block.block_id);
      if (summary) {
        lines.push(`   ${summary}`);
      }
    }

    lines.push('');
  });

  lines.push(
    `<i>${code === 'en' ? 'Cumulative protocol · only completed steps are saved.' : 'Накопительный протокол · сохраняются только пройденные этапы.'}</i>`,
  );

  return lines.join('\n');
}

function formatDate(isoString) {
  if (!isoString) return '—';

  try {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}.${month}.${year} · ${hours}:${minutes}`;
  } catch {
    return '—';
  }
}

function extractJsonSummary(jsonPayload, blockId) {
  if (!jsonPayload || typeof jsonPayload !== 'object') {
    return null;
  }

  const summaryFields = [];

  switch (blockId) {
    case '1A':
      if (jsonPayload.тип) summaryFields.push(`Тип · ${jsonPayload.тип}`);
      if (jsonPayload.профиль) summaryFields.push(`Профиль · ${jsonPayload.профиль}`);
      break;
    case '1B':
      if (jsonPayload.рабочие_числа) {
        summaryFields.push(`Числа · ${Object.values(jsonPayload.рабочие_числа).join(', ')}`);
      }
      break;
    case '1D':
      if (jsonPayload.кин) summaryFields.push(`Кин · ${jsonPayload.кин}`);
      break;
    default:
      break;
  }

  return summaryFields.length > 0 ? summaryFields.join(' · ') : null;
}
