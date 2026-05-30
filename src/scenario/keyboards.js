import { CALLBACK_PREFIX } from './constants.js';
import { calculatorUrlButtons } from './calculatorLinks.js';

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

export function menuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔮 Начать анализ Lapis Vivus', callback_data: cb('start') }],
      [{ text: '🔗 Полезные ссылки', callback_data: cb('links') }],
    ],
  };
}

export function genderKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Мужской', callback_data: cb('gender', 'male') },
        { text: 'Женский', callback_data: cb('gender', 'female') },
      ],
      [{ text: '❌ Отмена', callback_data: cb('menu') }],
    ],
  };
}

export function birthTimeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '⏳ Время неизвестно', callback_data: cb('time_unknown') }],
      [{ text: '❌ Отмена', callback_data: cb('menu') }],
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
      [{ text: '❌ Отмена', callback_data: cb('menu') }],
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
  rows.push([{ text: '❌ Отмена', callback_data: cb('menu') }]);

  return { inline_keyboard: rows };
}

export function nextBlockKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '💡 Как применить?', callback_data: cb('quick_question', '0') },
        { text: '📖 Расскажи подробнее', callback_data: cb('quick_question', '1') },
      ],
      [
        { text: '🔍 Что это значит?', callback_data: cb('quick_question', '2') },
      ],
      [{ text: '▶️ Следующий блок', callback_data: cb('next_block') }],
    ],
  };
}

export function textInputKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '❌ Отмена', callback_data: cb('menu') }],
    ],
  };
}

export function blockFailedKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔄 Повторить блок', callback_data: cb('retry_block') }],
      [{ text: '❌ Отмена', callback_data: cb('menu') }],
    ],
  };
}

export function completedKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔄 Новый анализ', callback_data: cb('reset') }],
      [{ text: '🔗 Полезные ссылки', callback_data: cb('links') }],
      [{ text: '📋 Меню', callback_data: cb('menu') }],
    ],
  };
}

export function linksKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📋 Меню', callback_data: cb('menu') }],
    ],
  };
}

export function runningKeyboard() {
  return {
    inline_keyboard: [[{ text: '📋 Меню (анализ прервётся)', callback_data: cb('menu') }]],
  };
}
