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
import { runAnalysisBlock } from './blockRunner.js';
import { formatCalculatorLinksText, getAllCalculatorLinks } from '../scenario/calculatorLinks.js';
import { getCompletedBlocks } from '../db/blockResults.js';

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

function blockPrepText(session) {
  const block = currentBlock(session);
  if (!block) {
    return 'Стек блоков завершён.';
  }

  const files = getBlockFilesForRun(session.collected_data, block);
  const ownCount = getBlockAttachments(session.collected_data, block.id).length;
  let fileLine;
  if (files.length > 0) {
    fileLine =
      ownCount > 0
        ? `📎 Прикреплено файлов: ${ownCount}`
        : `📎 Используются файлы блока 3 (${files.length}). Можно добавить свои.`;
  } else if (block.requiresExternal) {
    fileLine =
      block.id === '3B'
        ? '📎 Нужен файл (скрин/документ) или данные блока 3. Текст не принимается.'
        : '📎 Файл обязателен (скрин/документ). Текст на этом шаге не принимается.';
  } else {
    fileLine = '📎 Файл по желанию (необязательно). Текст на этом шаге не принимается.';
  }

  const calcBlock = formatCalculatorLinksText(block.id, session.collected_data);

  return [
    block.description,
    '',
    calcBlock || null,
    calcBlock ? '' : null,
    fileLine,
    '',
    'Когда готов — нажми «Запустить блок».',
  ]
    .filter(Boolean)
    .join('\n');
}

function showBlockPrep(session) {
  const block = currentBlock(session);
  return {
    text: blockPrepText(session),
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
  const { session } = await ensureSession(from);
  if (session.step === STEPS.MENU) {
    return showMenu();
  }
  return resumePrompt(session);
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
    [STEPS.BIRTH_DATE]: { text: 'Введи дату рождения: ДД.ММ.ГГГГ', keyboard: null },
    [STEPS.BIRTH_TIME]: {
      text: 'Введи время рождения ЧЧ:ММ или нажми кнопку.',
      keyboard: birthTimeKeyboard(),
    },
    [STEPS.BIRTH_PLACE]: {
      text: 'Введи город или населённый пункт рождения (например: Москва, Санкт-Петербург):',
      keyboard: null,
    },
    [STEPS.CONFIRM]: {
      text: formatProfile(session.collected_data),
      keyboard: confirmKeyboard(),
    },
    [STEPS.BLOCK_PREP]: showBlockPrep(session),
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
  const parsed = parseCallbackData(callbackData);
  if (!parsed) {
    return rejectWrongInput(session, REJECT_TEXT);
  }

  switch (parsed.action) {
    case 'menu':
      await resetSession(from.id, chat.id);
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
      return {
        text: 'Сессия сброшена. Можно начать новый анализ.',
        keyboard: menuKeyboard(),
      };

    case 'start': {
      if (hasAnalysisProgress(session) && session.step !== STEPS.MENU) {
        const payload = resumePrompt(session);
        return {
          text: `У тебя уже есть незавершённый анализ.\n\n${payload.text}`,
          keyboard: payload.keyboard,
        };
      }
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
      return showBlockPrep(session);
    }

    case 'run_block': {
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
      if (!hasRequiredFiles(session.collected_data, block)) {
        return {
          text: `${blockPrepText(session)}\n\n⚠️ Для этого блока нужен хотя бы один файл (скрин или документ).`,
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
      return showBlockPrep(session);
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
      return showBlockPrep(session);
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

    return {
      text: chunks[0],
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
  const { session } = await ensureSession(from);
  const step = session.step;

  if (!TEXT_INPUT_STEPS.has(step)) {
    if (step === STEPS.BLOCK_RUNNING) {
      return {
        text: 'Идёт расчёт блока. Подожди завершения (до 2 минут).',
        keyboard: runningKeyboard(),
      };
    }
    if (step === STEPS.BLOCK_PREP) {
      const block = currentBlock(session);
      return {
        text: `${blockPrepText(session)}\n\nТекст на этом шаге не принимается. Прикрепи файл или нажми «Запустить блок».`,
        keyboard: blockPrepKeyboard(block?.id, session.collected_data),
      };
    }
    const hints = {
      [STEPS.GENDER]: 'На этом шаге выбери пол кнопкой.',
      [STEPS.CONFIRM]: 'Подтверди данные кнопкой ниже.',
      [STEPS.BLOCK_REVIEW]: 'Нажми «Следующий блок».',
      [STEPS.BLOCK_FAILED]: 'Нажми «Повторить блок» или вернись в меню.',
    };
    return rejectWrongInput(session, hints[step] ?? REJECT_TEXT);
  }

  switch (step) {
    case STEPS.BIRTH_DATE: {
      const v = validateBirthDate(rawText);
      if (!v.ok) return { text: v.error, keyboard: null };
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
      return { text: 'Шаг 4/4. Город рождения:', keyboard: null };
    }

    case STEPS.BIRTH_PLACE: {
      const v = validateBirthPlace(rawText);
      if (!v.ok) return { text: v.error, keyboard: null };
      const data = mergeCollectedData(session, { birth_place: v.value });
      await updateSession(from.id, { step: STEPS.CONFIRM, collected_data: data });
      return {
        text: `${formatProfile(data)}\n\nПодтверди данные:`,
        keyboard: confirmKeyboard(),
      };
    }

    default:
      return rejectWrongInput(session, REJECT_TEXT);
  }
}

export async function handleFile(from, fileId) {
  const { session } = await ensureSession(from);

  if (session.step !== STEPS.BLOCK_PREP) {
    return rejectWrongInput(
      session,
      'Фото принимается на экране блока (перед кнопкой «Запустить блок»), не в анкете.',
    );
  }

  const block = currentBlock(session);
  if (!block) {
    return { text: 'Стек блоков завершён.', keyboard: completedKeyboard() };
  }

  const patch = saveBlockAttachment(session.collected_data, block.id, fileId);
  const data = mergeCollectedData(session, patch);
  await updateSession(from.id, { collected_data: data });

  session = await getSession(from.id);
  return showBlockPrep(session);
}

export async function sendScenarioReply(ctx, payload) {
  const { text, keyboard, extraMessages } = payload;

  await ctx.reply(text, keyboard ? { reply_markup: keyboard } : undefined);

  if (extraMessages?.length) {
    for (const part of extraMessages) {
      const partText = typeof part === 'string' ? part : part.text;
      const partKb = typeof part === 'string' ? undefined : part.keyboard;
      await ctx.reply(partText, partKb ? { reply_markup: partKb } : undefined);
    }
  }
}
