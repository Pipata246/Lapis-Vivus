import {
  BLOCK_STACK,
  STEPS,
  TEXT_INPUT_STEPS,
  CALLBACK_PREFIX,
} from '../scenario/constants.js';
import { rejectText, u, mapErrorToUser } from '../ui/userCopy.js';
import { splitTelegramMessages, splitForTelegramWithKeyboard, TELEGRAM_PARSE_MODE, htmlToPlain, formatFollowUpForTelegram } from '../ai/formatResponse.js';
import { formatProfileSummary } from '../ai/formatProfile.js';
import {
  parseCallbackData,
  validateBirthDate,
  validateBirthTime,
  validateBirthPlace,
  getBlockAttachments,
  getBlockFilesForRun,
  saveBlockAttachment,
  hasRequiredFiles,
  hasAnalysisProgress,
} from '../scenario/validators.js';
import {
  menuKeyboard,
  genderKeyboard,
  birthTimeKeyboard,
  confirmKeyboard,
  nextBlockKeyboard,
  completedKeyboard,
  runningKeyboard,
  blockFailedKeyboard,
  blockPrepKeyboard,
  linksKeyboard,
  textInputKeyboard,
  goalTreeKeyboard,
} from '../scenario/keyboards.js';
import { getOrCreateUserChat } from '../db/chats.js';
import { upsertUserFromTelegram } from '../db/users.js';
import {
  getSession,
  createSessionIfMissing,
  resetSession,
  updateSession,
  upsertSession,
  mergeCollectedData,
  recoverStaleBlockRunning,
} from '../db/sessions.js';
import { saveUserFile, getBlockFiles, deleteAllChatFiles } from '../db/files.js';
import { uploadTelegramFileToStorage, extractTextFromFile } from './fileStorage.js';
import { runAnalysisBlock } from './blockRunner.js';
import { formatCalculatorLinksText, getAllCalculatorLinks } from '../scenario/calculatorLinks.js';
import {
  BRAND,
  btn,
  formatClientProfile,
  formatInitStep,
  formatModulePrep,
  formatSessionComplete,
  formatSessionStart,
  formatWelcome,
  section,
  letterhead,
} from '../ui/brand.js';
import { getCompletedBlocksForSession, saveBlockResult } from '../db/blockResults.js';
import {
  loadUserAnalysisProfile,
  profileForSummary,
  mergeBlockIntoUserProfile,
} from '../db/userAnalysisProfile.js';
import { saveChatMessages, getChatMessagesForAI } from '../db/chats.js';
import {
  TREE_ROOT,
  formatTreeStepMessage,
  formatAfterGoalIntro,
  resolveTreeChoice,
  resolveBlockIndex,
  isTargetedSession,
} from '../scenario/diagnosticTree.js';
import {
  isCompareMode,
  compareGoalKeyboard,
  compareConfirmKeyboard,
  partnerGenderKeyboard,
  partnerTimeKeyboard,
  formatCompareStartScreen,
  formatCompareCustomContextPrompt,
  formatCompareSubjectIntro,
  formatComparePairProfile,
  formatPartnerInitStep,
  compareCompleteKeyboard,
  formatCompareResultHeader,
  subjectProfileFromCollected,
  partnerProfileFromCollected,
  resolveCompareContext,
} from '../scenario/compareFlow.js';
import { saveComparison } from '../db/comparisons.js';

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

function showGoalTree(nodeId, lang) {
  const head = lang === 'en' ? 'Your focus' : 'Ваш запрос';
  return {
    text: [letterhead(head, lang), '', formatTreeStepMessage(nodeId, lang)].join('\n'),
    keyboard: goalTreeKeyboard(nodeId, lang),
  };
}

function reviewKeyboard(session, lang) {
  return nextBlockKeyboard(lang, isTargetedSession(session.collected_data));
}

async function persistSessionData(userId, collectedData) {
  return updateSession(userId, {
    collected_data: collectedData,
    session_mode: collectedData.session_mode ?? 'full',
    target_block_id: collectedData.target_block_id ?? null,
    goal_tree_path: collectedData.goal_path ?? [],
  });
}

async function finalizeAnalysisSession(from, chat, session, lang) {
  await updateSession(from.id, { step: STEPS.COMPLETED });

  let profileSummary = '';
  let lastBlockResult = null;
  try {
    const sessionBlocks = await getCompletedBlocksForSession(chat.id, session.session_start_at);

    for (const block of sessionBlocks) {
      await mergeBlockIntoUserProfile(from.id, {
        blockId: block.block_id,
        jsonPayload: block.json_payload,
        responseText: block.response_text,
        completedAt: block.created_at,
        userData: session.collected_data,
      });
    }

    lastBlockResult = sessionBlocks[sessionBlocks.length - 1] ?? null;

    if (isCompareMode(session.collected_data) && lastBlockResult) {
      const data = session.collected_data ?? {};
      await saveComparison(from.id, {
        subjectData: subjectProfileFromCollected(data),
        partnerData: partnerProfileFromCollected(data),
        goalData: {
          compare_context: data.compare_context,
          compare_context_label: data.compare_context_label,
          compare_context_custom: data.compare_context_custom,
          goal_leaf_label: data.goal_leaf_label,
          block_variant: data.block_variant,
        },
        targetBlockId: data.target_block_id,
        blockVariant: data.block_variant,
        responseText: lastBlockResult.response_text,
        jsonPayload: lastBlockResult.json_payload,
      });
    }

    const mergedProfile = await loadUserAnalysisProfile(from.id);
    profileSummary = formatProfileSummary(profileForSummary(mergedProfile), lang);
  } catch (err) {
    console.error('Ошибка сохранения профиля:', err.message);
    profileSummary =
      lang === 'en'
        ? '<i>Profile saved. Summary temporarily unavailable.</i>'
        : '<i>Профиль сохранён. Итоговый отчёт временно недоступен.</i>';
  }

  const completionMessage = isCompareMode(session.collected_data)
    ? [
        formatSessionComplete(profileSummary, lang),
        '',
        lang === 'en'
          ? '<i>Pair analysis saved to your history.</i>'
          : '<i>Анализ пары сохранён в истории.</i>',
      ].join('\n')
    : formatSessionComplete(profileSummary, lang);
  const messageParts = splitTelegramMessages(completionMessage);

  return {
    text: messageParts[0],
    extraMessages: messageParts.slice(1),
    keyboard: completedKeyboard(lang),
  };
}

function resolveStartBlockIndex(collectedData) {
  if (isTargetedSession(collectedData) && collectedData.target_block_id) {
    return resolveBlockIndex(collectedData.target_block_id);
  }
  return 0;
}

/** Не блокируем ответ пользователю — очистка файлов в фоне */
function scheduleChatFilesCleanup(chatId) {
  deleteAllChatFiles(chatId).catch((err) => {
    console.error('Фоновое удаление файлов чата:', err.message);
  });
}

function genderLabel(value, lang = 'ru') {
  if (lang === 'en') {
    return value === 'male' ? 'Male' : 'Female';
  }
  return value === 'male' ? 'Мужской' : 'Женский';
}

async function resolveLang(from) {
  try {
    const { getUserLanguage } = await import('../db/users.js');
    return await getUserLanguage(from.id);
  } catch {
    return from.language_code?.startsWith('ru') ? 'ru' : 'en';
  }
}

