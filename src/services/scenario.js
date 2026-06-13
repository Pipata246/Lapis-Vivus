import {
  BLOCK_STACK,
  STEPS,
  TEXT_INPUT_STEPS,
  REJECT_TEXT,
  CALLBACK_PREFIX,
  formatBlockHeader,
} from '../scenario/constants.js';
import { splitTelegramMessages, splitForTelegramWithKeyboard, TELEGRAM_PARSE_MODE, htmlToPlain } from '../ai/formatResponse.js';
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
} from '../scenario/keyboards.js';
import { getOrCreateUserChat } from '../db/chats.js';
import { upsertUserFromTelegram, saveUserProfile } from '../db/users.js';
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
  divider,
  formatClientProfile,
  onboardingHeader,
} from '../ui/brand.js';
import { getCompletedBlocks, saveBlockResult } from '../db/blockResults.js';
import { saveChatMessages, getChatMessagesForAI } from '../db/chats.js';

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

/** Не блокируем ответ пользователю — очистка файлов в фоне */
function scheduleChatFilesCleanup(chatId) {
  deleteAllChatFiles(chatId).catch((err) => {
    console.error('Фоновое удаление файлов чата:', err.message);
  });
}

function genderLabel(value) {
  return value === 'male' ? 'Мужской' : 'Женский';
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

async function blockPrepText(session, chatId) {
  const block = currentBlock(session);
  if (!block) {
    return '<i>Полный цикл анализа завершён.</i>';
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

  let fileLine;
  if (ownFiles.length > 0) {
    const fileNames = ownFiles.map((f) => f.file_name || 'Файл').join(', ');
    fileLine = `Прикреплено файлов · ${ownFiles.length} (${fileNames})`;
  } else if (inheritedFiles.length > 0) {
    fileLine = `Используются материалы этапа 3 · ${inheritedFiles.length}. Можно добавить свои.`;
  } else if (block.requiresExternal) {
    fileLine =
      is3BBlockId(block.id)
        ? 'Требуется файл или текстовое описание данных.'
        : 'Требуется файл или текстовое описание — обязательно.';
  } else {
    fileLine = 'Файл или текст — по необходимости.';
  }

  const userText = session.collected_data?.block_user_text?.[block.id];
  let textLine = null;
  if (userText) {
    const preview = userText.length > 100 ? `${userText.slice(0, 100)}…` : userText;
    textLine = `Ваш текст · «${preview}»`;
  }

  const calcBlock = formatCalculatorLinksText(block.id, session.collected_data);
  const header = formatBlockHeader(block.id, session.block_index);

  return [
    header,
    divider(),
    calcBlock || null,
    calcBlock ? '' : null,
    fileLine,
    textLine || null,
    '',
    'При необходимости приложите скриншот или опишите данные текстом.',
    `Для запуска нажмите «${btn('ru', 'runStage')}».`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function showBlockPrep(session, chatId) {
  const block = currentBlock(session);
  const text = await blockPrepText(session, chatId);
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
  // Возвращаем новое главное меню с мультиязычностью
  const { t } = await import('../i18n.js');
  const { getMainMenuKeyboard } = await import('../navigation.js');
  
  return {
    text: `${t(lang, 'welcome')}\n\n${t(lang, 'welcomeText')}`,
    keyboard: getMainMenuKeyboard(lang),
  };
}

function resumePrompt(session, lang = 'en') {
  session = recoverStaleBlockRunning(session);
  const step = session.step;
  
  const messages = {
    [STEPS.GENDER]: {
      text: `${onboardingHeader(1, 4, 'Пол')}\n\nУкажите пол для расчёта.`,
      keyboard: genderKeyboard(),
    },
    [STEPS.BIRTH_DATE]: {
      text: `${onboardingHeader(2, 4, 'Дата рождения')}\n\nФормат · ДД.ММ.ГГГГ`,
      keyboard: textInputKeyboard(),
    },
    [STEPS.BIRTH_TIME]: {
      text: `${onboardingHeader(3, 4, 'Время рождения')}\n\nФормат · ЧЧ:ММ или «${btn('ru', 'timeUnknown')}».`,
      keyboard: birthTimeKeyboard(),
    },
    [STEPS.BIRTH_PLACE]: {
      text: `${onboardingHeader(4, 4, 'Место рождения')}\n\nГород или населённый пункт.`,
      keyboard: textInputKeyboard(),
    },
    [STEPS.CONFIRM]: {
      text: `${formatProfile(session.collected_data)}\n\n<i>Проверьте данные перед началом анализа.</i>`,
      keyboard: confirmKeyboard(),
    },
    [STEPS.BLOCK_PREP]: {
      text: '<i>Подготовка этапа…</i>',
      keyboard: blockPrepKeyboard(currentBlock(session)?.id, session.collected_data),
    },
    [STEPS.BLOCK_FAILED]: {
      text: `Этап ${session.last_block_id ?? ''} не выполнен.\nПовторите или вернитесь в меню.`,
      keyboard: blockFailedKeyboard(),
    },
    [STEPS.BLOCK_RUNNING]: {
      text: '<i>Выполняется расчёт этапа. Пожалуйста, подождите.</i>',
      keyboard: runningKeyboard(),
    },
    [STEPS.BLOCK_REVIEW]: {
      text: `Этап ${session.last_block_id ?? ''} завершён.\nПерейдите к следующему или задайте вопрос.`,
      keyboard: nextBlockKeyboard(),
    },
    [STEPS.COMPLETED]: {
      text: `<b>${BRAND.name}</b>\n<i>Полный цикл анализа завершён.</i>`,
      keyboard: completedKeyboard(),
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
  
  // Перечитываем сессию из БД чтобы убедиться что у нас актуальное состояние
  session = await getSession(from.id);
  
  console.log(`[handleCallback] session.step=${session.step}, block_index=${session.block_index}`);
  
  const parsed = parseCallbackData(callbackData);
  if (!parsed) {
    console.error(`[handleCallback] Не удалось распарсить callback: ${callbackData}`);
    return await rejectWrongInput(session, REJECT_TEXT, from.id);
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
        '<b>Справочные ресурсы</b>',
        '<i>Калькуляторы и внешние сервисы</i>',
        divider(),
        'Выберите ресурс в кнопках ниже.',
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
        text: lang === 'ru' ? 'Сессия сброшена. Можно начать новый анализ.' : 'Session reset. You can start a new analysis.',
        keyboard: menu.keyboard,
      };
    }

    case 'start': {
      console.log(`[start] userId=${from.id}, начинаем новый анализ`);

      scheduleChatFilesCleanup(chat.id);
      await upsertSession(from.id, chat.id, {
        step: STEPS.GENDER,
        collected_data: {},
        block_index: 0,
        last_block_id: null,
        session_start_at: new Date().toISOString(),
      });

      console.log(`[start] step установлен в ${STEPS.GENDER}`);

      const userLang = from.language_code?.startsWith('ru') ? 'ru' : 'en';

      return {
        text: userLang === 'ru'
          ? `${onboardingHeader(1, 4, 'Пол', 'ru')}\n\nУкажите пол для расчёта.`
          : `${onboardingHeader(1, 4, 'Gender', 'en')}\n\nSelect gender for the analysis.`,
        keyboard: genderKeyboard(),
      };
    }

    case 'gender': {
      console.log(`[gender] userId=${from.id}, session.step=${session.step}, expected=${STEPS.GENDER}`);
      
      if (session.step !== STEPS.GENDER) {
        console.log(`[gender] Неверный шаг, возвращаем safeResumePrompt`);
        return await safeResumePrompt(session, from.id);
      }
      
      console.log(`[gender] Сохраняем пол: ${parsed.value}`);
      const data = mergeCollectedData(session, {
        gender: parsed.value,
        gender_label: genderLabel(parsed.value),
      });
      await updateSession(from.id, { step: STEPS.BIRTH_DATE, collected_data: data });

      const userLang = from.language_code?.startsWith('ru') ? 'ru' : 'en';

      return {
        text: userLang === 'ru'
          ? `${onboardingHeader(2, 4, 'Дата рождения', 'ru')}\n\nФормат · ДД.ММ.ГГГГ`
          : `${onboardingHeader(2, 4, 'Birth date', 'en')}\n\nFormat · DD.MM.YYYY`,
        keyboard: textInputKeyboard(),
      };
    }

    case 'time_unknown': {
      if (session.step !== STEPS.BIRTH_TIME) {
        return await safeResumePrompt(session, from.id);
      }
      const data = mergeCollectedData(session, { birth_time: 'неизвестно' });
      await updateSession(from.id, { step: STEPS.BIRTH_PLACE, collected_data: data });
      return {
        text: `${onboardingHeader(4, 4, 'Место рождения')}\n\nГород или населённый пункт.`,
        keyboard: textInputKeyboard(),
      };
    }

    case 'confirm_edit':
      await updateSession(from.id, {
        step: STEPS.GENDER,
        collected_data: {},
        block_index: 0,
        last_block_id: null,
      });
      return {
        text: `${onboardingHeader(1, 4, 'Пол')}\n\nУкажите пол для расчёта.`,
        keyboard: genderKeyboard(),
      };

    case 'confirm_yes': {
      if (session.step !== STEPS.CONFIRM) {
        return await safeResumePrompt(session, from.id);
      }
      await updateSession(from.id, {
        block_index: 0,
        last_block_id: null,
        step: STEPS.BLOCK_PREP,
      });
      session = await getSession(from.id);
      return await showBlockPrep(session, chat.id);
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
          text: `<b>${BRAND.name}</b>\n<i>Анализ завершён.</i>`,
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
      
      if (nextIndex >= BLOCK_STACK.length) {
        console.log('[skip_block] Это был последний блок, завершаем');
        await updateSession(from.id, { step: STEPS.COMPLETED });
        
        // Сохраняем итоговый профиль пользователя
        let profileSummary = '';
        try {
          const completedBlocks = await getCompletedBlocks(chat.id);
          const profile = {
            completed_at: new Date().toISOString(),
            user_data: session.collected_data,
            blocks: completedBlocks.map((b) => ({
              block_id: b.block_id,
              json_payload: b.json_payload,
              completed_at: b.created_at,
            })),
          };
          await saveUserProfile(from.id, profile);
          
          profileSummary = formatProfileSummary(profile);
        } catch (err) {
          console.error('Ошибка сохранения профиля:', err.message);
          profileSummary = '<i>Профиль сохранён. Итоговый отчёт временно недоступен.</i>';
        }
        
        const completionMessage = `<b>${BRAND.name}</b>\n<i>Анализ завершён.</i>\n${divider()}\n\n${profileSummary}`;
        const messageParts = splitTelegramMessages(completionMessage);
        
        return {
          text: messageParts[0],
          extraMessages: messageParts.slice(1),
          keyboard: completedKeyboard(),
        };
      }

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обновляем индекс блока И очищаем блочные данные
      // чтобы следующий блок начался с чистого состояния
      console.log(`[skip_block] Переходим к блоку с индексом ${nextIndex}`);
      
      // Очищаем данные пропущенного блока из collected_data
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
          text: 'Не удалось перейти к следующему этапу. Повторите попытку.',
          keyboard: menu.keyboard,
        };
      }
      
      // Формируем текст для следующего блока
      const nextBlockText = await blockPrepText(freshSession, chat.id);
      const nextBlockKeyboard = blockPrepKeyboard(nextBlock.id, freshSession.collected_data);
      
      return {
        text: `<i>Этап ${block.id} пропущен.</i>\n\n${nextBlockText}`,
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
          text: `<b>${BRAND.name}</b>\n<i>Анализ завершён.</i>`,
          keyboard: completedKeyboard(),
        };
      }
      
      const files = await getEffectiveBlockFiles(chat.id, block);
      const userText = session.collected_data?.block_user_text?.[block.id];

      if (block.requiresExternal && files.length === 0 && !userText) {
        const text = await blockPrepText(session, chat.id);
        return {
          text: `${text}\n\n<i>Для этого этапа требуется файл или текстовое описание данных.</i>`,
          keyboard: blockPrepKeyboard(block.id, session.collected_data),
        };
      }
      return runCurrentBlock(from, chat.id);
    }

    case 'retry_block': {
      if (session.step !== STEPS.BLOCK_FAILED) {
        return await safeResumePrompt(session, from.id);
      }
      await updateSession(from.id, { step: STEPS.BLOCK_PREP });
      session = await getSession(from.id);
      return await showBlockPrep(session, chat.id);
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
      const { formatForTelegram } = await import('../ai/formatResponse.js');

      // Получаем контекст сессии
      const sessionMessages = await getChatMessagesForAI(chat.id, session.session_start_at);
      
      // Убираем ТОЛЬКО служебные сообщения "[служебно] запрос блока"
      // НО СОХРАНЯЕМ полные ответы ассистента (с JSON и метакомментариями)
      const cleanedMessages = sessionMessages.filter(msg => {
        // Убираем служебные сообщения "[служебно] запрос блока"
        if (msg.role === 'user' && msg.content.includes('[служебно]')) {
          return false;
        }
        return true;
      });

      const systemPrompt = await getSystemPrompt();
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
        return {
          text: `Ошибка получения ответа · ${err.message}\n\nПовторите запрос или перейдите к следующему этапу.`,
          keyboard: nextBlockKeyboard(),
        };
      }

      // Сохраняем ответ ИИ
      await saveChatMessages(chat.id, [
        { role: 'assistant', content: aiResponse },
      ]);
      
      console.log(`[quick_question] Ответ сохранён, возвращаем пользователю`);

      // Форматируем ответ для пользователя (убираем JSON, конвертируем markdown)
      const formattedResponse = formatForTelegram(aiResponse, 50000);
      const chunks = splitTelegramMessages(formattedResponse);
      
      console.log(`[quick_question] Chunks: ${chunks.length}, остаёмся в BLOCK_REVIEW`);

      return {
        text: chunks[0],
        extraMessages: chunks.slice(1),
        keyboard: nextBlockKeyboard(),
      };
    }

    case 'next_block': {
      console.log(`[next_block] userId=${from.id}, session.step=${session.step}, block_index=${session.block_index}`);
      
      if (session.step !== STEPS.BLOCK_REVIEW) {
        console.log(`[next_block] Неверный шаг, ожидался BLOCK_REVIEW`);
        return await safeResumePrompt(session, from.id);
      }
      
      const nextIndex = session.block_index + 1;
      console.log(`[next_block] Переход к блоку с индексом ${nextIndex}/${BLOCK_STACK.length}`);
      
      if (nextIndex >= BLOCK_STACK.length) {
        console.log(`[next_block] Это был последний блок, завершаем анализ`);
        await updateSession(from.id, { step: STEPS.COMPLETED });
        
        // Сохраняем итоговый профиль пользователя
        let profileSummary = '';
        try {
          const completedBlocks = await getCompletedBlocks(chat.id);
          const profile = {
            completed_at: new Date().toISOString(),
            user_data: session.collected_data,
            blocks: completedBlocks.map((block) => ({
              block_id: block.block_id,
              json_payload: block.json_payload,
              completed_at: block.created_at,
            })),
          };
          await saveUserProfile(from.id, profile);
          
          // Форматируем профиль для вывода пользователю
          profileSummary = formatProfileSummary(profile);
        } catch (err) {
          console.error('Ошибка сохранения профиля:', err.message);
          profileSummary = '<i>Профиль сохранён. Итоговый отчёт временно недоступен.</i>';
        }
        
        const completionMessage = `<b>${BRAND.name}</b>\n<i>Анализ завершён.</i>\n${divider()}\n\n${profileSummary}`;
        
        // Разбиваем на части если сообщение слишком длинное
        const messageParts = splitTelegramMessages(completionMessage);
        
        return {
          text: messageParts[0],
          extraMessages: messageParts.slice(1),
          keyboard: completedKeyboard(),
        };
      }

      await updateSession(from.id, {
        block_index: nextIndex,
        step: STEPS.BLOCK_PREP,
      });
      session = await getSession(from.id);
      return await showBlockPrep(session, chat.id);
    }

    default:
      return rejectWrongInput(session, REJECT_TEXT);
  }
}

