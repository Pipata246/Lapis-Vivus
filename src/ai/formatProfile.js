/**
 * Форматирование итогового профиля пользователя
 */

import { letterhead } from '../ui/brand.js';

export function formatProfileSummary(profile) {
  if (!profile || !profile.blocks) {
    return 'Профиль не найден.';
  }

  const userData = profile.user_data || {};
  const blocks = profile.blocks || [];

  const lines = [
    letterhead('Итоговый отчёт'),
    '',
    '<b>Данные клиента</b>',
    '',
    `Пол\n${userData.gender_label || '—'}`,
    '',
    `Дата рождения\n${userData.birth_date || '—'}`,
    '',
    `Время рождения\n${userData.birth_time || '—'}`,
    '',
    `Место рождения\n${userData.birth_place || '—'}`,
    '',
    `Завершение\n${formatDate(profile.completed_at)}`,
    '',
    '<b>Пройденные модули</b>',
    '',
  ];

  blocks.forEach((block, index) => {
    lines.push(`${String(index + 1).padStart(2, '0')} · Module ${block.block_id}`);
    lines.push(`   ${formatDate(block.completed_at)}`);

    if (block.json_payload) {
      const summary = extractJsonSummary(block.json_payload, block.block_id);
      if (summary) {
        lines.push(`   ${summary}`);
      }
    }

    lines.push('');
  });

  lines.push('<i>Накопительный протокол · обновляются только пройденные модули.</i>');

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

  if (jsonPayload.осталось_блоков_в_стеке !== undefined) {
    summaryFields.push(`Осталось · ${jsonPayload.осталось_блоков_в_стеке}`);
  }

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