function formatProfile(data, lang = 'ru') {
  return formatClientProfile(data, lang);
}

function currentBlock(session) {
  return BLOCK_STACK[session.block_index];
}

function is3BBlockId(blockId) {
  return blockId === '3B' || blockId.startsWith('3B.');
}

async function getEffectiveBlockFiles(chatId, block) {
  let files = await getBlockFiles(chatId, block.id);
  if (files.length > 0 || !is3BBlockId(block.id)) {
    return files;
  }
  for (const id of ['3.1', '3.2', '3.3', '3.4', '3']) {
    const inherited = await getBlockFiles(chatId, id);
    if (inherited.length > 0) {
      return inherited;
    }
  }
  return files;
}

async function blockPrepText(session, chatId, lang = 'ru') {
  const block = currentBlock(session);
  if (!block) {
    return `<i>${u(lang, 'cycleComplete')}</i>`;
  }

  // Получаем файлы из БД
  let ownFiles = [];
  try {
    ownFiles = await getBlockFiles(chatId, block.id);
  } catch (err) {
    console.error('Ошибка получения файлов:', err.message);
  }

  let inheritedFiles = [];
  if (is3BBlockId(block.id) && ownFiles.length === 0) {
    try {
      inheritedFiles = await getEffectiveBlockFiles(chatId, block);
    } catch (err) {
      console.error('Ошибка получения файлов блока 3:', err.message);
    }
  }

  const code = lang === 'en' ? 'en' : 'ru';
  let fileLine;
  if (ownFiles.length > 0) {
    const fileNames = ownFiles.map((f) => f.file_name || (code === 'en' ? 'File' : 'Файл')).join(', ');
    fileLine =
      code === 'en'
        ? `Attached files · ${ownFiles.length} (${fileNames})`
        : `Прикреплено файлов · ${ownFiles.length} (${fileNames})`;
  } else if (inheritedFiles.length > 0) {
    fileLine =
      code === 'en'
        ? `Using materials from step 3 · ${inheritedFiles.length}. You may add your own.`
        : `Используются материалы этапа 3 · ${inheritedFiles.length}. Можно добавить свои.`;
  } else if (block.requiresExternal) {
    fileLine = u(lang, 'errorFileRequired');
  } else {
    fileLine =
      code === 'en'
        ? 'File or text — if needed for this step.'
        : 'Файл или текст — по необходимости.';
  }

  const userText = session.collected_data?.block_user_text?.[block.id];
  let textLine = null;
  if (userText) {
    const preview = userText.length > 100 ? `${userText.slice(0, 100)}…` : userText;
    textLine =
      code === 'en' ? `Your text · «${preview}»` : `Ваш текст · «${preview}»`;
  }

  const calcBlock = formatCalculatorLinksText(block.id, session.collected_data);

  const materials = [fileLine, textLine].filter(Boolean).join('\n');
  const materialsLabel = code === 'en' ? 'Materials' : 'Материалы';
  const sections = [
    calcBlock || null,
    materials ? section(materialsLabel, materials, '◆') : null,
  ];

  return formatModulePrep(block.id, session.block_index, sections, lang);
}

async function showBlockPrep(session, chatId, lang = 'ru') {
  const block = currentBlock(session);
  const text = await blockPrepText(session, chatId, lang);
  return {
    text,
    keyboard: blockPrepKeyboard(block?.id, session.collected_data),
  };
}

async function ensureSession(from) {
  await upsertUserFromTelegram(from);
  const chat = await getOrCreateUserChat(from.id);
  let session = await getSession(from.id);

  if (!session) {
    session = await createSessionIfMissing(from.id, chat.id);
  }

  const recovered = recoverStaleBlockRunning(session);
  if (recovered.step !== session.step) {
    session = await updateSession(from.id, { step: recovered.step });
  }

  return { chat, session };
}

async function rejectWrongInput(session, hint, userId) {
  let lang = 'en';
  if (userId) {
    try {
      const { getUserLanguage } = await import('../db/users.js');
      lang = await getUserLanguage(userId);
    } catch (err) {
      console.error('Error getting language:', err.message);
    }
  }
  
  if (hasAnalysisProgress(session) && session.step !== STEPS.MENU) {
    const payload = resumePrompt(session, lang);
    
    // Если payload требует async (для меню)
    if (payload._needsAsync) {
      const menu = await showMenu(payload.lang);
      return {
        text: `${hint}\n\n${menu.text}`,
        keyboard: menu.keyboard,
      };
    }
    
    return {
      text: `${hint}\n\n${payload.text}`,
      keyboard: payload.keyboard,
    };
  }
  
  const menu = await showMenu(lang);
  return { text: hint, keyboard: menu.keyboard };
}

export async function initUser(from) {
  const { chat } = await ensureSession(from);
  const { getUserLanguage } = await import('../db/users.js');

  await resetSession(from.id, chat.id);
  scheduleChatFilesCleanup(chat.id);

  const lang = await getUserLanguage(from.id);
  return await showMenu(lang);
}

async function showMenu(lang = 'en') {
  const { getMainMenuKeyboard } = await import('../navigation.js');

  return {
    text: formatWelcome(lang),
    keyboard: getMainMenuKeyboard(lang),
  };
}

function resumePrompt(session, lang = 'en') {
  session = recoverStaleBlockRunning(session);
  const step = session.step;
  
  const messages = {
    [STEPS.COMPARE_GOAL]: {
      text: formatCompareStartScreen(lang),
      keyboard: compareGoalKeyboard(lang),
    },
    [STEPS.COMPARE_CONTEXT_CUSTOM]: {
      text: formatCompareCustomContextPrompt(lang),
      keyboard: textInputKeyboard(lang),
    },
    [STEPS.PARTNER_NAME]: {
      text: formatPartnerInitStep(1, 5, 'partner_name', lang),
      keyboard: textInputKeyboard(lang),
    },
    [STEPS.PARTNER_GENDER]: {
      text: formatPartnerInitStep(2, 5, 'partner_gender', lang),
      keyboard: partnerGenderKeyboard(lang),
    },
    [STEPS.PARTNER_BIRTH_DATE]: {
      text: formatPartnerInitStep(3, 5, 'partner_birth_date', lang),
      keyboard: textInputKeyboard(lang),
    },
    [STEPS.PARTNER_BIRTH_TIME]: {
      text: formatPartnerInitStep(4, 5, 'partner_birth_time', lang),
      keyboard: partnerTimeKeyboard(lang),
    },
    [STEPS.PARTNER_BIRTH_PLACE]: {
      text: formatPartnerInitStep(5, 5, 'partner_birth_place', lang),
      keyboard: textInputKeyboard(lang),
    },
    [STEPS.COMPARE_CONFIRM]: {
      text: formatComparePairProfile(session.collected_data ?? {}, lang),
      keyboard: compareConfirmKeyboard(lang),
    },
    [STEPS.GOAL_TREE]: {
      ...showGoalTree(session.collected_data?.goal_tree_node ?? TREE_ROOT, lang),
    },
    [STEPS.GENDER]: {
      text: formatInitStep(1, 4, 'gender', lang),
      keyboard: genderKeyboard(lang),
    },
    [STEPS.BIRTH_DATE]: {
      text: formatInitStep(2, 4, 'birth_date', lang),
      keyboard: textInputKeyboard(lang),
    },
    [STEPS.BIRTH_TIME]: {
      text: formatInitStep(3, 4, 'birth_time', lang),
      keyboard: birthTimeKeyboard(lang),
    },
    [STEPS.BIRTH_PLACE]: {
      text: formatInitStep(4, 4, 'birth_place', lang),
      keyboard: textInputKeyboard(lang),
    },
    [STEPS.CONFIRM]: {
      text: formatProfile(session.collected_data, lang),
      keyboard: confirmKeyboard(lang),
    },
    [STEPS.BLOCK_PREP]: {
      text: `<i>${u(lang, 'stagePreparing')}</i>`,
      keyboard: blockPrepKeyboard(currentBlock(session)?.id, session.collected_data, lang),
    },
    [STEPS.BLOCK_FAILED]: {
      text: `<i>${u(lang, 'stageFailed')}</i>`,
      keyboard: blockFailedKeyboard(lang),
    },
    [STEPS.BLOCK_RUNNING]: {
      text: `<i>${u(lang, 'stageRunning')}</i>`,
      keyboard: runningKeyboard(lang),
    },
    [STEPS.BLOCK_REVIEW]: {
      text: `<i>${u(lang, 'stageDone')}</i>`,
      keyboard: reviewKeyboard(session, lang),
    },
    [STEPS.COMPLETED]: {
      text: formatSessionComplete('', lang),
      keyboard: completedKeyboard(lang),
    },
  };

  // Для MENU возвращаем промис, который нужно будет await
  if (!messages[step]) {
    return { _needsAsync: true, lang };
  }
  
  return messages[step];
}

