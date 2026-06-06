import { BLOCK_STACK, STEPS, TEXT_INPUT_STEPS, REJECT_TEXT, CALLBACK_PREFIX } from '../scenario/constants.js';
import { splitTelegramMessages } from '../ai/formatResponse.js';
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
  mergeCollectedData,
  recoverStaleBlockRunning,
} from '../db/sessions.js';
import { saveUserFile, getBlockFiles, deleteAllChatFiles } from '../db/files.js';
import { uploadTelegramFileToStorage, extractTextFromFile } from './fileStorage.js';
import { runAnalysisBlock } from './blockRunner.js';
import { formatCalculatorLinksText, getAllCalculatorLinks } from '../scenario/calculatorLinks.js';
import { getCompletedBlocks } from '../db/blockResults.js';
import { saveChatMessages, getChatMessagesForAI } from '../db/chats.js';

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

function genderLabel(value) {
  return value === 'male' ? 'Мужской' : 'Женский';
}

function formatProfile(data) {
  return [
    '📋 Данные оператора:',
    `• Пол: ${data.gender_label ?? '—'}`,
    `• Дата: ${data.birth_date ?? '—'}`,
    `• Время: ${data.birth_time ?? '—'}`,
    `• Место: ${data.birth_place ?? '—'}`,
  ].join('\n');
}

function currentBlock(session) {
  return BLOCK_STACK[session.block_index];
}

