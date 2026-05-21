import { askGpt } from '../ai/gptunnel.js';
import { validateBlockResponse } from '../ai/validateResponse.js';
import { extractJsonFromAnswer, formatBlockForUser } from '../ai/formatResponse.js';
import { getSystemPrompt } from '../prompts/loadSystemPrompt.js';
import { saveBlockResult, getCompletedBlocks } from '../db/blockResults.js';
import { saveChatMessages } from '../db/chats.js';
import { BLOCK_STACK } from '../scenario/constants.js';
import { buildVisionContentParts } from './telegramFiles.js';

const MIN_AI_INTERVAL_MS = 12_000;
const lastAiCallByUser = new Map();

function remainingBlocksAfter(blockIndex) {
  return Math.max(0, BLOCK_STACK.length - blockIndex - 1);
}

function getPhotoFileIds(block, data) {
  if (block.id === '2') {
    return data.bazi_photo_ids ?? [];
  }
  if (block.id === '3' || block.id === '3B') {
    return data.astro_photo_ids ?? [];
  }
  return [];
}

function buildOperatorPayload(session, blockIndex, completedBlocks) {
  const block = BLOCK_STACK[blockIndex];
  const data = session.collected_data ?? {};

  return {
    режим: 'lapis_vivus_telegram_operator',
    протокол: 'v21.0',
    текущий_блок: block.id,
    название_блока: block.title,
    осталось_блоков_в_стеке: remainingBlocksAfter(blockIndex),
    дата_запроса: new Date().toISOString().slice(0, 10),
    универсальные_входные_данные: {
      пол: data.gender_label ?? null,
      дата_рождения: data.birth_date ?? null,
      время_рождения: data.birth_time ?? null,
      место_рождения: data.birth_place ?? null,
    },
    внешняя_фактура: {
      бацзы_дамп: data.bazi_dump ?? null,
      астро_дамп: data.astro_dump ?? null,
      скриншоты_бацзы: (data.bazi_photo_ids ?? []).length,
      скриншоты_астро: (data.astro_photo_ids ?? []).length,
    },
    завершённые_блоки: completedBlocks,
    инструкция_исполнения:
      `Выполни СТРОГО И ИСКЛЮЧИТЕЛЬНО БЛОК ${block.id} за этот один answer. ` +
      'Соблюдай hardware_gate, HERMETIC_METALOG_CHANNELS (пятиуровневый синтез, v21.0) и OUTPUT_SYNTAX. ' +
      'Обязательно: ```json ... ``` как блок_[X]_инвариантСтрогийЗапуск_v21.0.json (кириллица, "осталось_блоков_в_стеке"), ' +
      'затем ## Метакомментарии_Блока (Уровень_1…Уровень_5, включая ГЕРМЕТИЧЕСКИЙ ОПЕРАТОР). ' +
      'JSON — для сервера; оператору в интерфейсе показываются только метакомментарии. ' +
      'Не переходи к другим блокам.',
  };
}

function enforceRateLimit(userId) {
  const now = Date.now();
  const last = lastAiCallByUser.get(userId) ?? 0;
  if (now - last < MIN_AI_INTERVAL_MS) {
    throw new Error('Слишком частые запросы. Подожди 12 секунд.');
  }
  lastAiCallByUser.set(userId, now);
}

async function callModelWithValidation(operatorPayload, photoFileIds) {
  const userText = JSON.stringify(operatorPayload, null, 2);
  const useVision = photoFileIds.length > 0;
  const userContent = useVision
    ? await buildVisionContentParts(userText, photoFileIds)
    : userText;

  const baseMessages = [
    { role: 'system', content: getSystemPrompt() },
    { role: 'user', content: userContent },
  ];

  let answer = await askGpt(baseMessages);
  let validation = validateBlockResponse(answer);

  if (!validation.ok) {
    const retryMessages = [
      ...baseMessages,
      { role: 'assistant', content: answer },
      {
        role: 'user',
        content:
          'Ответ не соответствует OUTPUT_SYNTAX v21.0. Перегенерируй блок: ```json``` (инвариантСтрогийЗапуск_v21.0.json), "осталось_блоков_в_стеке", ## Метакомментарии_Блока с Уровень_1…Уровень_5 (включая ГЕРМЕТИЧЕСКИЙ ОПЕРАТОР). Один блок.',
      },
    ];
    answer = await askGpt(retryMessages);
    validation = validateBlockResponse(answer);
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

  const data = session.collected_data ?? {};

  if (block.externalKey) {
    const dump = data[block.externalKey];
    const photos = getPhotoFileIds(block, data);
    if (!dump && photos.length === 0) {
      throw new Error(`Не загружена внешняя фактура для блока ${block.id}.`);
    }
  }

  const completedBlocks = await getCompletedBlocks(chatId);
  const operatorPayload = buildOperatorPayload(session, blockIndex, completedBlocks);
  const photoFileIds = getPhotoFileIds(block, data);

  const answer = await callModelWithValidation(operatorPayload, photoFileIds);
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