async function runCurrentBlock(from, chatId) {
  const userId = from.id;
  let session = await getSession(userId);

  if (session.step === STEPS.BLOCK_RUNNING) {
    return {
      text: '<i>Этап уже выполняется. Дождитесь завершения расчёта.</i>',
      keyboard: runningKeyboard(),
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

    const parts = splitForTelegramWithKeyboard(userMessage, nextBlockKeyboard());

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
      text: `Ошибка этапа ${blockId} · ${err.message}\n\nПовторите этап или вернитесь в меню.`,
      keyboard: blockFailedKeyboard(),
    };
  }
}

export async function handleText(from, rawText) {
  const { chat, session: initialSession } = await ensureSession(from);
  
  // Перечитываем сессию из БД чтобы убедиться что у нас актуальное состояние
  const session = await getSession(from.id);
  const step = session.step;

  if (!TEXT_INPUT_STEPS.has(step)) {
    if (step === STEPS.BLOCK_RUNNING) {
      return {
        text: '<i>Выполняется расчёт этапа. Пожалуйста, подождите.</i>',
        keyboard: runningKeyboard(),
      };
    }
    // Убираем хинты для BLOCK_REVIEW — там текст разрешён
    const hints = {
      [STEPS.GENDER]: 'На этом шаге выберите пол с помощью кнопок.',
      [STEPS.CONFIRM]: 'Подтвердите данные кнопкой ниже.',
      [STEPS.BLOCK_FAILED]: 'Повторите этап или вернитесь в главное меню.',
    };
    return await rejectWrongInput(session, hints[step] ?? REJECT_TEXT, from.id);
  }

  switch (step) {
    case STEPS.BIRTH_DATE: {
      const v = validateBirthDate(rawText);
      if (!v.ok) return { text: v.error, keyboard: textInputKeyboard() };
      const data = mergeCollectedData(session, { birth_date: v.value });
      await updateSession(from.id, { step: STEPS.BIRTH_TIME, collected_data: data });
      return {
        text: `${onboardingHeader(3, 4, 'Время рождения')}\n\nФормат · ЧЧ:ММ или «${btn('ru', 'timeUnknown')}».`,
        keyboard: birthTimeKeyboard(),
      };
    }

    case STEPS.BIRTH_TIME: {
      const v = validateBirthTime(rawText);
      if (!v.ok) return { text: v.error, keyboard: birthTimeKeyboard() };
      const data = mergeCollectedData(session, { birth_time: v.value });
      await updateSession(from.id, { step: STEPS.BIRTH_PLACE, collected_data: data });
      return {
        text: `${onboardingHeader(4, 4, 'Место рождения')}\n\nГород или населённый пункт.`,
        keyboard: textInputKeyboard(),
      };
    }

    case STEPS.BIRTH_PLACE: {
      const v = validateBirthPlace(rawText);
      if (!v.ok) return { text: v.error, keyboard: textInputKeyboard() };
      const data = mergeCollectedData(session, { birth_place: v.value });
      await updateSession(from.id, { step: STEPS.CONFIRM, collected_data: data });
      return {
        text: `${formatProfile(data)}\n\n<i>Проверьте данные перед началом анализа.</i>`,
        keyboard: confirmKeyboard(),
      };
    }

    case STEPS.BLOCK_PREP: {
      // Пользователь отвечает на уточняющие вопросы ИИ или предоставляет данные
      // Сохраняем текст как "дополнительную информацию" для блока
      const block = currentBlock(session);
      if (!block) {
        return { text: 'Стек блоков завершён.', keyboard: completedKeyboard() };
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
      const updatedText = await blockPrepText(updatedSession, chat.id);
      
      return {
        text: `<i>Данные сохранены.</i>\n\n${updatedText}`,
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
      const { formatForTelegram } = await import('../ai/formatResponse.js');

      // Получаем контекст сессии
      const sessionMessages = await getChatMessagesForAI(chat.id, session.session_start_at);
      
      // Убираем ТОЛЬКО служебные сообщения "[служебно] запрос блока"
      // НО СОХРАНЯЕМ полные ответы ассистента (с JSON и метакомментариями)
      const cleanedMessages = sessionMessages.filter(msg => {
        // Убираем служебные сообщения "[служебно] запрос блока"
        if (msg.role === 'user' && msg.content.includes('[служебно]')) {
          return false;
        }
        return true;
      });

      const systemPrompt = await getSystemPrompt();
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
          text: `Ошибка получения ответа · ${err.message}\n\nПовторите запрос или перейдите к следующему этапу.`,
          keyboard: nextBlockKeyboard(),
        };
      }

      // Сохраняем ответ ИИ
      await saveChatMessages(chat.id, [
        { role: 'assistant', content: aiResponse },
      ]);
      
      console.log(`[handleText BLOCK_REVIEW] Ответ сохранён в БД`);

      // Форматируем ответ для пользователя (убираем JSON, конвертируем markdown)
      const formattedResponse = formatForTelegram(aiResponse, 50000);
      const chunks = splitTelegramMessages(formattedResponse);
      
      console.log(`[handleText BLOCK_REVIEW] Возвращаем ответ пользователю, chunks: ${chunks.length}, остаёмся в BLOCK_REVIEW`);

      return {
        text: chunks[0],
        extraMessages: chunks.slice(1),
        keyboard: nextBlockKeyboard(),
      };
    }

    default:
      return await rejectWrongInput(session, REJECT_TEXT, from.id);
  }
}

export async function handleFile(from, fileId, fileType = 'photo', fileName = null, mimeType = null) {
  const { chat, session } = await ensureSession(from);

  if (session.step !== STEPS.BLOCK_PREP) {
    return await rejectWrongInput(
      session,
      'Файлы принимаются только на экране этапа после подтверждения профиля. Запустите анализ из главного меню.',
      from.id
    );
  }

  const block = currentBlock(session);
  if (!block) {
    return { text: 'Стек блоков завершён.', keyboard: completedKeyboard() };
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
    return await showBlockPrep(updatedSession, chat.id);
  } catch (err) {
    console.error('Ошибка загрузки файла:', err.message);
    return {
      text: `Ошибка · ${err.message}\n\nПовторите загрузку файла.`,
      keyboard: blockPrepKeyboard(block.id, session.collected_data),
    };
  }
}

export async function sendScenarioReply(ctx, payload) {
  if (!payload?.text) {
    console.error('[sendScenarioReply] пустой payload:', payload);
    await ctx
      .reply('Не удалось сформировать ответ. Отправьте /start и повторите.')
      .catch(() => {});
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
