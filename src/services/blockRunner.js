import { askGpt } from '../ai/gptunnel.js';
import { validateBlockResponse } from '../ai/validateResponse.js';
import { extractJsonFromAnswer, extractMetacomments, formatBlockForUser } from '../ai/formatResponse.js';
import { getSystemPrompt } from '../prompts/loadSystemPrompt.js';
import { saveBlockResult, getCompletedBlocks } from '../db/blockResults.js';
import { saveChatMessages, getChatMessagesForAI } from '../db/chats.js';
import { getBlockFiles } from '../db/files.js';
import {
  BLOCK_STACK,
  BLOCK_IDS,
  SYNTHESIS_BLOCK_INDEX,
  jsonArtifactName,
} from '../scenario/constants.js';
import { buildVisionContentParts } from './telegramFiles.js';

const MIN_AI_INTERVAL_MS = 12_000;
const lastAiCallByUser = new Map();

function remainingBlocksAfter(blockIndex) {
  return Math.max(0, BLOCK_STACK.length - blockIndex - 1);
}

function buildBlockMandate(block, blockIndex) {
  const step = blockIndex + 1;
  const total = BLOCK_STACK.length;
  const forbidden = BLOCK_IDS.filter((id) => id !== block.id);

  return [
    '═══════════════════════════════════════════════════════════════',
    '⚠️ АБСОЛЮТНАЯ КОМАНДА ОПЕРАТОРА (сервер жёстко фиксирует шаг)',
    '═══════════════════════════════════════════════════════════════',
    '',
    `ШАГ ${step} ИЗ ${total}`,
    `ЕДИНСТВЕННЫЙ АКТИВНЫЙ БЛОК: ${block.id}`,
    '',
    '───────────────────────────────────────────────────────────────',
    `ЗАДАНИЕ: ${block.description}`,
    '───────────────────────────────────────────────────────────────',
    '',
    `JSON-АРТЕФАКТ: ${jsonArtifactName(block.id)}`,
    `"осталось_блоков_в_стеке": ${remainingBlocksAfter(blockIndex)}`,
    '',
    '⛔️ КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО В ЭТОМ ANSWER:',
    `  • Выполнять блоки: ${forbidden.join(', ')}`,
    '  • Создавать JSON-артефакты других блоков',
    '  • Объединять несколько блоков',
    '  • Добавлять контент из других блоков',
    '',
    '✅ ЕДИНСТВЕННЫЙ ДОПУСТИМЫЙ ФОРМАТ ANSWER:',
    '  1. JSON-артефакт блока ' + block.id,
    '  2. Раздел ## Метакомментарии_Блока',
    '  3. БОЛЬШЕ НИЧЕГО',
    '',
    '---',
    '',
  ].join('\n');
}

function buildCompletedContext(completedBlocks, blockIndex) {
  const ids = completedBlocks.map((b) => b.block_id);

  if (blockIndex < SYNTHESIS_BLOCK_INDEX) {
    return {
      сданные_блоки: ids,
      примечание:
        'Полные тексты прошлых блоков намеренно не переданы. Не повторяй их и не переходи к блокам 4/4B/5.',
    };
  }

  return {
    сданные_блоки: completedBlocks.map((row) => ({
      block_id: row.block_id,
      метакомментарии: extractMetacomments(row.response_text, 3500),
    })),
    примечание: 'Используй только для кросс-синтеза текущего блока; не пересчитывай прошлые блоки с нуля.',
  };
}

function buildOperatorPayload(session, blockIndex, completedBlocks, filesCount) {
  const block = BLOCK_STACK[blockIndex];
  const nextBlock = BLOCK_STACK[blockIndex + 1];
  const data = session.collected_data ?? {};

  return {
    режим: 'lapis_vivus_telegram_operator',
    протокол: 'v26.9',
    сервер_назначил_блок: block.id,
    следующий_блок: nextBlock ? nextBlock.id : 'ЗАВЕРШЕНИЕ_СТЕКА',
    следующий_блок_описание: nextBlock ? nextBlock.description : 'Все блоки завершены',
    шаг: `${blockIndex + 1}/${BLOCK_STACK.length}`,
    фиксированный_стек_порядок: BLOCK_IDS,
    текущий_блок: block.id,
    задание_блока: block.description,
    json_артефакт: jsonArtifactName(block.id),
    осталось_блоков_в_стеке: remainingBlocksAfter(blockIndex),
    запрещённые_блоки_в_этом_answer: BLOCK_IDS.filter((id) => id !== block.id),
    дата_запроса: new Date().toISOString().slice(0, 10),
    универсальные_входные_данные: {
      пол: data.gender_label ?? null,
      дата_рождения: data.birth_date ?? null,
      время_рождения: data.birth_time ?? null,
      место_рождения: data.birth_place ?? null,
    },
    внешняя_фактура: {
      блок: block.id,
      файлов_прикреплено: filesCount,
    },
    контекст_прошлых_блоков: buildCompletedContext(completedBlocks, blockIndex),
    инструкция_исполнения:
      `⚠️ СТРОГО: Выполни ТОЛЬКО ${block.description}. ` +
      `JSON: ${jsonArtifactName(block.id)}. ` +
      `Затем ## Метакомментарии_Блока (Уровень_1…Уровень_5). ` +
      `ЗАПРЕЩЕНО выполнять ${nextBlock ? nextBlock.id : 'другие блоки'} в этом answer. ` +
      'Один блок за один answer.',
  };
}