async function safeResumePrompt(session, userId = null) {
  let lang = 'en';
  
  // Получаем язык пользователя если передан userId
  if (userId) {
    try {
      const { getUserLanguage } = await import('../db/users.js');
      lang = await getUserLanguage(userId);
    } catch (err) {
      console.error('Error getting user language in safeResumePrompt:', err.message);
    }
  }
  
  const result = resumePrompt(session, lang);
  if (result._needsAsync) {
    return await showMenu(result.lang);
  }
  return result;
}

export async function handleCallback(from, callbackData) {
  console.log(`[handleCallback] userId=${from.id}, callback="${callbackData}"`);
  
  let { chat, session } = await ensureSession(from);
  const lang = await resolveLang(from);
  
  session = await getSession(from.id);
  
  console.log(`[handleCallback] session.step=${session.step}, block_index=${session.block_index}`);
  
  const parsed = parseCallbackData(callbackData);
  if (!parsed) {
    console.error(`[handleCallback] Не удалось распарсить callback: ${callbackData}`);
    return await rejectWrongInput(session, rejectText(lang), from.id);
  }
  
  console.log(`[handleCallback] parsed.action=${parsed.action}, parsed.value=${parsed.value}`);

  switch (parsed.action) {
    case 'menu': {
      const { getUserLanguage } = await import('../db/users.js');
      const lang = await getUserLanguage(from.id);

      await resetSession(from.id, chat.id);
      scheduleChatFilesCleanup(chat.id);
      return await showMenu(lang);
    }

    case 'links': {
      const linksText = [
        letterhead('Калькуляторы', 'ru'),
        '',
        '🔗 <b>Инструменты расчёта</b>',
        '<i>Выберите ресурс в кнопках ниже.</i>',
      ].join('\n');

      const links = getAllCalculatorLinks();
      const urlButtons = [];
      for (let i = 0; i < links.length; i += 2) {
        urlButtons.push(
          links.slice(i, i + 2).map((l) => ({
            text: l.label,
            url: l.url,
          }))
        );
      }
      urlButtons.push([{ text: btn('ru', 'menu'), callback_data: cb('menu') }]);

      return {
        text: linksText,
        keyboard: { inline_keyboard: urlButtons },
      };
    }

    case 'reset': {
      const { getUserLanguage } = await import('../db/users.js');
      const lang = await getUserLanguage(from.id);

      await resetSession(from.id, chat.id);
      scheduleChatFilesCleanup(chat.id);
      const menu = await showMenu(lang);
      return {
        text: u(lang, 'sessionReset'),
        keyboard: menu.keyboard,
      };
    }

    case 'start': {
      console.log(`[start] userId=${from.id}, targeted session via diagnostic tree`);

      scheduleChatFilesCleanup(chat.id);
      const userLang = await resolveLang(from);

      await upsertSession(from.id, chat.id, {
        step: STEPS.GOAL_TREE,
        collected_data: {
          session_mode: 'targeted',
          goal_tree_node: TREE_ROOT,
          goal_path: [],
        },
        block_index: 0,
        last_block_id: null,
        session_start_at: new Date().toISOString(),
        session_mode: 'targeted',
        target_block_id: null,
        goal_tree_path: [],
      });

      return showGoalTree(TREE_ROOT, userLang);
    }

    case 'compare_start': {
      scheduleChatFilesCleanup(chat.id);
      const userLang = await resolveLang(from);

      await upsertSession(from.id, chat.id, {
        step: STEPS.COMPARE_GOAL,
        collected_data: {
          compare_mode: true,
          session_mode: 'targeted',
          goal_path: [],
        },
        block_index: 0,
        last_block_id: null,
        session_start_at: new Date().toISOString(),
        session_mode: 'targeted',
        target_block_id: null,
        goal_tree_path: [],
      });

      return {
        text: formatCompareStartScreen(userLang),
        keyboard: compareGoalKeyboard(userLang),
      };
    }

    case 'compare_context': {
      const userLang = await resolveLang(from);

      if (session.step !== STEPS.COMPARE_GOAL) {
        return await safeResumePrompt(session, from.id);
      }

      const contextKey = parsed.value;

      if (contextKey === 'custom') {
        const data = mergeCollectedData(session, {
          compare_mode: true,
          session_mode: 'targeted',
        });
        await updateSession(from.id, {
          step: STEPS.COMPARE_CONTEXT_CUSTOM,
          collected_data: data,
        });
        return {
          text: formatCompareCustomContextPrompt(userLang),
          keyboard: textInputKeyboard(userLang),
        };
      }

      const resolved = resolveCompareContext(contextKey, null, userLang);
      if (!resolved.ok) {
        return { text: resolved.error, keyboard: compareGoalKeyboard(userLang) };
      }

      const data = mergeCollectedData(session, {
        compare_mode: true,
        session_mode: 'targeted',
        compare_context: resolved.compare_context,
        compare_context_label: resolved.compare_context_label,
        compare_context_custom: resolved.compare_context_custom,
        target_block_id: resolved.target_block_id,
        block_variant: resolved.block_variant,
        goal_leaf_label: resolved.goal_leaf_label,
      });

      await persistSessionData(from.id, data);
      await updateSession(from.id, {
        step: STEPS.GENDER,
        target_block_id: resolved.target_block_id,
      });

      return {
        text: [
          formatCompareSubjectIntro(resolved.compare_context_label, userLang),
          '',
          formatInitStep(1, 4, 'gender', userLang),
        ].join('\n'),
        keyboard: genderKeyboard(userLang),
      };
    }

    case 'compare_edit_subject': {
      const userLang = await resolveLang(from);
      const data = mergeCollectedData(session, {
        gender: null,
        gender_label: null,
        birth_date: null,
        birth_time: null,
        birth_place: null,
      });
      await updateSession(from.id, { step: STEPS.GENDER, collected_data: data });
      const label = session.collected_data?.compare_context_label ?? '';
      return {
        text: [
          formatCompareSubjectIntro(label, userLang),
          '',
          formatInitStep(1, 4, 'gender', userLang),
        ].join('\n'),
        keyboard: genderKeyboard(userLang),
      };
    }

    case 'partner_gender': {
      const userLang = await resolveLang(from);
      if (session.step !== STEPS.PARTNER_GENDER) {
        return await safeResumePrompt(session, from.id);
      }
      const data = mergeCollectedData(session, {
        partner_gender: parsed.value,
        partner_gender_label: genderLabel(parsed.value, userLang),
      });
      await updateSession(from.id, { step: STEPS.PARTNER_BIRTH_DATE, collected_data: data });
      return {
        text: formatPartnerInitStep(3, 5, 'partner_birth_date', userLang),
        keyboard: textInputKeyboard(userLang),
      };
    }

    case 'partner_time_unknown': {
      const userLang = await resolveLang(from);
      if (session.step !== STEPS.PARTNER_BIRTH_TIME) {
        return await safeResumePrompt(session, from.id);
      }
      const data = mergeCollectedData(session, { partner_birth_time: 'неизвестно' });
      await updateSession(from.id, { step: STEPS.PARTNER_BIRTH_PLACE, collected_data: data });
      return {
        text: formatPartnerInitStep(5, 5, 'partner_birth_place', userLang),
        keyboard: textInputKeyboard(userLang),
      };
    }

    case 'compare_edit_partner': {
      const userLang = await resolveLang(from);
      const data = mergeCollectedData(session, {
        partner_name: null,
        partner_gender: null,
        partner_gender_label: null,
        partner_birth_date: null,
        partner_birth_time: null,
        partner_birth_place: null,
      });
      await updateSession(from.id, { step: STEPS.PARTNER_NAME, collected_data: data });
      return {
        text: formatPartnerInitStep(1, 5, 'partner_name', userLang),
        keyboard: textInputKeyboard(userLang),
      };
    }

    case 'compare_confirm_yes': {
      const userLang = await resolveLang(from);
      if (session.step !== STEPS.COMPARE_CONFIRM) {
        return await safeResumePrompt(session, from.id);
      }
      const blockIndex = resolveStartBlockIndex(session.collected_data ?? {});
      await updateSession(from.id, {
        block_index: blockIndex,
        last_block_id: null,
        target_block_id: session.collected_data?.target_block_id ?? null,
      });
      session = await getSession(from.id);
      return runCompareBlock(from, chat.id, userLang);
    }

    case 'start_full': {
      console.log(`[start_full] userId=${from.id}, full session`);

      scheduleChatFilesCleanup(chat.id);
      const userLang = await resolveLang(from);

      await upsertSession(from.id, chat.id, {
        step: STEPS.GENDER,
        collected_data: { session_mode: 'full', goal_path: [] },
        block_index: 0,
        last_block_id: null,
        session_start_at: new Date().toISOString(),
        session_mode: 'full',
        target_block_id: null,
        goal_tree_path: [],
      });

      return {
        text: formatSessionStart(userLang),
        keyboard: genderKeyboard(userLang),
      };
    }

    case 'tree': {
      const userLang = await resolveLang(from);

      if (session.step !== STEPS.GOAL_TREE) {
        return await safeResumePrompt(session, from.id);
      }

      const [nodeId, variantKey] = (parsed.value ?? '').split(':');
      const choice = resolveTreeChoice(nodeId, variantKey, userLang);
      if (!choice.ok) {
        return { text: choice.error, keyboard: goalTreeKeyboard(nodeId, userLang) };
      }

      const goalPath = [...(session.collected_data?.goal_path ?? []), choice.pathEntry];

      if (!choice.done) {
        const data = mergeCollectedData(session, {
          goal_tree_node: choice.nextNode,
          goal_path: goalPath,
        });
        await persistSessionData(from.id, data);
        return showGoalTree(choice.nextNode, userLang);
      }

      if (choice.sessionModeFull) {
        const data = mergeCollectedData(session, {
          session_mode: 'full',
          goal_tree_node: null,
          goal_path: goalPath,
          goal_leaf_label: choice.leafLabel,
          target_block_id: null,
          block_variant: null,
          goal_maslow: null,
        });
        await persistSessionData(from.id, data);
        await updateSession(from.id, {
          step: STEPS.GENDER,
          session_mode: 'full',
          target_block_id: null,
        });
        return {
          text: [
            letterhead(userLang === 'en' ? 'Full protocol' : 'Полный протокол', userLang),
            '',
            formatAfterGoalIntro(userLang),
            '',
            formatInitStep(1, 4, 'gender', userLang),
          ].join('\n'),
          keyboard: genderKeyboard(userLang),
        };
      }

      const data = mergeCollectedData(session, {
        session_mode: 'targeted',
        goal_tree_node: null,
        goal_path: goalPath,
        target_block_id: choice.targetBlock,
        block_variant: choice.blockVariant,
        goal_leaf_label: choice.leafLabel,
        goal_maslow: choice.maslow,
      });

      await persistSessionData(from.id, data);
      await updateSession(from.id, {
        step: STEPS.GENDER,
        target_block_id: choice.targetBlock,
      });

      return {
        text: [
          letterhead(userLang === 'en' ? 'Your focus' : 'Ваш запрос', userLang),
          '',
          formatAfterGoalIntro(userLang),
          '',
          formatInitStep(1, 4, 'gender', userLang),
        ].join('\n'),
        keyboard: genderKeyboard(userLang),
      };
    }

    case 'finish_session': {
      const userLang = await resolveLang(from);
      if (session.step !== STEPS.BLOCK_REVIEW || !isTargetedSession(session.collected_data)) {
        return await safeResumePrompt(session, from.id);
      }
      return finalizeAnalysisSession(from, chat, session, userLang);
    }

    case 'gender': {
      console.log(`[gender] userId=${from.id}, session.step=${session.step}, expected=${STEPS.GENDER}`);

      if (session.step !== STEPS.GENDER) {
        console.log(`[gender] Неверный шаг, возвращаем safeResumePrompt`);
        return await safeResumePrompt(session, from.id);
      }

      const userLang = await resolveLang(from);
      console.log(`[gender] Сохраняем пол: ${parsed.value}`);
      const data = mergeCollectedData(session, {
        gender: parsed.value,
        gender_label: genderLabel(parsed.value, userLang),
      });
      await updateSession(from.id, { step: STEPS.BIRTH_DATE, collected_data: data });

      return {
        text: formatInitStep(2, 4, 'birth_date', userLang),
        keyboard: textInputKeyboard(userLang),
      };
    }

    case 'time_unknown': {
      if (session.step !== STEPS.BIRTH_TIME) {
        return await safeResumePrompt(session, from.id);
      }
      const userLang = await resolveLang(from);
      const data = mergeCollectedData(session, { birth_time: 'неизвестно' });
      await updateSession(from.id, { step: STEPS.BIRTH_PLACE, collected_data: data });
      return {
        text: formatInitStep(4, 4, 'birth_place', userLang),
        keyboard: textInputKeyboard(userLang),
      };
    }

    case 'confirm_edit': {
      const userLang = await resolveLang(from);

      await upsertSession(from.id, chat.id, {
        step: STEPS.GOAL_TREE,
        collected_data: {
          session_mode: 'targeted',
          goal_tree_node: TREE_ROOT,
          goal_path: [],
        },
        block_index: 0,
        last_block_id: null,
        target_block_id: null,
        goal_tree_path: [],
        session_mode: 'targeted',
      });
      return showGoalTree(TREE_ROOT, userLang);
    }

    case 'confirm_yes': {
      if (session.step !== STEPS.CONFIRM) {
        return await safeResumePrompt(session, from.id);
      }
      const blockIndex = resolveStartBlockIndex(session.collected_data ?? {});
      await updateSession(from.id, {
        block_index: blockIndex,
        last_block_id: null,
        step: STEPS.BLOCK_PREP,
        target_block_id: session.collected_data?.target_block_id ?? null,
      });
      session = await getSession(from.id);
      return await showBlockPrep(session, chat.id, await resolveLang(from));
    }

    case 'skip_block': {
      if (session.step !== STEPS.BLOCK_PREP) {
        console.log(`[skip_block] Неверный шаг. Ожидался: ${STEPS.BLOCK_PREP}, получен: ${session.step}`);
        return await safeResumePrompt(session, from.id);
      }
      
      const block = currentBlock(session);
      if (!block) {
        await updateSession(from.id, { step: STEPS.COMPLETED });
        return {
          text: `<b>${BRAND.name}</b>\n<i>${u(lang, 'sessionComplete')}</i>`,
          keyboard: completedKeyboard(),
        };
      }

      console.log(`[skip_block] Пропускаем блок ${block.id}`);

      // Сохраняем пустой JSON для блока (чтобы оператор знал что блок пропущен)
      const skippedJson = {
        status: 'skipped',
        block_id: block.id,
        skipped_at: new Date().toISOString(),
        reason: 'Пропущено оператором',
      };

      try {
        await saveBlockResult({
          chatId: chat.id,
          userId: from.id,
          blockId: block.id,
          responseText: `[ПРОПУЩЕНО] Блок ${block.id} пропущен оператором`,
          jsonPayload: skippedJson,
        });
        console.log(`[skip_block] Блок ${block.id} сохранен в БД как пропущенный`);
      } catch (err) {
        console.error('Ошибка сохранения пропущенного блока:', err.message);
      }

      // Переход к следующему блоку
      const nextIndex = session.block_index + 1;
      
      if (nextIndex >= BLOCK_STACK.length || isTargetedSession(session.collected_data)) {
        console.log('[skip_block] Завершение сессии (targeted или последний блок)');
        const userLang = await resolveLang(from);
        return finalizeAnalysisSession(from, chat, session, userLang);
      }

      // Переход к следующему блоку (полная сессия)
      console.log(`[skip_block] Переходим к блоку с индексом ${nextIndex}`);

      const cleanedData = { ...session.collected_data };
      if (cleanedData.block_user_text && cleanedData.block_user_text[block.id]) {
        delete cleanedData.block_user_text[block.id];
      }
      if (cleanedData.block_attachments && cleanedData.block_attachments[block.id]) {
        delete cleanedData.block_attachments[block.id];
      }
      
      await updateSession(from.id, {
        block_index: nextIndex,
        step: STEPS.BLOCK_PREP,
        last_block_id: block.id,
        collected_data: cleanedData,
      });
      
      // Перечитываем сессию из БД чтобы быть уверенными в актуальности
      const freshSession = await getSession(from.id);
      console.log(`[skip_block] Обновленная сессия: block_index=${freshSession.block_index}, step=${freshSession.step}`);
      
      // Получаем следующий блок
      const nextBlock = BLOCK_STACK[freshSession.block_index];
      console.log(`[skip_block] Следующий блок: ${nextBlock?.id}`);
      
      if (!nextBlock) {
        console.error('[skip_block] ОШИБКА: следующий блок не найден!');
        const { getUserLanguage } = await import('../db/users.js');
        const lang = await getUserLanguage(from.id);
        const menu = await showMenu(lang);
        return {
          text: u(lang, 'stageNextFailed'),
          keyboard: menu.keyboard,
        };
      }

      const nextBlockText = await blockPrepText(freshSession, chat.id, lang);
      const nextBlockKeyboard = blockPrepKeyboard(nextBlock.id, freshSession.collected_data);
      
      return {
        text: `<i>${u(lang, 'stageSkipped')}</i>\n\n${nextBlockText}`,
        keyboard: nextBlockKeyboard,
      };
    }

    case 'run_block': {
      if (session.step !== STEPS.BLOCK_PREP) {
        console.log(`[run_block] Неверный шаг. Ожидался: ${STEPS.BLOCK_PREP}, получен: ${session.step}`);
        return await safeResumePrompt(session, from.id);
      }
      const block = currentBlock(session);
      if (!block) {
        await updateSession(from.id, { step: STEPS.COMPLETED });
        return {
          text: `<b>${BRAND.name}</b>\n<i>${u(lang, 'sessionComplete')}</i>`,
          keyboard: completedKeyboard(),
        };
      }
      
      const files = await getEffectiveBlockFiles(chat.id, block);
      const userText = session.collected_data?.block_user_text?.[block.id];

      if (block.requiresExternal && files.length === 0 && !userText) {
        const runLang = await resolveLang(from);
        const text = await blockPrepText(session, chat.id, runLang);
        return {
          text: `${text}\n\n<i>${u(runLang, 'errorFileRequired')}</i>`,
          keyboard: blockPrepKeyboard(block.id, session.collected_data),
        };
      }
      return runCurrentBlock(from, chat.id);
    }

    case 'retry_block': {
      if (session.step !== STEPS.BLOCK_FAILED) {
        return await safeResumePrompt(session, from.id);
      }
      if (isCompareMode(session.collected_data)) {
        return runCompareBlock(from, chat.id, await resolveLang(from));
      }
      await updateSession(from.id, { step: STEPS.BLOCK_PREP });
      session = await getSession(from.id);
      return await showBlockPrep(session, chat.id, await resolveLang(from));
    }

    case 'quick_question': {
      console.log(`[quick_question] userId=${from.id}, questionIndex=${parsed.value}`);
      
      // Обновляем сессию из БД на случай если она изменилась
      session = await getSession(from.id);
      
      console.log(`[quick_question] session.step=${session.step}, expected=${STEPS.BLOCK_REVIEW}`);
      
      if (session.step !== STEPS.BLOCK_REVIEW) {
        console.log(`[quick_question] Неверный шаг, возвращаем safeResumePrompt`);
        return await safeResumePrompt(session, from.id);
      }

      // Статичные вопросы (не генерируются ИИ)
      const quickQuestions = [
        'Как применить полученные выводы на практике?',
        'Дайте развёрнутую интерпретацию текущего этапа.',
        'Что это означает в контексте моего профиля?',
      ];

      const questionIndex = parseInt(parsed.value, 10);
      const selectedQuestion = quickQuestions[questionIndex];

      if (!selectedQuestion) {
        console.error(`[quick_question] Вопрос не найден, index=${questionIndex}`);
        return await rejectWrongInput(session, 'Вопрос не найден.', from.id);
      }
      
      console.log(`[quick_question] Выбран вопрос: "${selectedQuestion}"`);

      // Отправляем вопрос в ИИ как обычное сообщение пользователя
      await saveChatMessages(chat.id, [
        { role: 'user', content: selectedQuestion },
      ]);

      // Получаем ответ от ИИ
      const { askGpt } = await import('../ai/gptunnel.js');
      const { getSystemPrompt } = await import('../prompts/loadSystemPrompt.js');

      // Получаем контекст сессии
      const { compressMessagesForAI } = await import('../ai/contextMessages.js');
      const sessionMessages = await getChatMessagesForAI(chat.id, session.session_start_at);

      const cleanedMessages = compressMessagesForAI(
        sessionMessages.filter(
          (msg) => !(msg.role === 'user' && msg.content.includes('[служебно]'))
        )
      );

      const systemPrompt = await getSystemPrompt({ blockId: session.last_block_id });
      const messages = [
        { role: 'system', content: systemPrompt },
        ...cleanedMessages,
      ];

      let aiResponse;
      try {
        console.log(`[quick_question] Вызываем askGpt...`);
        aiResponse = await askGpt(messages);
        console.log(`[quick_question] Получен ответ от ИИ, длина: ${aiResponse.length}`);
      } catch (err) {
        console.error('Ошибка ИИ на quick question:', err.message);
        const qLang = await resolveLang(from);
        return {
          text: u(qLang, 'errorAi'),
          keyboard: reviewKeyboard(session, qLang),
        };
      }

      // Сохраняем ответ ИИ
      await saveChatMessages(chat.id, [
        { role: 'assistant', content: aiResponse },
      ]);
      
      console.log(`[quick_question] Ответ сохранён, возвращаем пользователю`);

      // Форматируем ответ для пользователя (убираем JSON, конвертируем markdown)
      const formattedResponse = formatFollowUpForTelegram(aiResponse, session.last_block_id, 'ru');
      const chunks = splitTelegramMessages(formattedResponse);
      
      console.log(`[quick_question] Chunks: ${chunks.length}, остаёмся в BLOCK_REVIEW`);

      return {
        text: chunks[0],
        extraMessages: chunks.slice(1),
        keyboard: reviewKeyboard(session, await resolveLang(from)),
      };
    }

    case 'next_block': {
      console.log(`[next_block] userId=${from.id}, session.step=${session.step}, block_index=${session.block_index}`);
      
      if (session.step !== STEPS.BLOCK_REVIEW) {
        console.log(`[next_block] Неверный шаг, ожидался BLOCK_REVIEW`);
        return await safeResumePrompt(session, from.id);
      }

      const userLang = await resolveLang(from);

      if (isTargetedSession(session.collected_data)) {
        return finalizeAnalysisSession(from, chat, session, userLang);
      }
      
      const nextIndex = session.block_index + 1;
      console.log(`[next_block] Переход к блоку с индексом ${nextIndex}/${BLOCK_STACK.length}`);
      
      if (nextIndex >= BLOCK_STACK.length) {
        return finalizeAnalysisSession(from, chat, session, userLang);
      }

      await updateSession(from.id, {
        block_index: nextIndex,
        step: STEPS.BLOCK_PREP,
      });
      session = await getSession(from.id);
      return await showBlockPrep(session, chat.id, await resolveLang(from));
    }

    default:
      return rejectWrongInput(session, rejectText(lang));
  }
}

