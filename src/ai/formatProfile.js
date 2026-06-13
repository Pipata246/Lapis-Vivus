/**
 * Форматирование итогового профиля пользователя
 */

import { BRAND, divider } from '../ui/brand.js';

export function formatProfileSummary(profile) {
  if (!profile || !profile.blocks) {
    return 'Профиль не найден.';
  }

  const userData = profile.user_data || {};
  const blocks = profile.blocks || [];

  const lines = [
    `<b>${BRAND.name}</b>`,
    '<i>Итоговый отчёт</i>',
    divider(),
    '<b>Данные клиента</b>',
    `Пол · ${userData.gender_label || '—'}`,
    `Дата рождения · ${userData.birth_date || '—'}`,
    `Время рождения · ${userData.birth_time || '—'}`,
    `Место рождения · ${userData.birth_place || '—'}`,
    `Завершение · ${formatDate(profile.completed_at)}`,
    '',
    divider(),
    '<b>Завершённые этапы</b>',
    '',
  ];

  blocks.forEach((block, index) => {
    lines.push(`${index + 1}. Этап ${block.block_id}`);
    lines.push(`   ${formatDate(block.completed_at)}`);

    if (block.json_payload) {
      const summary = extractJsonSummary(block.json_payload, block.block_id);
      if (summary) {
        lines.push(`   ${summary}`);
      }
    }

    lines.push('');
  });

  lines.push(divider());
  lines.push('<i>Анализ завершён полностью</i>');

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

    return `${day}.${month}.${year} ${hours}:${minutes}`;
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
        const nums = jsonPayload.рабочие_числа;
        summaryFields.push(`Числа · ${Object.values(nums).join(', ')}`);
      }
      break;

    case '1C':
      if (jsonPayload.чакральный_баланс) {
        summaryFields.push(`Баланс · ${jsonPayload.чакральный_баланс}`);
      }
      break;

    case '1D':
      if (jsonPayload.кин) summaryFields.push(`Кин · ${jsonPayload.кин}`);
      if (jsonPayload.печать) summaryFields.push(`Печать · ${jsonPayload.печать}`);
      if (jsonPayload.тон) summaryFields.push(`Тон · ${jsonPayload.тон}`);
      break;

    case '1E':
      if (jsonPayload.травматические_зоны) {
        summaryFields.push(`Зоны · ${jsonPayload.травматические_зоны}`);
      }
      break;

    case '2A':
      if (jsonPayload.элемент_личности) {
        summaryFields.push(`Элемент · ${jsonPayload.элемент_личности}`);
      }
      break;

    case '2B':
      if (jsonPayload.лагна) summaryFields.push(`Лагна · ${jsonPayload.лагна}`);
      if (jsonPayload.атмакарака) summaryFields.push(`Атмакарака · ${jsonPayload.атмакарака}`);
      break;

    case '3B':
      if (jsonPayload.текущая_фаза) {
        summaryFields.push(`Фаза · ${jsonPayload.текущая_фаза}`);
      }
      break;

    case '3C':
      if (jsonPayload.ключевые_мидпоинты) {
        summaryFields.push(`Мидпоинты · ${jsonPayload.ключевые_мидпоинты}`);
      }
      break;

    case '4':
      if (jsonPayload.синтез_статус) {
        summaryFields.push(`Статус · ${jsonPayload.синтез_статус}`);
      }
      break;

    case '5A':
      if (jsonPayload.протокол_статус) {
        summaryFields.push(`Протокол · ${jsonPayload.протокол_статус}`);
      }
      break;

    case '5B':
      if (jsonPayload.практики_назначены) {
        summaryFields.push(`Практики · ${jsonPayload.практики_назначены}`);
      }
      break;

    default:
      break;
  }

  return summaryFields.length > 0 ? summaryFields.join(' · ') : null;
}
