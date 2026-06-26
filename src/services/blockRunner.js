import { askGpt } from '../ai/gptunnel.js';
import { validateBlockResponse, isDeliverableBlockResponse } from '../ai/validateResponse.js';
import {
  extractJsonFromAnswer,
  extractMetacomments,
  formatBlockForUser,
} from '../ai/formatResponse.js';
import { getSystemPrompt } from '../prompts/loadSystemPrompt.js';
import { saveBlockResult, getCompletedBlocksForSession } from '../db/blockResults.js';
import { mergeBlockIntoUserProfile } from '../db/userAnalysisProfile.js';
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
import { fetchPrecomputedForBlock, fetchPrecomputedPairForBlock, SERVER_COMPUTE_BLOCKS } from './computeClient.js';
import { u } from '../ui/userCopy.js';
import { formatCompareForUser, buildCompareExecutionInstruction } from '../scenario/compareFlow.js';

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

function buildBlockMandate(block, blockIndex, precomputed = null) {
  const step = blockIndex + 1;
  const total = BLOCK_STACK.length;
  const forbidden = BLOCK_IDS.filter((id) => id !== block.id);
  const remaining = remainingBlocksAfter(blockIndex);

  let precomputedSection = '';
  if (precomputed && block.id === '1A') {
    precomputedSection =
      precomputed.subject && precomputed.partner
        ? [
            '',
            '🧬 СЕРВЕРНЫЙ РАСЧЁТ HUMAN DESIGN ДЛЯ ПАРЫ УЖЕ ВЫПОЛНЕН',
            '⛔️ ЗАПРЕЩЕНО пересчитывать — используй precomputed.subject и precomputed.partner',
            '',
          ].join('\n')
        : [
            '',
            '🧬 СЕРВЕРНЫЙ РАСЧЁТ HUMAN DESIGN УЖЕ ВЫПОЛНЕН (Swiss Ephemeris / VPS)',
            '⛔️ ЗАПРЕЩЕНО пересчитывать тип, профиль, ворота, каналы, центры, крест',
            '✅ Используй precomputed.bodygraph.tropical как единственный источник фактуры',
            '✅ Твоя задача — интерпретация по протоколу блока 1A и four_level_conceptual_output',
            '',
          ].join('\n');
  } else if (precomputed && block.id === '1B') {
    precomputedSection = [
      '',
      '🧮 СЕРВЕРНЫЙ РАСЧЁТ ЦИФРОВЫХ МАТРИЦ И СТЕНТОВ УЖЕ ВЫПОЛНЕН (VPS)',
      '⛔️ ЗАПРЕЩЕНО пересчитывать Пифагор, Ладини, стенты, TSP-тензор',
      '✅ Используй precomputed.monolith как единственный источник фактуры:',
      '   • block_1b_pythagoras_data',
      '   • block_1b_ladini_monolith',
      '   • cross_system_stent_matrix',
      '   • block_1a_rave_data (для кросс-стыковки, не пересчитывать)',
      '✅ Твоя задача — интерпретация по протоколу блока 1B и four_level_conceptual_output',
      '',
    ].join('\n');
  }

  return [
    '═══════════════════════════════════════════════════════════════',
    '⚠️ АБСОЛЮТНАЯ КОМАНДА ОПЕРАТОРА (сервер жёстко фиксирует шаг)',
    '═══════════════════════════════════════════════════════════════',
    '',
    precomputedSection,
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

function buildOperatorPayload(session, blockIndex, completedBlocks, filesCount, precomputed = null) {
  const block = BLOCK_STACK[blockIndex];
  const nextBlock = BLOCK_STACK[blockIndex + 1];
  const data = session.collected_data ?? {};
  const userBlockText = data.block_user_text?.[block.id] || null;
  const targeted = data.session_mode === 'targeted';
  const remaining = targeted ? 0 : remainingBlocksAfter(blockIndex);

  const payload = {
    mode: 'lapis_vivus_telegram_operator',
    protocol: 'v3.1_EXECUTION_ENGINE',
    server_assigned_block: block.id,
    next_block: targeted || !nextBlock ? 'STACK_COMPLETE' : nextBlock.id,
    next_block_description: targeted || !nextBlock ? 'Targeted session complete after this block' : nextBlock.description,
    step: targeted ? `1/1` : `${blockIndex + 1}/${BLOCK_STACK.length}`,
    fixed_stack_order: BLOCK_IDS,
    current_block: block.id,
    block_task: block.description,
    json_artifact: jsonArtifactName(block.id),
    remaining_blocks_in_stack: remaining,
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
      precomputed && block.id === '1A'
        ? `STRICT: Block 1A — Human Design already computed on server. ` +
          `Use precomputed.bodygraph ONLY. Do NOT recalculate astronomy. ` +
          `Produce JSON artifact ${jsonArtifactName(block.id)} with remaining_blocks_in_stack=${remaining}. ` +
          'Then ПРОФАНСКИЙ КОММЕНТАРИЙ. One block per answer.'
        : precomputed && block.id === '1B'
          ? `STRICT: Block 1B — digital matrices and stent tensor already computed on server. ` +
            `Use precomputed.monolith ONLY. Do NOT recalculate Pythagoras, Ladini or cross-system stents. ` +
            `Produce JSON artifact ${jsonArtifactName(block.id)} with remaining_blocks_in_stack=${remaining}. ` +
            'Then ПРОФАНСКИЙ КОММЕНТАРИЙ. One block per answer.'
          : `STRICT: Execute ONLY ${block.description}. ` +
            `JSON artifact: ${jsonArtifactName(block.id)} with remaining_blocks_in_stack=${remaining}. ` +
            'Then ПРОФАНСКИЙ КОММЕНТАРИЙ. One block per answer.',
  };

  if (precomputed) {
    payload.precomputed = precomputed;
    payload.compute_source = 'lapis_vps_python';
  }

  if (data.session_mode === 'targeted' && data.target_block_id) {
    payload.user_goal = {
      session_mode: 'targeted',
      target_block_id: data.target_block_id,
      block_variant: data.block_variant ?? null,
      goal_path: data.goal_path ?? [],
      goal_leaf_label: data.goal_leaf_label ?? null,
      goal_maslow: data.goal_maslow ?? null,
      compare_mode: Boolean(data.compare_mode),
      compare_context: data.compare_context ?? null,
      compare_context_label: data.compare_context_label ?? null,
      compare_context_custom: data.compare_context_custom ?? null,
    };
  }

  if (data.compare_mode && data.partner_birth_date) {
    payload.paired_composite_mode = true;
    payload.partner_input = {
      name: data.partner_name ?? null,
      gender: data.partner_gender_label ?? data.partner_gender ?? null,
      birth_date: data.partner_birth_date ?? null,
      birth_time: data.partner_birth_time ?? null,
      birth_place: data.partner_birth_place ?? null,
    };
    const ctxLabel = data.compare_context_label ?? data.goal_leaf_label ?? 'pair';
    payload.execution_instruction = buildCompareExecutionInstruction(
      block.id,
      ctxLabel,
      remaining,
      jsonArtifactName(block.id),
    );
  }

  return payload;
}

function buildUserMessage(mandate, operatorPayload) {
  return `${mandate}${JSON.stringify(operatorPayload, null, 2)}`;
}

function enforceRateLimit(userId) {
  const now = Date.now();
  const last = lastAiCallByUser.get(userId) ?? 0;
  if (now - last < MIN_AI_INTERVAL_MS) {
    throw new Error(u('ru', 'errorRateLimit'));
  }
  lastAiCallByUser.set(userId, now);
}

async function callModelWithValidation(operatorPayload, files, blockId, chatId, sessionStartAt, precomputed = null) {
  const blockIndex = BLOCK_STACK.findIndex((b) => b.id === blockId);
  const mandate = buildBlockMandate(BLOCK_STACK[blockIndex], blockIndex, precomputed);
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
    throw new Error(u('ru', 'errorStage'));
  }

  return answer;
}

export async function runAnalysisBlock({ session, chatId, userId, lang = 'ru' }) {
  enforceRateLimit(userId);

  const blockIndex = session.block_index;
  const block = BLOCK_STACK[blockIndex];

  if (!block) {
    throw new Error(u('ru', 'cycleComplete'));
  }

  const files = await getBlockFiles(chatId, block.id);
  const effectiveFiles = await resolveEffectiveFiles(block, chatId, files);
  const data = session.collected_data ?? {};
  const userBlockText = data.block_user_text?.[block.id] || null;

  const needsServerCompute = SERVER_COMPUTE_BLOCKS.has(block.id);
  let precomputed = null;

  if (needsServerCompute) {
    if (data.compare_mode) {
      precomputed = await fetchPrecomputedPairForBlock(block.id, data);
    } else {
      precomputed = await fetchPrecomputedForBlock(block.id, data);
    }
    if (!precomputed) {
      throw new Error(u('ru', 'errorStage'));
    }
  }

  if (block.requiresExternal && !data.compare_mode && effectiveFiles.length === 0 && !userBlockText && !precomputed) {
    throw new Error(u('ru', 'errorFileRequired'));
  }

  const completedBlocks = await getCompletedBlocksForSession(chatId, session.session_start_at);
  const operatorPayload = buildOperatorPayload(
    session,
    blockIndex,
    completedBlocks,
    effectiveFiles.length,
    precomputed,
  );

  const answer = await callModelWithValidation(
    operatorPayload,
    effectiveFiles,
    block.id,
    chatId,
    session.session_start_at,
    precomputed,
  );
  const { jsonRaw, jsonParsed } = extractJsonFromAnswer(answer);

  try {
    await saveBlockResult({
      chatId,
      userId,
      blockId: block.id,
      responseText: answer,
      jsonPayload: jsonParsed ?? (jsonRaw ? { raw: jsonRaw } : null),
    });
  } catch (err) {
    console.error('[block] save result:', err.message);
    if (!data.compare_mode) {
      throw err;
    }
  }

  if (!data.compare_mode) {
    try {
      await mergeBlockIntoUserProfile(userId, {
        blockId: block.id,
        jsonPayload: jsonParsed ?? (jsonRaw ? { raw: jsonRaw } : null),
        responseText: answer,
        userData: session.collected_data,
      });
    } catch (err) {
      console.error('[profile] merge block failed:', err.message);
    }
  }

  await saveChatMessages(chatId, [
    { role: 'user', content: `[служебно] запрос блока ${block.id}` },
    { role: 'assistant', content: answer },
  ]).catch((err) => {
    console.error('[block] save messages:', err.message);
    if (!data.compare_mode) throw err;
  });

  const userMessage = data.compare_mode
    ? formatCompareForUser(answer, lang)
    : formatBlockForUser(answer, block.id, blockIndex, lang);

  return {
    blockId: block.id,
    blockTitle: getBlockUserTitle(block.id),
    userMessage,
    responseText: answer,
    jsonPayload: jsonParsed ?? (jsonRaw ? { raw: jsonRaw } : null),
  };
}