async function runCompareBlock(from, chatId, lang) {
  const userId = from.id;
  let session = await getSession(userId);

  if (session.step === STEPS.BLOCK_RUNNING) {
    return {
      text: `<i>${u(lang, 'stageAlreadyRunning')}</i>`,
      keyboard: runningKeyboard(lang),
    };
  }

  session = await updateSession(userId, { step: STEPS.BLOCK_RUNNING });

  try {
    const result = await runAnalysisBlock({
      session,
      chatId,
      userId,
    });

    const freshSession = await getSession(userId);
    const data = freshSession.collected_data ?? {};

    await saveComparison(userId, {
      subjectData: subjectProfileFromCollected(data),
      partnerData: partnerProfileFromCollected(data),
      goalData: {
        compare_context: data.compare_context,
        compare_context_label: data.compare_context_label,
        compare_context_custom: data.compare_context_custom,
        goal_leaf_label: data.goal_leaf_label,
        block_variant: data.block_variant,
      },
      targetBlockId: data.target_block_id,
      blockVariant: data.block_variant,
      responseText: result.responseText,
      jsonPayload: result.jsonPayload,
    }).catch((err) => console.error('[compare] save:', err.message));

    await updateSession(userId, { step: STEPS.COMPLETED, last_block_id: result.blockId });

    const body = `${formatCompareResultHeader(data, lang)}\n\n${result.userMessage}`;
    const parts = splitForTelegramWithKeyboard(body, compareCompleteKeyboard(lang));

    return {
      text: parts[0].text,
      keyboard: parts.length === 1 ? parts[0].keyboard : compareCompleteKeyboard(lang),
      extraMessages: parts.slice(1),
    };
  } catch (err) {
    console.error('Ошибка compare block:', err.message);
    await updateSession(userId, { step: STEPS.BLOCK_FAILED });
    return {
      text: `${mapErrorToUser(lang, err)}\n\n${u(lang, 'stageRetryHint')}`,
      keyboard: blockFailedKeyboard(lang),
    };
  }
}

