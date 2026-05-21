import { BLOCK_STACK, STEPS, TEXT_INPUT_STEPS, REJECT_TEXT, TELEGRAM_MAX_MESSAGE } from '../scenario/constants.js';
import {
  parseCallbackData,
  validateBirthDate,
  validateBirthTime,
  validateBirthPlace,
  validateExternalDump,
} from '../scenario/validators.js';
import {
  menuKeyboard,
  genderKeyboard,
  birthTimeKeyboard,
  confirmKeyboard,
  nextBlockKeyboard,
  completedKeyboard,
  runningKeyboard,
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

function blockNeedsUpload(blockIndex) {
  const block = BLOCK_STACK[blockIndex];
  return block?.externalKey ?? null;
}

function getUploadStepForKey(key) {
  if (key === 'bazi_dump') return STEPS.BAZI_UPLOAD;
  if (key === 'astro_dump') return STEPS.ASTRO_UPLOAD;
  return null;
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
  const { chat, session } = await ensureSession(from);
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
    [STEPS.BAZI_UPLOAD]: {
      text: 'БЛОК 2 (Бацзы): отправь текстовый дамп расчёта (мин. 50 символов).',
      keyboard: null,
    },
    [STEPS.ASTRO_UPLOAD]: {
      text: 'БЛОК 3 (Астро): отправь текстовый дамп натальной карты (мин. 50 символов).',
      keyboard: null,
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

  const { chat, session } = await ensureSession(from);

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
      await updateSession(from.id, { step: STEPS.GENDER });
      return { text: 'Начнём заново. Выбери пол:', keyboard: genderKeyboard() };

    case 'confirm_yes': {
      if (session.step !== STEPS.CONFIRM) {
        return resumePrompt(session);
      }
      await updateSession(from.id, {
        step: STEPS.BLOCK_RUNNING,
        block_index: 0,
        last_block_id: null,
      });
      return runCurrentBlock(from, chat.id);
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

      const uploadKey = blockNeedsUpload(nextIndex);
      if (uploadKey) {
        const uploadStep = getUploadStepForKey(uploadKey);
        await updateSession(from.id, {
          step: uploadStep,
          block_index: nextIndex,
        });
        const label =
          uploadKey === 'bazi_dump'
            ? 'Бацзы (текстовый дамп)'
            : 'Натальная карта (текстовый дамп)';
        return {
          text: `Перед блоком ${BLOCK_STACK[nextIndex].id}: отправь ${label}.`,
          keyboard: null,
        };
      }

      await updateSession(from.id, {
        step: STEPS.BLOCK_RUNNING,
        block_index: nextIndex,
      });
      return runCurrentBlock(from, chat.id);
    }

    default:
      return { text: REJECT_TEXT, keyboard: menuKeyboard() };
  }
}

async function runCurrentBlock(from, chatId) {
  const userId = from.id;
  let session = await getSession(userId);

  try {
    const { blockId, blockTitle, answer } = await runAnalysisBlock({
      session,
      chatId,
      userId,
    });

    session = await updateSession(userId, {
      step: STEPS.BLOCK_REVIEW,
      last_block_id: blockId,
    });

    const header = `📦 Блок ${blockId}: ${blockTitle}\n\n`;
    const chunks = splitMessage(header + answer);

    return {
      text: chunks[0],
      extraMessages: chunks.slice(1),
      keyboard: nextBlockKeyboard(),
    };
  } catch (err) {
    console.error('Ошибка блока:', err.message);
    await updateSession(userId, { step: STEPS.BLOCK_REVIEW });
    return {
      text: 'Ошибка при выполнении блока. Попробуй «Следующий блок» или начни заново из меню.',
      keyboard: completedKeyboard(),
    };
  }
}

function splitMessage(text) {
  if (text.length <= TELEGRAM_MAX_MESSAGE) {
    return [text];
  }

  const parts = [];
  let rest = text;
  while (rest.length > 0) {
    parts.push(rest.slice(0, TELEGRAM_MAX_MESSAGE));
    rest = rest.slice(TELEGRAM_MAX_MESSAGE);
  }
  return parts;
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
    return { text: REJECT_TEXT, keyboard: menuKeyboard() };
  }

  const { chat } = await ensureSession(from);

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

    case STEPS.BAZI_UPLOAD: {
      const v = validateExternalDump(rawText, 'Бацзы');
      if (!v.ok) return { text: v.error, keyboard: null };
      const data = mergeCollectedData(session, { bazi_dump: v.value });
      await updateSession(from.id, {
        step: STEPS.BLOCK_RUNNING,
        collected_data: data,
      });
      return runCurrentBlock(from, chat.id);
    }

    case STEPS.ASTRO_UPLOAD: {
      const v = validateExternalDump(rawText, 'Астро-геометрия');
      if (!v.ok) return { text: v.error, keyboard: null };
      const data = mergeCollectedData(session, { astro_dump: v.value });
      await updateSession(from.id, {
        step: STEPS.BLOCK_RUNNING,
        collected_data: data,
      });
      return runCurrentBlock(from, chat.id);
    }

    default:
      return { text: REJECT_TEXT, keyboard: menuKeyboard() };
  }
}

export async function handlePhoto(from, caption) {
  const { session } = await ensureSession(from);
  const step = session.step;

  if (step !== STEPS.BAZI_UPLOAD && step !== STEPS.ASTRO_UPLOAD) {
    return { text: REJECT_TEXT, keyboard: menuKeyboard() };
  }

  if (caption?.trim()) {
    return handleText(from, caption);
  }

  return {
    text: 'Скрин без подписи не принимается. Отправь текстовый дамп сообщением или подпись к фото.',
    keyboard: null,
  };
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
