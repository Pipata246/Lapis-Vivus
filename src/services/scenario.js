import { BLOCK_STACK, STEPS, TEXT_INPUT_STEPS, REJECT_TEXT } from '../scenario/constants.js';
import { splitTelegramMessages } from '../ai/formatResponse.js';
import {
  parseCallbackData,
  validateBirthDate,
  validateBirthTime,
  validateBirthPlace,
  getBlockAttachments,
  getBlockFilesForRun,
  saveBlockAttachment,
  hasRequiredFiles,
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
} from '../scenario/keyboards.js';
import { getOrCreateUserChat } from '../db/chats.js';
import { upsertUserFromTelegram } from '../db/users.js';
import {
  getSession,
  upsertSession,
  resetSession,
  updateSession,
  mergeCollectedData,
} from '../db/sessions.js';
import { runAnalysisBlock } from './blockRunner.js';

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

  return [
    block.description,
    '',
    fileLine,
    '',
    'Когда готов — нажми «Запустить блок».',
  ].join('\n');
}

function showBlockPrep(session) {
  return {
    text: blockPrepText(session),
    keyboard: blockPrepKeyboard(),
  };
}

async function ensureSession(from) {
  await upsertUserFromTelegram(from);
  const chat = await getOrCreateUserChat(from.id);
  let session = await getSession(from.id);

  if (!session) {
    session = await resetSession(from.id, chat.id);
  }

  return { chat, session };
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
  const step = session.step;
  const messages = {
    [STEPS.GENDER]: { text: 'Выбери пол:', keyboard: genderKeyboard() },
    [STEPS.BIRTH_DATE]: { text: 'Введи дату рождения: ДД.ММ.ГГГГ', keyboard: null },
    [STEPS.BIRTH_TIME]: {
      text: 'Введи время рождения ЧЧ:ММ или нажми кнопку.',
      keyboard: birthTimeKeyboard(),
    },
    [STEPS.BIRTH_PLACE]: { text: 'Введи город рождения:', keyboard: null },
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
  const parsed = parseCallbackData(callbackData);
  if (!parsed) {
    return { text: REJECT_TEXT, keyboard: menuKeyboard() };
  }

  let { chat, session } = await ensureSession(from);

  switch (parsed.action) {
    case 'menu':
      await resetSession(from.id, chat.id);
      return showMenu();

    case 'reset':
      await resetSession(from.id, chat.id);
      return {
        text: 'Сессия сброшена. Можно начать новый анализ.',
        keyboard: menuKeyboard(),
      };

    case 'start':
      await updateSession(from.id, { step: STEPS.GENDER, collected_data: {} });
      return { text: 'Шаг 1/4. Выбери пол:', keyboard: genderKeyboard() };

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
          keyboard: blockPrepKeyboard(),
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
        return {
          text: '✅ Анализ по всем блокам завершён.',
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
      return { text: REJECT_TEXT, keyboard: menuKeyboard() };
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

  await updateSession(userId, { step: STEPS.BLOCK_RUNNING });

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
        text: 'Идёт расчёт блока. Подожди завершения.',
        keyboard: runningKeyboard(),
      };
    }
    if (step === STEPS.BLOCK_PREP) {
      return {
        text: `${blockPrepText(session)}\n\nТекст на этом шаге не принимается. Прикрепи файл или нажми «Запустить блок».`,
        keyboard: blockPrepKeyboard(),
      };
    }
    return { text: REJECT_TEXT, keyboard: menuKeyboard() };
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
      return { text: REJECT_TEXT, keyboard: menuKeyboard() };
  }
}

export async function handleFile(from, fileId) {
  const { session } = await ensureSession(from);

  if (session.step !== STEPS.BLOCK_PREP) {
    return { text: REJECT_TEXT, keyboard: menuKeyboard() };
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
      await ctx.reply(part);
    }
  }
}
