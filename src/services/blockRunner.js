import { askGpt } from '../ai/gptunnel.js';
import { getSystemPrompt } from '../prompts/loadSystemPrompt.js';
import { saveBlockResult, getCompletedBlockSummaries } from '../db/blockResults.js';
import { saveChatMessages } from '../db/chats.js';
import { BLOCK_STACK } from '../scenario/constants.js';

function remainingBlocksAfter(blockIndex) {
  return Math.max(0, BLOCK_STACK.length - blockIndex - 1);
}

function buildOperatorPayload(session, blockIndex, summaries) {
  const block = BLOCK_STACK[blockIndex];
  const data = session.collected_data ?? {};

  return {
    режим: 'lapis_vivus_telegram_operator',
    текущий_блок: block.id,
    название_блока: block.title,
    осталось_блоков_в_стеке: remainingBlocksAfter(blockIndex),
    универсальные_входные_данные: {
      пол: data.gender_label ?? null,
      дата_рождения: data.birth_date ?? null,
      время_рождения: data.birth_time ?? null,
      место_рождения: data.birth_place ?? null,
    },
    внешняя_фактура: {
      бацзы_дамп: data.bazi_dump ?? null,
      астро_дамп: data.astro_dump ?? null,
    },
    завершённые_блоки_кратко: summaries,
    инструкция_исполнения:
      `Выполни СТРОГО И ИСКЛЮЧИТЕЛЬНО БЛОК ${block.id} за этот один ответ. ` +
      'Соблюдай hardware_gate, HERMETIC_METALOG_CHANNELS и OUTPUT_SYNTAX из системного промпта. ' +
      'Не переходи к другим блокам.',
  };
}

/**
 * Запуск одного блока. Системный промпт не покидает сервер.
 */
export async function runAnalysisBlock({ session, chatId, userId }) {
  const blockIndex = session.block_index;
  const block = BLOCK_STACK[blockIndex];

  if (!block) {
    throw new Error('Стек блоков завершён.');
  }

  if (block.externalKey) {
    const dump = session.collected_data?.[block.externalKey];
    if (!dump) {
      throw new Error(`Не загружена внешняя фактура для блока ${block.id}.`);
    }
  }

  const summaries = await getCompletedBlockSummaries(chatId);
  const operatorPayload = buildOperatorPayload(session, blockIndex, summaries);

  const userContent = JSON.stringify(operatorPayload, null, 2);

  const messages = [
    { role: 'system', content: getSystemPrompt() },
    { role: 'user', content: userContent },
  ];

  const answer = await askGpt(messages);

  await saveBlockResult({
    chatId,
    userId,
    blockId: block.id,
    responseText: answer,
  });

  await saveChatMessages(chatId, [
    {
      role: 'user',
      content: `[служебно] запрос блока ${block.id}`,
    },
    { role: 'assistant', content: answer },
  ]);

  return { blockId: block.id, blockTitle: block.title, answer };
}