function buildUserMessage(mandate, operatorPayload) {
  return `${mandate}${JSON.stringify(operatorPayload, null, 2)}`;
}

function enforceRateLimit(userId) {
  const now = Date.now();
  const last = lastAiCallByUser.get(userId) ?? 0;
  if (now - last < MIN_AI_INTERVAL_MS) {
    throw new Error('Слишком частые запросы. Подожди 12 секунд.');
  }
  lastAiCallByUser.set(userId, now);
}

async function callModelWithValidation(operatorPayload, files, blockId, chatId, sessionStartAt) {
  const blockIndex = BLOCK_STACK.findIndex((b) => b.id === blockId);
  const mandate = buildBlockMandate(BLOCK_STACK[blockIndex], blockIndex);
  const userText = buildUserMessage(mandate, operatorPayload);

  const useVision = files.length > 0;
  const userContent = useVision
    ? await buildVisionContentParts(userText, files)
    : userText;

  // Получаем только сообщения текущей сессии для контекста ИИ
  const sessionMessages = await getChatMessagesForAI(chatId, sessionStartAt);

  const baseMessages = [
    { role: 'system', content: getSystemPrompt() },
    ...sessionMessages,
    { role: 'user', content: userContent },
  ];

  let answer = await askGpt(baseMessages);
  let validation = validateBlockResponse(answer, blockId);

  if (!validation.ok) {
    const retryMessages = [
      ...baseMessages,
      { role: 'assistant', content: answer },
      {
        role: 'user',
        content:
          `Ответ отклонён (${validation.issues.join('; ')}). ` +
          `Перегенерируй ТОЛЬКО блок ${blockId}: ${BLOCK_STACK[blockIndex].description} ` +
          `JSON: ${jsonArtifactName(blockId)}, "осталось_блоков_в_стеке", ## Метакомментарии_Блока. ` +
          'Не используй заголовки других блоков.',
      },
    ];
    answer = await askGpt(retryMessages);
    validation = validateBlockResponse(answer, blockId);
  }

  if (!validation.ok) {
    throw new Error(`Ответ модели не прошёл проверку: ${validation.issues.join('; ')}`);
  }

  return answer;
}

export async function runAnalysisBlock({ session, chatId, userId }) {
  enforceRateLimit(userId);

  const blockIndex = session.block_index;
  const block = BLOCK_STACK[blockIndex];

  if (!block) {
    throw new Error('Стек блоков завершён.');
  }

  // Получаем файлы из БД
  const files = await getBlockFiles(chatId, block.id);

  // Для блока 3B можно использовать файлы блока 3
  let effectiveFiles = files;
  if (files.length === 0 && block.id === '3B') {
    effectiveFiles = await getBlockFiles(chatId, '3');
  }

  if (block.requiresExternal && effectiveFiles.length === 0) {
    throw new Error(`Для блока ${block.id} нужен хотя бы один прикреплённый файл.`);
  }

  const completedBlocks = await getCompletedBlocks(chatId);
  const operatorPayload = buildOperatorPayload(session, blockIndex, completedBlocks, effectiveFiles.length);

  const answer = await callModelWithValidation(
    operatorPayload,
    effectiveFiles,
    block.id,
    chatId,
    session.session_start_at
  );
  const { jsonRaw, jsonParsed } = extractJsonFromAnswer(answer);

  await saveBlockResult({
    chatId,
    userId,
    blockId: block.id,
    responseText: answer,
    jsonPayload: jsonParsed ?? (jsonRaw ? { raw: jsonRaw } : null),
  });

  await saveChatMessages(chatId, [
    { role: 'user', content: `[служебно] запрос блока ${block.id}` },
    { role: 'assistant', content: answer },
  ]);

  const userMessage = formatBlockForUser(answer, block.id, block.title);

  return { blockId: block.id, blockTitle: block.title, userMessage };
}
