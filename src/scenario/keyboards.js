import { CALLBACK_PREFIX } from './constants.js';
import { calculatorUrlButtons } from './calculatorLinks.js';
import { getMainMenuKeyboard } from '../navigation.js';
import { btn } from '../ui/brand.js';
import { getTreeNode } from './diagnosticTree.js';

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

function treeCb(nodeId, variantKey) {
  return `${CALLBACK_PREFIX}:tree:${nodeId}:${variantKey}`;
}

export function goalTreeKeyboard(nodeId, lang = 'ru') {
  const node = getTreeNode(nodeId);
  if (!node) {
    return menuKeyboard(lang);
  }

  const code = lang === 'en' ? 'en' : 'ru';
  const rows = Object.entries(node.variants).map(([key, variant]) => [
    { text: variant.short[code], callback_data: treeCb(nodeId, key) },
  ]);

  rows.push([{ text: btn(lang, 'menu'), callback_data: cb('menu') }]);

  return { inline_keyboard: rows };
}

export function menuKeyboard(lang = 'ru') {
  return getMainMenuKeyboard(lang);
}

export function genderKeyboard(lang = 'ru') {
  const male = lang === 'en' ? '👨 Male' : '👨 Мужской';
  const female = lang === 'en' ? '👩 Female' : '👩 Женский';
  return {
    inline_keyboard: [
      [
        { text: male, callback_data: cb('gender', 'male') },
        { text: female, callback_data: cb('gender', 'female') },
      ],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function birthTimeKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'timeUnknown'), callback_data: cb('time_unknown') }],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function confirmKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'confirm'), callback_data: cb('confirm_yes') }],
      [
        { text: btn(lang, 'editData'), callback_data: cb('confirm_edit') },
        { text: btn(lang, 'menu'), callback_data: cb('menu') },
      ],
    ],
  };
}

export function blockPrepKeyboard(blockId, collectedData = {}, lang = 'ru') {
  const rows = [];
  const calcButtons = calculatorUrlButtons(blockId, collectedData);

  for (let i = 0; i < calcButtons.length; i += 2) {
    rows.push(calcButtons.slice(i, i + 2));
  }

  rows.push([{ text: btn(lang, 'runStage'), callback_data: cb('run_block') }]);
  rows.push([
    { text: btn(lang, 'skipStage'), callback_data: cb('skip_block') },
    { text: btn(lang, 'menu'), callback_data: cb('menu') },
  ]);

  return { inline_keyboard: rows };
}

export function nextBlockKeyboard(lang = 'ru', targeted = false) {
  const menuRow = [{ text: btn(lang, 'menu'), callback_data: cb('menu') }];

  if (targeted) {
    return {
      inline_keyboard: [
        [
          { text: btn(lang, 'howApply'), callback_data: cb('quick_question', '0') },
          { text: btn(lang, 'moreDetail'), callback_data: cb('quick_question', '1') },
        ],
        [{ text: btn(lang, 'whatMeans'), callback_data: cb('quick_question', '2') }],
        [{ text: btn(lang, 'finishSession'), callback_data: cb('finish_session') }],
        menuRow,
      ],
    };
  }

  return {
    inline_keyboard: [
      [
        { text: btn(lang, 'howApply'), callback_data: cb('quick_question', '0') },
        { text: btn(lang, 'moreDetail'), callback_data: cb('quick_question', '1') },
      ],
      [{ text: btn(lang, 'whatMeans'), callback_data: cb('quick_question', '2') }],
      [{ text: btn(lang, 'nextStage'), callback_data: cb('next_block') }],
      menuRow,
    ],
  };
}

export function textInputKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [[{ text: btn(lang, 'menu'), callback_data: cb('menu') }]],
  };
}

export function blockFailedKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'retryStage'), callback_data: cb('retry_block') }],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function completedKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'newAnalysis'), callback_data: cb('reset') }],
      [{ text: btn(lang, 'usefulLinks'), callback_data: cb('links') }],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function linksKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [[{ text: btn(lang, 'menu'), callback_data: cb('menu') }]],
  };
}

export function runningKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [[{ text: btn(lang, 'menuAbort'), callback_data: cb('menu') }]],
  };
}