async function runCurrentBlock(from, chatId) {
  const userId = from.id;
  let session = await getSession(userId);
  const lang = await resolveLang(from);

  if (session.step === STEPS.BLOCK_RUNNING) {
    return {
      text: `<i>${u(lang, 'stageAlreadyRunning')}</i>`,
      keyboard: runningKeyboard(lang),
    };
  }

  session = await updateSession(userId, { step: STEPS.BLOCK_RUNNING });

  try {
    const { blockId, userMessage } = await runAnalysisBlock({
      session,
      chatId,
      userId,
    });

    session = await updateSession(userId, {
      step: STEPS.BLOCK_REVIEW,
      last_block_id: blockId,
    });

    const lang = await resolveLang(from);
    const parts = splitForTelegramWithKeyboard(userMessage, reviewKeyboard(session, lang));

    return {
      text: parts[0].text,
      keyboard: parts.length === 1 ? parts[0].keyboard : undefined,
      extraMessages: parts.slice(1),
    };
  } catch (err) {
    console.error('Ошибка блока:', err.message);
    const blockId = BLOCK_STACK[session.block_index]?.id ?? '?';
    await updateSession(userId, {
      step: STEPS.BLOCK_FAILED,
      last_block_id: blockId,
    });
    return {
      text: `${mapErrorToUser(lang, err)}\n\n${u(lang, 'stageRetryHint')}`,
      keyboard: blockFailedKeyboard(lang),
    };
  }
}

