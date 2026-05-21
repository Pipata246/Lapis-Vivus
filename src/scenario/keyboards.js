import { CALLBACK_PREFIX } from './constants.js';
import { calculatorUrlButtons } from './calculatorLinks.js';

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

export function menuKeyboard() {
  return {
    inline_keyboard: [[{ text: '🔮 Начать анализ Lapis Vivus', callback_data: cb('start') }]],
  };
}

export function genderKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Мужской', callback_data: cb('gender', 'male') },
        { text: 'Женский', callback_data: cb('gender', 'female') },
      ],
    ],
  };
}

export function birthTimeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '⏳ Время неизвестно', callback_data: cb('time_unknown') }],
    ],
  };
}

export function confirmKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '✅ Всё верно — к первому блоку', callback_data: cb('confirm_yes') },
        { text: '✏️ Изменить данные', callback_data: cb('confirm_edit') },
      ],
    ],
  };
}

export function blockPrepKeyboard(blockId, collectedData = {}) {
  const rows = [];
  const calcButtons = calculatorUrlButtons(blockId, collectedData);

  for (let i = 0; i < calcButtons.length; i += 2) {
    rows.push(calcButtons.slice(i, i + 2));
  }

  rows.push([{ text: '▶️ Запустить блок', callback_data: cb('run_block') }]);

  return { inline_keyboard: rows };
}

export function nextBlockKeyboard() {
  return {
    inline_keyboard: [[{ text: '▶️ Следующий блок', callback_data: cb('next_block') }]],
  };
}

export function blockFailedKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔄 Повторить блок', callback_data: cb('retry_block') }],
      [{ text: '📋 Меню', callback_data: cb('menu') }],
    ],
  };
}

export function completedKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔄 Новый анализ', callback_data: cb('reset') }],
      [{ text: '📋 Меню', callback_data: cb('menu') }],
    ],
  };
}

export function runningKeyboard() {
  return {
    inline_keyboard: [[{ text: '📋 Меню (анализ прервётся)', callback_data: cb('menu') }]],
  };
}
