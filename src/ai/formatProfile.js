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
    summaryFields.push(`Осталось: ${jsonPayload.осталось_блоков_в_стеке}`);
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
      if (jsonPayload.чакральный_баланс) {
        summaryFields.push(`Баланс: ${jsonPayload.чакральный_баланс}`);
      }
      break;
    
    case '1D':
      if (jsonPayload.кин) summaryFields.push(`Кин: ${jsonPayload.кин}`);
      if (jsonPayload.печать) summaryFields.push(`Печать: ${jsonPayload.печать}`);
      if (jsonPayload.тон) summaryFields.push(`Тон: ${jsonPayload.тон}`);
      break;
    
    case '1E':
      if (jsonPayload.травматические_зоны) {
        summaryFields.push(`Зоны: ${jsonPayload.травматические_зоны}`);
      }
      break;
    
    case '2A':
      if (jsonPayload.элемент_личности) {
        summaryFields.push(`Элемент: ${jsonPayload.элемент_личности}`);
      }
      break;
    
    case '2B':
      if (jsonPayload.лагна) summaryFields.push(`Лагна: ${jsonPayload.лагна}`);
      if (jsonPayload.атмакарака) summaryFields.push(`Атмакарака: ${jsonPayload.атмакарака}`);
      break;
    
    case '2C':
      if (jsonPayload.солнце_гексаграмма) {
        summaryFields.push(`Солнце: ${jsonPayload.солнце_гексаграмма}`);
      }
      break;
    
    case '2D':
      if (jsonPayload.инкарнационный_крест) {
        summaryFields.push(`Крест: ${jsonPayload.инкарнационный_крест}`);
      }
      break;
    
    case '2E':
      if (jsonPayload.тип_питания) {
        summaryFields.push(`Питание: ${jsonPayload.тип_питания}`);
      }
      break;
    
    case '2F':
      if (jsonPayload.лилит_позиция) {
        summaryFields.push(`Лилит: ${jsonPayload.лилит_позиция}`);
      }
      break;
    
    // Зодиакальные реторты
    case '3_ARES':
    case '3_TAURUS':
    case '3_GEMINI':
    case '3_CANCER':
    case '3_LEO':
    case '3_VIRGO':
    case '3_LIBRA':
    case '3_SCORPIO':
    case '3_SAGITTARIUS':
    case '3_CAPRICORN':
    case '3_AQUARIUS':
    case '3_PISCES':
      if (jsonPayload.планеты_в_знаке) {
        summaryFields.push(`Планеты: ${jsonPayload.планеты_в_знаке}`);
      }
      if (jsonPayload.алхимическая_фаза) {
        summaryFields.push(`Фаза: ${jsonPayload.алхимическая_фаза}`);
      }
      break;
    
    case '3B':
      if (jsonPayload.текущая_фаза) {
        summaryFields.push(`Фаза: ${jsonPayload.текущая_фаза}`);
      }
      break;
    
    case '3C':
      if (jsonPayload.ключевые_мидпоинты) {
        summaryFields.push(`Мидпоинты: ${jsonPayload.ключевые_мидпоинты}`);
      }
      break;
    
    case '4':
      if (jsonPayload.синтез_статус) {
        summaryFields.push(`Статус: ${jsonPayload.синтез_статус}`);
      }
      break;
    
    case '4A':
      if (jsonPayload.интеграция_уровень) {
        summaryFields.push(`Уровень: ${jsonPayload.интеграция_уровень}`);
      }
      break;
    
    case '4B':
      if (jsonPayload.индекс_рабства) {
        summaryFields.push(`Индекс: ${jsonPayload.индекс_рабства}`);
      }
      break;
    
    case '4C':
      if (jsonPayload.точка_катализации) {
        summaryFields.push(`Точка: ${jsonPayload.точка_катализации}`);
      }
      break;
    
    case '4D':
      if (jsonPayload.сверхманифест_статус) {
        summaryFields.push(`Статус: ${jsonPayload.сверхманифест_статус}`);
      }
      break;
    
    case '5A':
      if (jsonPayload.протокол_статус) {
        summaryFields.push(`Протокол: ${jsonPayload.протокол_статус}`);
      }
      break;
    
    case '5B':
      if (jsonPayload.практики_назначены) {
        summaryFields.push(`Практики: ${jsonPayload.практики_назначены}`);
      }
      break;
  }

  return summaryFields.length > 0 ? summaryFields.join(' | ') : null;
}