export async function handleText(from, rawText) {
  const { chat } = await ensureSession(from);
  const session = await getSession(from.id);
  const step = session.step;
  const lang = await resolveLang(from);

  if (!TEXT_INPUT_STEPS.has(step)) {
    if (step === STEPS.BLOCK_RUNNING) {
      return {
        text: `<i>${u(lang, 'stageRunning')}</i>`,
        keyboard: runningKeyboard(lang),
      };
    }
    const hints = {
      [STEPS.GOAL_TREE]: '🎯 На этом шаге выберите вариант кнопкой ниже.',
      [STEPS.COMPARE_GOAL]: '🎯 Выберите контекст сравнения кнопкой ниже.',
      [STEPS.COMPARE_CONTEXT_CUSTOM]: '✏️ Опишите контекст сравнения текстом.',
      [STEPS.PARTNER_GENDER]: '👤 Выберите пол второго человека кнопкой ниже.',
      [STEPS.COMPARE_CONFIRM]: '✓ Подтвердите данные пары кнопкой ниже.',
      [STEPS.GENDER]: '👤 На этом шаге выберите пол кнопкой ниже.',
      [STEPS.CONFIRM]: '✓ Подтвердите профиль кнопкой ниже.',
      [STEPS.BLOCK_FAILED]: u(lang, 'stageRetryHint'),
    };
    return await rejectWrongInput(session, hints[step] ?? rejectText(lang), from.id);
  }

  switch (step) {
    case STEPS.COMPARE_GOAL:
    case STEPS.COMPARE_CONTEXT_CUSTOM: {
      const resolved = resolveCompareContext('custom', rawText, lang);
      if (!resolved.ok) {
        return { text: resolved.error, keyboard: textInputKeyboard(lang) };
      }

      const data = mergeCollectedData(session, {
        compare_mode: true,
        session_mode: 'targeted',
        compare_context: resolved.compare_context,
        compare_context_label: resolved.compare_context_label,
        compare_context_custom: resolved.compare_context_custom,
        target_block_id: resolved.target_block_id,
        block_variant: resolved.block_variant,
        goal_leaf_label: resolved.goal_leaf_label,
      });

      await persistSessionData(from.id, data);
      await updateSession(from.id, {
        step: STEPS.GENDER,
        target_block_id: resolved.target_block_id,
      });

      return {
        text: [
          formatCompareSubjectIntro(resolved.compare_context_label, lang),
          '',
          formatInitStep(1, 4, 'gender', lang),
        ].join('\n'),
        keyboard: genderKeyboard(lang),
      };
    }

    case STEPS.BIRTH_DATE: {
      const v = validateBirthDate(rawText, lang);
      if (!v.ok) return { text: v.error, keyboard: textInputKeyboard(lang) };
      const data = mergeCollectedData(session, { birth_date: v.value });
      await updateSession(from.id, { step: STEPS.BIRTH_TIME, collected_data: data });
      return {
        text: formatInitStep(3, 4, 'birth_time', lang),
        keyboard: birthTimeKeyboard(lang),
      };
    }

    case STEPS.BIRTH_TIME: {
      const v = validateBirthTime(rawText, lang);
      if (!v.ok) return { text: v.error, keyboard: birthTimeKeyboard(lang) };
      const data = mergeCollectedData(session, { birth_time: v.value });
      await updateSession(from.id, { step: STEPS.BIRTH_PLACE, collected_data: data });
      return {
        text: formatInitStep(4, 4, 'birth_place', lang),
        keyboard: textInputKeyboard(lang),
      };
    }

    case STEPS.BIRTH_PLACE: {
      const v = validateBirthPlace(rawText, lang);
      if (!v.ok) return { text: v.error, keyboard: textInputKeyboard(lang) };
      const data = mergeCollectedData(session, { birth_place: v.value });

      if (isCompareMode(data)) {
        await updateSession(from.id, { step: STEPS.PARTNER_NAME, collected_data: data });
        return {
          text: formatPartnerInitStep(1, 5, 'partner_name', lang),
          keyboard: textInputKeyboard(lang),
        };
      }

      await updateSession(from.id, { step: STEPS.CONFIRM, collected_data: data });
      return {
        text: formatProfile(data, lang),
        keyboard: confirmKeyboard(lang),
      };
    }

    case STEPS.PARTNER_NAME: {
      const name = rawText.trim();
      if (name.length < 2 || name.length > 64) {
        return {
          text:
            lang === 'en'
              ? 'Enter a name or alias (2–64 characters).'
              : 'Введите имя или псевдоним (2–64 символа).',
          keyboard: textInputKeyboard(lang),
        };
      }
      const data = mergeCollectedData(session, { partner_name: name });
      await updateSession(from.id, { step: STEPS.PARTNER_GENDER, collected_data: data });
      return {
        text: formatPartnerInitStep(2, 5, 'partner_gender', lang),
        keyboard: partnerGenderKeyboard(lang),
      };
    }

    case STEPS.PARTNER_BIRTH_DATE: {
      const v = validateBirthDate(rawText, lang);
      if (!v.ok) return { text: v.error, keyboard: textInputKeyboard(lang) };
      const data = mergeCollectedData(session, { partner_birth_date: v.value });
      await updateSession(from.id, { step: STEPS.PARTNER_BIRTH_TIME, collected_data: data });
      return {
        text: formatPartnerInitStep(4, 5, 'partner_birth_time', lang),
        keyboard: partnerTimeKeyboard(lang),
      };
    }

    case STEPS.PARTNER_BIRTH_TIME: {
      const v = validateBirthTime(rawText, lang);
      if (!v.ok) return { text: v.error, keyboard: partnerTimeKeyboard(lang) };
      const data = mergeCollectedData(session, { partner_birth_time: v.value });
      await updateSession(from.id, { step: STEPS.PARTNER_BIRTH_PLACE, collected_data: data });
      return {
        text: formatPartnerInitStep(5, 5, 'partner_birth_place', lang),
        keyboard: textInputKeyboard(lang),
      };
    }

    case STEPS.PARTNER_BIRTH_PLACE: {
      const v = validateBirthPlace(rawText, lang);
      if (!v.ok) return { text: v.error, keyboard: textInputKeyboard(lang) };
      const data = mergeCollectedData(session, { partner_birth_place: v.value });
      await updateSession(from.id, { step: STEPS.COMPARE_CONFIRM, collected_data: data });
      return {
        text: formatComparePairProfile(data, lang),
        keyboard: compareConfirmKeyboard(lang),
      };
    }

    case STEPS.BLOCK_PREP: {
      // Пользователь отвечает на уточняющие вопросы ИИ или предоставляет данные
      // Сохраняем текст как "дополнительную информацию" для блока
      const block = currentBlock(session);
      if (!block) {
        return { text: u(lang, 'cycleComplete'), keyboard: completedKeyboard() };
      }

      // Добавляем текст к collected_data для передачи в ИИ
      const existingText = session.collected_data?.block_user_text?.[block.id] || '';
      const newText = existingText ? `${existingText}\n\n${rawText}` : rawText;
      
      const blockTexts = {
        ...(session.collected_data?.block_user_text || {}),
        [block.id]: newText,
      };

      const data = mergeCollectedData(session, { block_user_text: blockTexts });
      await updateSession(from.id, { collected_data: data });

      // ВАЖНО: После сохранения текста показываем обновленное состояние блока
      const updatedSession = await getSession(from.id);
      const updatedText = await blockPrepText(updatedSession, chat.id, lang);
      
      return {
        text: `<i>${u(lang, 'dataSaved')}</i>\n\n${updatedText}`,
        keyboard: blockPrepKeyboard(block.id, data),
      };
    }

    case STEPS.BLOCK_REVIEW: {
      console.log(`[handleText BLOCK_REVIEW] userId=${from.id}, blockId=${session.last_block_id}, text="${rawText.slice(0, 50)}..."`);
      
      // Пользователь задаёт свой вопрос (свободный текст)
      const blockId = session.last_block_id;
      
      if (!blockId) {
        console.error('[handleText BLOCK_REVIEW] Блок не найден!');
        return await rejectWrongInput(session, 'Блок не найден.', from.id);
      }

      console.log(`[handleText BLOCK_REVIEW] Отправляем вопрос в ИИ...`);
      
      // Отправляем вопрос пользователя в ИИ как обычное сообщение
      await saveChatMessages(chat.id, [
        { role: 'user', content: rawText },
      ]);

      // Получаем ответ от ИИ
      const { askGpt } = await import('../ai/gptunnel.js');
      const { getSystemPrompt } = await import('../prompts/loadSystemPrompt.js');

      // Получаем контекст сессии
      const { compressMessagesForAI } = await import('../ai/contextMessages.js');
      const sessionMessages = await getChatMessagesForAI(chat.id, session.session_start_at);

      const cleanedMessages = compressMessagesForAI(
        sessionMessages.filter(
          (msg) => !(msg.role === 'user' && msg.content.includes('[служебно]'))
        )
      );

      const systemPrompt = await getSystemPrompt({ blockId: session.last_block_id });
      const messages = [
        { role: 'system', content: systemPrompt },
        ...cleanedMessages,
      ];

      let aiResponse;
      try {
        console.log(`[handleText BLOCK_REVIEW] Вызываем askGpt...`);
        aiResponse = await askGpt(messages);
        console.log(`[handleText BLOCK_REVIEW] Получен ответ от ИИ, длина: ${aiResponse.length}`);
      } catch (err) {
        console.error('Ошибка ИИ на текстовый вопрос:', err.message);
        return {
          text: u(lang, 'errorAi'),
          keyboard: reviewKeyboard(session, lang),
        };
      }

      // Сохраняем ответ ИИ
      await saveChatMessages(chat.id, [
        { role: 'assistant', content: aiResponse },
      ]);
      
      console.log(`[handleText BLOCK_REVIEW] Ответ сохранён в БД`);

      // Форматируем ответ для пользователя (убираем JSON, конвертируем markdown)
      const formattedResponse = formatFollowUpForTelegram(aiResponse, session.last_block_id, 'ru');
      const chunks = splitTelegramMessages(formattedResponse);
      
      console.log(`[handleText BLOCK_REVIEW] Возвращаем ответ пользователю, chunks: ${chunks.length}, остаёмся в BLOCK_REVIEW`);

      return {
        text: chunks[0],
        extraMessages: chunks.slice(1),
        keyboard: reviewKeyboard(session, lang),
      };
    }

    default:
      return await rejectWrongInput(session, rejectText(lang), from.id);
  }
}