async function blockPrepText(session, chatId) {
  const block = currentBlock(session);
  if (!block) {
    return 'Стек блоков завершён.';
  }

  // Получаем файлы из БД
  let ownFiles = [];
  try {
    ownFiles = await getBlockFiles(chatId, block.id);
  } catch (err) {
    console.error('Ошибка получения файлов:', err.message);
  }

  // Для блока 3B проверяем также файлы блока 3
  let block3Files = [];
  if (block.id === '3B' && ownFiles.length === 0) {
    try {
      block3Files = await getBlockFiles(chatId, '3');
    } catch (err) {
      console.error('Ошибка получения файлов блока 3:', err.message);
    }
  }

  let fileLine;
  if (ownFiles.length > 0) {
    const fileNames = ownFiles.map(f => {
      const icon = f.file_type === 'image' ? '📷' : '📄';
      return `${icon} ${f.file_name || 'Файл'}`;
    }).join(', ');
    fileLine = `📎 Прикреплено файлов: ${ownFiles.length} (${fileNames})`;
  } else if (block3Files.length > 0) {
    fileLine = `📎 Используются файлы блока 3 (${block3Files.length}). Можно добавить свои.`;
  } else if (block.requiresExternal) {
    fileLine =
      block.id === '3B'
        ? '📎 Нужен файл (скрин/документ) ИЛИ текст с описанием данных.'
        : '📎 Файл (скрин/документ/PDF) ИЛИ текст с описанием — обязательно.';
  } else {
    fileLine = '📎 Файл (скрин/документ/PDF) ИЛИ текст — по желанию.';
  }

  // Проверяем есть ли текст от пользователя
  const userText = session.collected_data?.block_user_text?.[block.id];
  let textLine = null;
  if (userText) {
    const preview = userText.length > 100 ? userText.slice(0, 100) + '...' : userText;
    textLine = `💬 Твой текст: "${preview}"`;
  }

  const calcBlock = formatCalculatorLinksText(block.id, session.collected_data);

  return [
    block.description,
    '',
    calcBlock || null,
    calcBlock ? '' : null,
    fileLine,
    textLine || null,
    '',
    '💡 Можешь:',
    '• Написать текстом (описать данные, ответить на вопросы)',
    '• Прикрепить файл (скрин калькулятора, документ)',
    '• Или и то и другое',
    '',
    'Когда готов — нажми «Запустить блок».',
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

function rejectWrongInput(session, hint) {
  if (hasAnalysisProgress(session) && session.step !== STEPS.MENU) {
    const payload = resumePrompt(session);
    return {
      text: `${hint}\n\n${payload.text}`,
      keyboard: payload.keyboard,
    };
  }
  return { text: hint, keyboard: menuKeyboard() };
}

export async function initUser(from) {
  const { chat, session } = await ensureSession(from);
  
  // При /start всегда сбрасываем сессию, контекст ИИ и удаляем все файлы
  await resetSession(from.id, chat.id);
  await deleteAllChatFiles(chat.id);
  
  return showMenu();
}

function showMenu() {
  return {
    text: 'Lapis Vivus — анализ по фиксированному протоколу.\n\nВыбери действие кнопкой ниже. Свободный ввод не используется.',
    keyboard: menuKeyboard(),
  };
}

function resumePrompt(session) {
  session = recoverStaleBlockRunning(session);
  const step = session.step;
  
  const messages = {
    [STEPS.GENDER]: { text: 'Выбери пол:', keyboard: genderKeyboard() },
    [STEPS.BIRTH_DATE]: { text: 'Введи дату рождения: ДД.ММ.ГГГГ', keyboard: textInputKeyboard() },
    [STEPS.BIRTH_TIME]: {
      text: 'Введи время рождения ЧЧ:ММ или нажми кнопку.',
      keyboard: birthTimeKeyboard(),
    },
    [STEPS.BIRTH_PLACE]: {
      text: 'Введи город или населённый пункт рождения (например: Москва, Санкт-Петербург):',
      keyboard: textInputKeyboard(),
    },
    [STEPS.CONFIRM]: {
      text: formatProfile(session.collected_data),
      keyboard: confirmKeyboard(),
    },
    [STEPS.BLOCK_PREP]: { text: 'Подготовка блока...', keyboard: null },
    [STEPS.BLOCK_FAILED]: {
      text: `Блок ${session.last_block_id ?? ''} не выполнен. Повтори или вернись в меню.`,
      keyboard: blockFailedKeyboard(),
    },
    [STEPS.BLOCK_RUNNING]: {
      text: '⏳ Выполняется блок анализа. Подожди…',
      keyboard: runningKeyboard(),
    },
    [STEPS.BLOCK_REVIEW]: {
      text: `Блок ${session.last_block_id ?? ''} завершён. Нажми «Следующий блок».`,
      keyboard: nextBlockKeyboard(),
    },
    [STEPS.COMPLETED]: {
      text: '✅ Полный стек блоков завершён.',
      keyboard: completedKeyboard(),
    },
  };

  return messages[step] ?? showMenu();
}

export async function handleCallback(from, callbackData) {
  let { chat, session } = await ensureSession(from);
  
  // Перечитываем сессию из БД чтобы убедиться что у нас актуальное состояние
  session = await getSession(from.id);
  
  const parsed = parseCallbackData(callbackData);
  if (!parsed) {
    return rejectWrongInput(session, REJECT_TEXT);
  }

  switch (parsed.action) {
    case 'menu':
      await resetSession(from.id, chat.id);
      await deleteAllChatFiles(chat.id);
      return showMenu();

    case 'links': {
      const linksText = [
        '🔗 **Полезные ссылки на калькуляторы:**',
        '',
        'Нажми на кнопку ниже, чтобы перейти к калькулятору.',
      ].join('\n');
      
      const links = getAllCalculatorLinks();
      const urlButtons = [];
      for (let i = 0; i < links.length; i += 2) {
        urlButtons.push(links.slice(i, i + 2).map((l) => ({
          text: l.label,
          url: l.url,
        })));
      }
      urlButtons.push([{ text: '📋 Меню', callback_data: cb('menu') }]);
      
      return { 
        text: linksText, 
        keyboard: { inline_keyboard: urlButtons } 
      };
    }

    case 'reset':
      await resetSession(from.id, chat.id);
      await deleteAllChatFiles(chat.id);
      return {
        text: 'Сессия сброшена. Можно начать новый анализ.',
        keyboard: menuKeyboard(),
      };

    case 'start': {
      // При нажатии "Начать анализ" всегда сбрасываем сессию, контекст ИИ и удаляем файлы
      await resetSession(from.id, chat.id);
      await deleteAllChatFiles(chat.id);
      await updateSession(from.id, {
        step: STEPS.GENDER,
        collected_data: {},
        block_index: 0,
        last_block_id: null,
        session_start_at: new Date().toISOString(),
      });
      return { text: 'Шаг 1/4. Выбери пол:', keyboard: genderKeyboard() };
    }

    case 'gender': {
      if (session.step !== STEPS.GENDER) {
        return resumePrompt(session);
      }
      const data = mergeCollectedData(session, {
        gender: parsed.value,
        gender_label: genderLabel(parsed.value),
      });
      await updateSession(from.id, { step: STEPS.BIRTH_DATE, collected_data: data });
      return { text: 'Шаг 2/4. Дата рождения (ДД.ММ.ГГГГ):', keyboard: null };
    }

    case 'time_unknown': {
      if (session.step !== STEPS.BIRTH_TIME) {
        return resumePrompt(session);
      }
      const data = mergeCollectedData(session, { birth_time: 'неизвестно' });
      await updateSession(from.id, { step: STEPS.BIRTH_PLACE, collected_data: data });
      return { text: 'Шаг 4/4. Город рождения:', keyboard: null };
    }

    case 'confirm_edit':
      await updateSession(from.id, {
        step: STEPS.GENDER,
        collected_data: {},
        block_index: 0,
        last_block_id: null,
      });
      return { text: 'Начнём заново. Выбери пол:', keyboard: genderKeyboard() };

    case 'confirm_yes': {
      if (session.step !== STEPS.CONFIRM) {
        return resumePrompt(session);
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
        return resumePrompt(session);
      }
      const block = currentBlock(session);
      if (!block) {
        await updateSession(from.id, { step: STEPS.COMPLETED });
        return {
          text: '✅ Анализ по всем блокам завершён.',
          keyboard: completedKeyboard(),
        };
      }

      // Сохраняем пустой JSON для блока (чтобы оператор знал что блок пропущен)
      const { saveBlockResult } = await import('../db/blockResults.js');
      const skippedJson = {
        status: 'skipped',
        block_id: block.id,
        skipped_at: new Date().toISOString(),
        reason: 'Пропущено оператором',
      };

      await saveBlockResult({
        chatId: chat.id,
        userId: from.id,
        blockId: block.id,
        responseText: `[ПРОПУЩЕНО] Блок ${block.id} пропущен оператором`,
        jsonPayload: skippedJson,
      });

      // Переход к следующему блоку
      const nextIndex = session.block_index + 1;
      if (nextIndex >= BLOCK_STACK.length) {
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
          
          profileSummary = formatProfileSummary(profile);
        } catch (err) {
          console.error('Ошибка сохранения профиля:', err.message);
          profileSummary = '⚠️ Профиль сохранён, но не удалось сформировать резюме.';
        }
        
        const completionMessage = `✅ Анализ по всем блокам завершён.\n\n${profileSummary}`;
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
        last_block_id: block.id,
      });
      
      const newSession = await getSession(from.id);
      const prepPayload = await showBlockPrep(newSession, chat.id);
      
      return {
        text: `⏭ Блок ${block.id} пропущен (данные сохранены в БД).\n\n${prepPayload.text}`,
        keyboard: prepPayload.keyboard,
      };
    }

    case 'run_block': {
      if (session.step !== STEPS.BLOCK_PREP) {
        console.log(`[run_block] Неверный шаг. Ожидался: ${STEPS.BLOCK_PREP}, получен: ${session.step}`);
        return resumePrompt(session);
      }
      const block = currentBlock(session);
      if (!block) {
        await updateSession(from.id, { step: STEPS.COMPLETED });
        return {
          text: '✅ Анализ по всем блокам завершён.',
          keyboard: completedKeyboard(),
        };
      }
      
      // Проверяем файлы в БД
      const files = await getBlockFiles(chat.id, block.id);
      const userText = session.collected_data?.block_user_text?.[block.id];
      
      // Если блок требует внешние данные, нужен хотя бы файл ИЛИ текст
      if (block.requiresExternal && files.length === 0 && !userText) {
        const text = await blockPrepText(session, chat.id);
        return {
          text: `${text}\n\n⚠️ Для этого блока нужен хотя бы один файл (скрин/документ) или текст с ответами.`,
          keyboard: blockPrepKeyboard(block.id, session.collected_data),
        };
      }
      return runCurrentBlock(from, chat.id);
    }

    case 'retry_block': {
      if (session.step !== STEPS.BLOCK_FAILED) {
        return resumePrompt(session);
      }
      await updateSession(from.id, { step: STEPS.BLOCK_PREP });
      session = await getSession(from.id);
      return await showBlockPrep(session, chat.id);
    }

    case 'quick_question': {
      // Обновляем сессию из БД на случай если она изменилась
      session = await getSession(from.id);
      
      if (session.step !== STEPS.BLOCK_REVIEW) {
        return resumePrompt(session);
      }

      // Статичные вопросы (не генерируются ИИ)
      const quickQuestions = [
        'Как мне применить эту информацию в жизни?',
        'Расскажи подробнее об этом блоке',
        'Что конкретно это значит для меня?',
      ];

      const questionIndex = parseInt(parsed.value, 10);
      const selectedQuestion = quickQuestions[questionIndex];

      if (!selectedQuestion) {
        return rejectWrongInput(session, 'Вопрос не найден.');
      }

      // Отправляем вопрос в ИИ как обычное сообщение пользователя
      await saveChatMessages(chat.id, [
        { role: 'user', content: selectedQuestion },
      ]);

      // Получаем ответ от ИИ
      const { askGpt } = await import('../ai/gptunnel.js');
      const { getSystemPrompt } = await import('../prompts/loadSystemPrompt.js');
      const { extractMetacomments } = await import('../ai/formatResponse.js');

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

      const messages = [
        { role: 'system', content: getSystemPrompt() },
        ...cleanedMessages,
      ];

      let aiResponse;
      try {
        aiResponse = await askGpt(messages);
      } catch (err) {
        console.error('Ошибка ИИ на quick question:', err.message);
        return {
          text: `❌ Ошибка получения ответа: ${err.message}\n\nПопробуй ещё раз или нажми «Следующий блок».`,
          keyboard: nextBlockKeyboard(),
        };
      }

      // Сохраняем ответ ИИ
      await saveChatMessages(chat.id, [
        { role: 'assistant', content: aiResponse },
      ]);

      // Форматируем ответ для пользователя (убираем JSON, конвертируем markdown)
      const formattedResponse = extractMetacomments(aiResponse, 50000);
      const chunks = splitTelegramMessages(formattedResponse);

      return {
        text: chunks[0],
        extraMessages: chunks.slice(1),
        keyboard: nextBlockKeyboard(),
      };
    }

    case 'next_block': {
      if (session.step !== STEPS.BLOCK_REVIEW) {
        return resumePrompt(session);
      }
      const nextIndex = session.block_index + 1;
      if (nextIndex >= BLOCK_STACK.length) {
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
          profileSummary = '⚠️ Профиль сохранён, но не удалось сформировать резюме.';
        }
        
        const completionMessage = `✅ Анализ по всем блокам завершён.\n\n${profileSummary}`;
        
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
      text: 'Блок уже выполняется. Подожди завершения.',
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

    const chunks = splitTelegramMessages(userMessage);
    
    // Добавляем подсказку что можно задать вопросы
    const hintText = '\n\n💬 Можешь задать вопросы по результату или нажать «Следующий блок»';
    const firstChunk = chunks[0] + hintText;

    return {
      text: firstChunk,
      extraMessages: chunks.slice(1),
      keyboard: nextBlockKeyboard(),
    };
  } catch (err) {
    console.error('Ошибка блока:', err.message);
    const blockId = BLOCK_STACK[session.block_index]?.id ?? '?';
    await updateSession(userId, {
      step: STEPS.BLOCK_FAILED,
      last_block_id: blockId,
    });
    return {
      text: `Ошибка блока ${blockId}: ${err.message}\n\nИндекс блока не изменён — нажми «Повторить блок».`,
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
        text: 'Идёт расчёт блока. Подожди завершения (до 2 минут).',
        keyboard: runningKeyboard(),
      };
    }
    // Убираем хинты для BLOCK_REVIEW — там текст разрешён
    const hints = {
      [STEPS.GENDER]: 'На этом шаге выбери пол кнопкой.',
      [STEPS.CONFIRM]: 'Подтверди данные кнопкой ниже.',
      [STEPS.BLOCK_FAILED]: 'Нажми «Повторить блок» или вернись в меню.',
    };
    return rejectWrongInput(session, hints[step] ?? REJECT_TEXT);
  }

  switch (step) {
    case STEPS.BIRTH_DATE: {
      const v = validateBirthDate(rawText);
      if (!v.ok) return { text: v.error, keyboard: textInputKeyboard() };
      const data = mergeCollectedData(session, { birth_date: v.value });
      await updateSession(from.id, { step: STEPS.BIRTH_TIME, collected_data: data });
      return {
        text: 'Шаг 3/4. Время рождения (ЧЧ:ММ) или кнопка «неизвестно»:',
        keyboard: birthTimeKeyboard(),
      };
    }

    case STEPS.BIRTH_TIME: {
      const v = validateBirthTime(rawText);
      if (!v.ok) return { text: v.error, keyboard: birthTimeKeyboard() };
      const data = mergeCollectedData(session, { birth_time: v.value });
      await updateSession(from.id, { step: STEPS.BIRTH_PLACE, collected_data: data });
      return { text: 'Шаг 4/4. Город рождения:', keyboard: textInputKeyboard() };
    }

    case STEPS.BIRTH_PLACE: {
      const v = validateBirthPlace(rawText);
      if (!v.ok) return { text: v.error, keyboard: textInputKeyboard() };
      const data = mergeCollectedData(session, { birth_place: v.value });
      await updateSession(from.id, { step: STEPS.CONFIRM, collected_data: data });
      return {
        text: `${formatProfile(data)}\n\nПодтверди данные:`,
        keyboard: confirmKeyboard(),
      };
    }

    case STEPS.BLOCK_PREP: {
      // Пользователь отвечает на уточняющие вопросы ИИ
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

      return {
        text: '✅ Ответ сохранён.\n\nМожешь добавить ещё текст, прикрепить файл или запустить блок.',
        keyboard: blockPrepKeyboard(block.id, data),
      };
    }

    case STEPS.BLOCK_REVIEW: {
      // Пользователь задаёт свой вопрос (свободный текст)
      const blockId = session.last_block_id;
      
      if (!blockId) {
        return rejectWrongInput(session, 'Блок не найден.');
      }

      // Отправляем вопрос пользователя в ИИ как обычное сообщение
      await saveChatMessages(chat.id, [
        { role: 'user', content: rawText },
      ]);

      // Получаем ответ от ИИ
      const { askGpt } = await import('../ai/gptunnel.js');
      const { getSystemPrompt } = await import('../prompts/loadSystemPrompt.js');
      const { extractMetacomments } = await import('../ai/formatResponse.js');

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

      const messages = [
        { role: 'system', content: getSystemPrompt() },
        ...cleanedMessages,
      ];

      let aiResponse;
      try {
        aiResponse = await askGpt(messages);
      } catch (err) {
        console.error('Ошибка ИИ на текстовый вопрос:', err.message);
        return {
          text: `❌ Ошибка получения ответа: ${err.message}\n\nПопробуй ещё раз или нажми «Следующий блок».`,
          keyboard: nextBlockKeyboard(),
        };
      }

      // Сохраняем ответ ИИ
      await saveChatMessages(chat.id, [
        { role: 'assistant', content: aiResponse },
      ]);

      // Форматируем ответ для пользователя (убираем JSON, конвертируем markdown)
      const formattedResponse = extractMetacomments(aiResponse, 50000);
      const chunks = splitTelegramMessages(formattedResponse);

      return {
        text: chunks[0],
        extraMessages: chunks.slice(1),
        keyboard: nextBlockKeyboard(),
      };
    }

    default:
      return rejectWrongInput(session, REJECT_TEXT);
  }
}

export async function handleFile(from, fileId, fileType = 'photo', fileName = null, mimeType = null) {
  const { chat, session } = await ensureSession(from);

  if (session.step !== STEPS.BLOCK_PREP) {
    return rejectWrongInput(
      session,
      '📎 Файлы принимаются только на экране блока (после подтверждения данных). Нажми «Начать анализ» в меню.',
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
      text: `❌ Ошибка: ${err.message}\n\nПопробуй загрузить файл заново.`,
      keyboard: blockPrepKeyboard(block.id, session.collected_data),
    };
  }
}

export async function sendScenarioReply(ctx, payload) {
  const { text, keyboard, extraMessages } = payload;

  // Отправляем с Markdown форматированием
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });

  if (extraMessages?.length) {
    for (const part of extraMessages) {
      const partText = typeof part === 'string' ? part : part.text;
      const partKb = typeof part === 'string' ? undefined : part.keyboard;
      await ctx.reply(partText, {
        parse_mode: 'Markdown',
        reply_markup: partKb,
      });
    }
  }
}
