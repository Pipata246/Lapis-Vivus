/**
 * Дерево профанской маршрутизации — блоки Part I (1A–1E).
 * Серверное FSM; ИИ не участвует в выборе ветки.
 */

import { BLOCK_STACK } from './constants.js';
import { getModuleMeta } from '../ui/modules.js';

export const TREE_ROOT = 'shag_0';

/** @typedef {{ id: string, short: { ru: string, en: string }, full: { ru: string, en: string }, nextNode?: string, targetBlock?: string, blockVariant?: string, maslow?: string }} TreeVariant */
/** @typedef {{ id: string, question: { ru: string, en: string }, variants: Record<string, TreeVariant> }} TreeNode */

/** @type {Record<string, TreeNode>} */
export const DIAGNOSTIC_TREE = {
  shag_0: {
    id: 'shag_0',
    question: {
      ru: 'С чем мы сегодня работаем?',
      en: 'What are we working on today?',
    },
    variants: {
      a: {
        id: 'a',
        short: { ru: 'A · Разбор характера', en: 'A · Character map' },
        full: {
          ru: 'Разбор характера (врожденные таланты, генетика, устройство личности раз и навсегда).',
          en: 'Character analysis (innate talents, genetics, lifelong personality structure).',
        },
        nextNode: 'shag_1',
      },
      b: {
        id: 'b',
        short: { ru: 'B · Проблема сейчас', en: 'B · Problem now' },
        full: {
          ru: 'Решение проблемы прямо сейчас (кризис, стресс, замес на работе, в стране или отношениях).',
          en: 'Solving a problem right now (crisis, stress, work, country or relationship turmoil).',
        },
        nextNode: 'shag_2',
      },
    },
  },
  shag_1: {
    id: 'shag_1',
    question: {
      ru: 'Какая часть твоей природы тебя сейчас волнует больше?',
      en: 'Which part of your nature concerns you most right now?',
    },
    variants: {
      a: {
        id: 'a',
        short: { ru: 'A · Моё тело', en: 'A · My body' },
        full: {
          ru: 'Моё тело (врожденный био-тип, иммунитет, здоровье, зажимы, интуиция тела).',
          en: 'My body (bio-type, immunity, health, somatic blocks, body intuition).',
        },
        targetBlock: '1A',
        blockVariant: 'universal_matrix',
        maslow: '1-2. Физиология и Выживание',
      },
      b: {
        id: 'b',
        short: { ru: 'B · Характер и судьба', en: 'B · Character & fate' },
        full: {
          ru: 'Мой характер и судьба (матрица по дате рождения, денежные каналы, таланты, логика).',
          en: 'My character and fate (birth-date matrix, money channels, talents, logic).',
        },
        targetBlock: '1B',
        blockVariant: 'numeric_tarot_matrix',
        maslow: '4. Признание и Эго',
      },
    },
  },
  shag_2: {
    id: 'shag_2',
    question: {
      ru: 'Откуда идёт основное напряжение?',
      en: 'Where does the main tension come from?',
    },
    variants: {
      a: {
        id: 'a',
        short: { ru: 'A · Изнутри меня', en: 'A · From inside' },
        full: {
          ru: 'Изнутри меня (запутался в мыслях, депрессия, тревога, потеря смысла).',
          en: 'From inside (confused thoughts, depression, anxiety, loss of meaning).',
        },
        nextNode: 'shag_3',
      },
      b: {
        id: 'b',
        short: { ru: 'B · Из внешнего мира', en: 'B · From outside' },
        full: {
          ru: 'Из внешнего мира (проблемы с государством, кризис в деньгах или с людьми).',
          en: 'From the outside world (state issues, money crisis or people problems).',
        },
        nextNode: 'shag_4',
      },
    },
  },
  shag_3: {
    id: 'shag_3',
    question: {
      ru: 'Что точнее описывает твоё состояние?',
      en: 'What best describes your state?',
    },
    variants: {
      a: {
        id: 'a',
        short: { ru: 'A · Ловушки ума', en: 'A · Mind traps' },
        full: {
          ru: 'Наступаю на одни и те же грабли, ловлю ловушки ума, тяжело общаться, ищу свой ТИМ.',
          en: 'Same patterns, mind traps, hard to communicate, seeking my TIM type.',
        },
        targetBlock: '1C',
        blockVariant: 'cognitive_matrix',
        maslow: '3-4. Социальные страхи / Защита Эго',
      },
      b: {
        id: 'b',
        short: { ru: 'B · Экзистенциальный тупик', en: 'B · Existential dead end' },
        full: {
          ru: 'Время утекает сквозь пальцы, экзистенциальный тупик, страх смерти, космический инсайт.',
          en: 'Time slipping away, existential dead end, fear of death, cosmic insight.',
        },
        targetBlock: '1D',
        blockVariant: 'tzolkin_matrix',
        maslow: '5. Самоактуализация',
      },
    },
  },
  shag_4: {
    id: 'shag_4',
    question: {
      ru: 'Где горит сильнее?',
      en: 'Where does it burn hottest?',
    },
    variants: {
      a: {
        id: 'a',
        short: { ru: 'A · Безопасность сейчас', en: 'A · Safety now' },
        full: {
          ru: 'Моя безопасность прямо сейчас (стресс, патрули, сковало челюсть, нужен план выживания).',
          en: 'My safety right now (stress, patrols, jaw tension, need a survival plan).',
        },
        targetBlock: '1E',
        blockVariant: 'somatic_matrix',
        maslow: '1-2. Физическая безопасность',
      },
      b: {
        id: 'b',
        short: { ru: 'B · Мои отношения', en: 'B · My relationships' },
        full: {
          ru: 'Мои отношения (кризис с партнёром, постоянные ссоры, не понимаем друг друга).',
          en: 'My relationships (partner crisis, constant fights, misunderstanding).',
        },
        nextNode: 'shag_5',
      },
    },
  },
  shag_5: {
    id: 'shag_5',
    question: {
      ru: 'В чём главная загвоздка в ваших отношениях?',
      en: 'What is the main snag in your relationship?',
    },
    variants: {
      a: {
        id: 'a',
        short: { ru: 'A · Карма и деньги', en: 'A · Karma & money' },
        full: {
          ru: 'Кармические узлы, общие долги, непонятки с деньгами, тайные манипуляции и обиды.',
          en: 'Karmic knots, shared debts, money issues, hidden manipulation and resentment.',
        },
        targetBlock: '1B',
        blockVariant: 'partner_composite',
        maslow: '3. Социальная созависимость',
      },
      b: {
        id: 'b',
        short: { ru: 'B · Не можем говорить', en: 'B · Cannot communicate' },
        full: {
          ru: 'Мы просто не можем говорить нормально, бытовой конфликт характеров, разные ценности.',
          en: 'We cannot communicate normally, character clash, different life values.',
        },
        targetBlock: '1C',
        blockVariant: 'intersubjective_composite',
        maslow: '4. Иерархическое давление',
      },
    },
  },
};