export async function handleFile(from, fileId, fileType = 'photo', fileName = null, mimeType = null) {
  const { chat, session } = await ensureSession(from);
  const lang = await resolveLang(from);

  if (session.step !== STEPS.BLOCK_PREP) {
    return await rejectWrongInput(session, u(lang, 'filesWrongStep'), from.id);
  }

  const block = currentBlock(session);
  if (!block) {
    return { text: u(lang, 'cycleComplete'), keyboard: completedKeyboard() };
  }

  try {
    // 1. Загружаем файл в Supabase Storage
    const uploadResult = await uploadTelegramFileToStorage(
      fileId,
      from.id,
      block.id,
      fileName,
      mimeType
    );

    // 2. Извлекаем текст для ИИ
    const extractedText = await extractTextFromFile(
      uploadResult.buffer,
      uploadResult.fileType,
      mimeType
    );

    // 3. Сохраняем информацию о файле в БД
    await saveUserFile({
      userId: from.id,
      chatId: chat.id,
      blockId: block.id,
      fileName: fileName || `file_${Date.now()}`,
      fileType: uploadResult.fileType,
      mimeType: mimeType,
      fileSize: uploadResult.fileSize,
      storagePath: uploadResult.storagePath,
      publicUrl: uploadResult.publicUrl,
      extractedText: extractedText,
      telegramFileId: fileId,
    });

    // 4. Обновляем сессию с информацией о файлах (для UI)
    const existingFiles = await getBlockFiles(chat.id, block.id);
    const fileInfo = {
      file_id: fileId,
      type: uploadResult.fileType,
      name: fileName,
      mime: mimeType,
      count: existingFiles.length,
    };

    const patch = saveBlockAttachment(session.collected_data, block.id, fileInfo);
    const data = mergeCollectedData(session, patch);
    await updateSession(from.id, { collected_data: data });

    const updatedSession = await getSession(from.id);
    return await showBlockPrep(updatedSession, chat.id, lang);
  } catch (err) {
    console.error('Ошибка загрузки файла:', err.message);
    return {
      text: `${mapErrorToUser(lang, err)}\n\n${u(lang, 'errorFile')}`,
      keyboard: blockPrepKeyboard(block.id, session.collected_data),
    };
  }
}

