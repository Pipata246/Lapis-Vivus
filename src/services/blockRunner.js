import { askGpt } from '../ai/gptunnel.js';
import { validateBlockResponse, isDeliverableBlockResponse } from '../ai/validateResponse.js';
import {
  extractJsonFromAnswer,
  extractMetacomments,
  formatBlockForUser,
} from '../ai/formatResponse.js';
import { getSystemPrompt } from '../prompts/loadSystemPrompt.js';
import { saveBlockResult, getCompletedBlocks } from '../db/blockResults.js';
import { saveChatMessages, getChatMessagesForAI } from '../db/chats.js';
import { getBlockFiles } from '../db/files.js';
import {
  BLOCK_STACK,
  BLOCK_IDS,
  SYNTHESIS_BLOCK_INDEX,
  jsonArtifactName,
  getBlockUserTitle,
} from '../scenario/constants.js';
import { buildVisionContentParts } from './telegramFiles.js';
import { compressMessagesForAI } from '../ai/contextMessages.js';

const MIN_AI_INTERVAL_MS = 12_000;
const lastAiCallByUser = new Map();

function remainingBlocksAfter(blockIndex) {
  return Math.max(0, BLOCK_STACK.length - blockIndex - 1);
}

function is3BBlock(blockId) {
  return blockId === '3B' || blockId.startsWith('3B.');
}

function resolveEffectiveFiles(block, chatId, files) {
  if (files.length > 0) return files;
  if (!is3BBlock(block.id)) return files;

  const natalPrefixes = ['3.1', '3.2', '3.3', '3.4', '3'];
  return Promise.all(natalPrefixes.map((id) => getBlockFiles(chatId, id))).then((lists) =>
    lists.flat()
  );
}

function buildBlockMandate(block, blockIndex) {
  const step = blockIndex + 1;
  const total = BLOCK_STACK.length;
  const forbidden = BLOCK_IDS.filter((id) => id !== block.id);
  const remaining = remainingBlocksAfter(blockIndex);

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
    `"remaining_blocks_in_stack": ${remaining}`,
    '',
    '⚠️ ОБЯЗАТЕЛЬНЫЕ ПОЛЯ В JSON (EN snake_case, значения RU):',
    '  • "block_id", "remaining_blocks_in_stack", "four_level_conceptual_output"',
    '  • four_level: biophysical_analysis, cognitive_psychology_analysis, hermetic_alchemy_analysis, non_dual_advaita_analysis',
    '',
    '⛔️ КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО В ЭТОМ ANSWER:',
    `  • Выполнять блоки: ${forbidden.join(', ')}`,
    '  • Создавать JSON-артефакты других блоков',
    '  • Объединять несколько блоков',
    '',
    '✅ ЕДИНСТВЕННЫЙ ДОПУСТИМЫЙ ФОРМАТ ANSWER:',
    '  1. ```json``` с артефактом блока ' + block.id,
    '  2. ПРОФАНСКИЙ КОММЕНТАРИЙ (Что делать / Чего не делать / Соматизация)',
    '',
    '---',
    '',
  ].join('\n');
}

function buildCompletedContext(completedBlocks, blockIndex) {
  const ids = completedBlocks.map((b) => b.block_id);

  if (blockIndex < SYNTHESIS_BLOCK_INDEX) {
    return {
      completed_blocks: ids,
      note: 'Past block texts omitted. Do not repeat or jump to synthesis blocks prematurely.',
    };
  }

  return {
    completed_blocks: completedBlocks.map((row) => ({
      block_id: row.block_id,
      metacomments: extractMetacomments(row.response_text, 3500),
    })),
    note: 'Use only for cross-synthesis of the current block.',
  };
}

