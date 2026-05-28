/**
 * Форматирование итогового профиля пользователя в читаемый текст
 */

export function formatProfileSummary(profile) {
  if (!profile || !profile.blocks) {
    return '❌ Профиль не найден.';
  }

  const userData = profile.user_data || {};
  const blocks = profile.blocks || [];

  const lines = [
    '═══════════════════════════════════',
    '📊 ИТОГОВЫЙ ПРОФИЛЬ АНАЛИЗА',
    '═══════════════════════════════════',
    '',
    '👤 ДАННЫЕ ОПЕРАТОРА:',
    `• Пол: ${userData.gender_label || '—'}`,
    `• Дата рождения: ${userData.birth_date || '—'}`,
    `• Время рождения: ${userData.birth_time || '—'}`,
    `• Место рождения: ${userData.birth_place || '—'}`,
    `• Дата завершения анализа: ${formatDate(profile.completed_at)}`,
    '',
    '═══════════════════════════════════',
    '📦 ЗАВЕРШЁННЫЕ БЛОКИ:',
    '═══════════════════════════════════',
    '',
  ];

  blocks.forEach((block, index) => {
    lines.push(`${index + 1}. БЛОК ${block.block_id}`);
    lines.push(`   Завершён: ${formatDate(block.completed_at)}`);
    
    if (block.json_payload) {
      const summary = extractJsonSummary(block.json_payload, block.block_id);
      if (summary) {
        lines.push(`   ${summary}`);
      }
    }
    
    lines.push('');
  });

  lines.push('═══════════════════════════════════');
  lines.push('✅ Анализ завершён полностью');
  lines.push('═══════════════════════════════════');

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

  // Извлекаем ключевые поля из JSON в зависимости от блока
  const summaryFields = [];

  // Общие поля
  if (jsonPayload.осталось_блоков_в_стеке !== undefined) {
    summaryFields.push(`Осталось блоков: ${jsonPayload.осталось_блоков_в_стеке}`);
  }

  // Специфичные поля для разных блоков
  switch (blockId) {
    case '1A':
      if (jsonPayload.тип) summaryFields.push(`Тип: ${jsonPayload.тип}`);
      if (jsonPayload.профиль) summaryFields.push(`Профиль: ${jsonPayload.профиль}`);
      break;
    
    case '1B':
      if (jsonPayload.рабочие_числа) {
        const nums = jsonPayload.рабочие_числа;
        summaryFields.push(`Числа: ${Object.values(nums).join(', ')}`);
      }
      break;
    
    case '1C':
      if (jsonPayload.ведущий_аркан) {
        summaryFields.push(`Ведущий аркан: ${jsonPayload.ведущий_аркан}`);
      }
      break;
    
    case '1D':
      if (jsonPayload.кин) summaryFields.push(`Кин: ${jsonPayload.кин}`);
      if (jsonPayload.печать) summaryFields.push(`Печать: ${jsonPayload.печать}`);
      if (jsonPayload.тон) summaryFields.push(`Тон: ${jsonPayload.тон}`);
      break;
    
    case '2':
      if (jsonPayload.элемент_личности) {
        summaryFields.push(`Элемент личности: ${jsonPayload.элемент_личности}`);
      }
      break;
    
    case '3':
      if (jsonPayload.солнце_знак) {
        summaryFields.push(`Солнце: ${jsonPayload.солнце_знак}`);
      }
      if (jsonPayload.луна_знак) {
        summaryFields.push(`Луна: ${jsonPayload.луна_знак}`);
      }
      if (jsonPayload.асцендент) {
        summaryFields.push(`ASC: ${jsonPayload.асцендент}`);
      }
      break;
    
    case '3B':
      if (jsonPayload.текущая_фаза) {
        summaryFields.push(`Фаза: ${jsonPayload.текущая_фаза}`);
      }
      break;
    
    case '4':
      if (jsonPayload.синтез_статус) {
        summaryFields.push(`Статус: ${jsonPayload.синтез_статус}`);
      }
      break;
    
    case '4B':
      if (jsonPayload.индекс_рабства) {
        summaryFields.push(`Индекс рабства: ${jsonPayload.индекс_рабства}`);
      }
      break;
    
    case '5':
      if (jsonPayload.протокол_статус) {
        summaryFields.push(`Протокол: ${jsonPayload.протокол_статус}`);
      }
      break;
  }

  return summaryFields.length > 0 ? summaryFields.join(' | ') : null;
}