export function getTreeNode(nodeId) {
  return DIAGNOSTIC_TREE[nodeId] ?? null;
}

export function isTargetedSession(data) {
  return data?.session_mode === 'targeted';
}

export function isFullSession(data) {
  return !data?.session_mode || data.session_mode === 'full';
}

/**
 * @param {string} nodeId
 * @param {'a'|'b'} variantKey
 */
export function resolveTreeChoice(nodeId, variantKey) {
  const node = getTreeNode(nodeId);
  if (!node) return { ok: false, error: 'Неизвестный шаг опроса.' };

  const variant = node.variants[variantKey];
  if (!variant) return { ok: false, error: 'Неизвестный вариант ответа.' };

  const pathEntry = {
    node: nodeId,
    variant: variantKey,
    label: variant.full.ru,
  };

  if (variant.targetBlock) {
    return {
      ok: true,
      done: true,
      targetBlock: variant.targetBlock,
      blockVariant: variant.blockVariant ?? null,
      maslow: variant.maslow ?? null,
      pathEntry,
      leafLabel: variant.full.ru,
    };
  }

  if (variant.nextNode) {
    return {
      ok: true,
      done: false,
      nextNode: variant.nextNode,
      pathEntry,
    };
  }

  return { ok: false, error: 'Ветка опроса не настроена.' };
}

export function resolveBlockIndex(targetBlockId) {
  const idx = BLOCK_STACK.findIndex((b) => b.id === targetBlockId);
  return idx >= 0 ? idx : 0;
}

export function formatTreeStepMessage(nodeId, lang = 'ru') {
  const node = getTreeNode(nodeId);
  if (!node) return '';

  const code = lang === 'en' ? 'en' : 'ru';
  const lines = [
    `<b>${node.question[code]}</b>`,
    '',
  ];

  for (const [key, variant] of Object.entries(node.variants)) {
    const letter = key.toUpperCase();
    lines.push(`${letter}) ${variant.full[code]}`);
  }

  return lines.join('\n');
}

export function formatGoalSummary(data, lang = 'ru') {
  if (!data?.target_block_id) return '';

  const code = lang === 'en' ? 'en' : 'ru';
  const meta = getModuleMeta(data.target_block_id, lang);
  const modeLabel =
    code === 'en' ? 'Session focus' : 'Фокус сессии';
  const variantNote =
    data.block_variant === 'partner_composite'
      ? (code === 'en' ? ' · partner composite' : ' · кармический композит пары')
      : data.block_variant === 'intersubjective_composite'
        ? (code === 'en' ? ' · intertype composite' : ' · соционический композит')
        : '';

  let text = `${modeLabel}\n<b>${meta.title}</b>${variantNote}`;
  if (data.goal_leaf_label) {
    text += `\n<i>${data.goal_leaf_label}</i>`;
  }
  if (data.goal_maslow) {
    text += `\n<i>Maslow · ${data.goal_maslow}</i>`;
  }
  return text;
}

export function formatAfterGoalIntro(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  return code === 'en'
    ? 'Focus selected.\nNow we\'ll collect your birth profile — about a minute.'
    : 'Фокус выбран.\nТеперь соберём профиль рождения — это займёт около минуты.';
}