function buildOperatorPayload(session, blockIndex, completedBlocks, filesCount) {
  const block = BLOCK_STACK[blockIndex];
  const nextBlock = BLOCK_STACK[blockIndex + 1];
  const data = session.collected_data ?? {};
  const userBlockText = data.block_user_text?.[block.id] || null;

  return {
    mode: 'lapis_vivus_telegram_operator',
    protocol: 'v3.1_EXECUTION_ENGINE',
    server_assigned_block: block.id,
    next_block: nextBlock ? nextBlock.id : 'STACK_COMPLETE',
    next_block_description: nextBlock ? nextBlock.description : 'All blocks completed',
    step: `${blockIndex + 1}/${BLOCK_STACK.length}`,
    fixed_stack_order: BLOCK_IDS,
    current_block: block.id,
    block_task: block.description,
    json_artifact: jsonArtifactName(block.id),
    remaining_blocks_in_stack: remainingBlocksAfter(blockIndex),
    forbidden_blocks_in_this_answer: BLOCK_IDS.filter((id) => id !== block.id),
    request_date: new Date().toISOString().slice(0, 10),
    universal_input: {
      gender: data.gender_label ?? null,
      birth_date: data.birth_date ?? null,
      birth_time: data.birth_time ?? null,
      birth_place: data.birth_place ?? null,
    },
    external_data: {
      block: block.id,
      files_attached: filesCount,
      user_text: userBlockText,
    },
    past_blocks_context: buildCompletedContext(completedBlocks, blockIndex),
    execution_instruction:
      `STRICT: Execute ONLY ${block.description}. ` +
      `JSON artifact: ${jsonArtifactName(block.id)} with remaining_blocks_in_stack=${remainingBlocksAfter(blockIndex)}. ` +
      'Then ПРОФАНСКИЙ КОММЕНТАРИЙ. One block per answer.',
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

  const sessionMessages = compressMessagesForAI(await getChatMessagesForAI(chatId, sessionStartAt));
  const systemPrompt = await getSystemPrompt({ blockId });
  const baseMessages = [
    { role: 'system', content: systemPrompt },
    ...sessionMessages,
    { role: 'user', content: userContent },
  ];

  let answer = await askGpt(baseMessages);
  let validation = validateBlockResponse(answer, blockId);

  if (!validation.deliverable) {
    const retryMessages = [
      ...baseMessages,
      { role: 'assistant', content: answer },
      {
        role: 'user',
        content:
          `⛔️ ОТВЕТ ОТКЛОНЁН: ${validation.issues.join('; ')}\n\n` +
          `Перегенерируй ТОЛЬКО блок ${blockId}: ${BLOCK_STACK[blockIndex].description}\n\n` +
          `ОБЯЗАТЕЛЬНО:\n` +
          `1. \`\`\`json\`\`\` с артефактом ${jsonArtifactName(blockId)}\n` +
          `2. "remaining_blocks_in_stack": ${remainingBlocksAfter(blockIndex)}\n` +
          '3. ПРОФАНСКИЙ КОММЕНТАРИЙ после JSON',
      },
    ];
    answer = await askGpt(retryMessages);
    validation = validateBlockResponse(answer, blockId);
  }

  if (!isDeliverableBlockResponse(answer, blockId)) {
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

  const files = await getBlockFiles(chatId, block.id);
  const effectiveFiles = await resolveEffectiveFiles(block, chatId, files);
  const data = session.collected_data ?? {};
  const userBlockText = data.block_user_text?.[block.id] || null;

  if (block.requiresExternal && effectiveFiles.length === 0 && !userBlockText) {
    throw new Error(
      `Для блока ${block.id} нужен хотя бы один прикреплённый файл или текст с данными.`
    );
  }

  const completedBlocks = await getCompletedBlocks(chatId);
  const operatorPayload = buildOperatorPayload(
    session,
    blockIndex,
    completedBlocks,
    effectiveFiles.length
  );

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

  const userMessage = formatBlockForUser(answer, block.id, blockIndex);

  return { blockId: block.id, blockTitle: getBlockUserTitle(block.id), userMessage };
}