export async function sendScenarioReply(ctx, payload) {
  if (!payload?.text) {
    console.error('[sendScenarioReply] пустой payload:', payload);
    const userId = ctx.from?.id;
    let lang = 'ru';
    if (userId) {
      try {
        lang = await resolveLang({ id: userId });
      } catch {
        // default ru
      }
    }
    await ctx.reply(`${u(lang, 'errorGeneric')}\n\n${u(lang, 'tryAgain')}`).catch(() => {});
    return;
  }

  const { text, keyboard, extraMessages, editMessage = false } = payload;

  // Формируем опции для отправки
  const replyOptions = {
    parse_mode: TELEGRAM_PARSE_MODE,
  };
  
  // Добавляем клавиатуру только если она есть
  if (keyboard) {
    replyOptions.reply_markup = keyboard;
  }

  // Если нужно редактировать - пробуем editMessageText
  if (editMessage && ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, replyOptions);
      return; // Успешно отредактировали, выходим
    } catch (err) {
      // Если не удалось отредактировать (сообщение слишком старое или идентичное)
      // Отправляем новое
      console.log('Не удалось отредактировать сообщение, отправляю новое:', err.message);
    }
  }

  // Пытаемся отправить с Markdown форматированием
  try {
    await ctx.reply(text, replyOptions);
  } catch (err) {
    if (err.message.includes('parse') || err.message.includes('entities')) {
      console.error('Ошибка парсинга HTML, отправляю plain:', err.message);
      const plainOptions = {};
      if (keyboard) {
        plainOptions.reply_markup = keyboard;
      }
      await ctx.reply(htmlToPlain(text), plainOptions);
    } else {
      throw err;
    }
  }

  if (extraMessages?.length) {
    for (const part of extraMessages) {
      const partText = typeof part === 'string' ? part : part.text;
      const partKb = typeof part === 'string' ? undefined : part.keyboard;

      const partOptions = {
        parse_mode: TELEGRAM_PARSE_MODE,
      };

      if (partKb) {
        partOptions.reply_markup = partKb;
      }

      try {
        await ctx.reply(partText, partOptions);
      } catch (err) {
        if (err.message.includes('parse') || err.message.includes('entities')) {
          console.error('Ошибка парсинга HTML в extra message, отправляю plain');
          const plainPartOptions = {};
          if (partKb) {
            plainPartOptions.reply_markup = partKb;
          }
          await ctx.reply(htmlToPlain(partText), plainPartOptions);
        } else {
          throw err;
        }
      }
    }
  }
}
