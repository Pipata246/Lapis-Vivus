/** Шаги FSM — только сервер решает переходы */
export const STEPS = {
  MENU: 'menu',
  GENDER: 'gender',
  BIRTH_DATE: 'birth_date',
  BIRTH_TIME: 'birth_time',
  BIRTH_PLACE: 'birth_place',
  CONFIRM: 'confirm',
  BAZI_UPLOAD: 'bazi_upload',
  ASTRO_UPLOAD: 'astro_upload',
  BLOCK_RUNNING: 'block_running',
  BLOCK_REVIEW: 'block_review',
  BLOCK_FAILED: 'block_failed',
  COMPLETED: 'completed',
};

/** Фиксированный стек итераций (0x04) */
export const BLOCK_STACK = [
  {
    id: '1A',
    title: 'Генетическая матрица (Дизайн Человека)',
    externalKey: null,
  },
  {
    id: '1B',
    title: 'Цифровая психоматрица и нумерология',
    externalKey: null,
  },
  {
    id: '1C',
    title: 'Архетипическая матрица судьбы и чакральный контур',
    externalKey: null,
  },
  {
    id: '1D',
    title: 'Матрица Цолькин',
    externalKey: null,
  },
  {
    id: '2',
    title: 'Архитектура Бацзы и У-Син',
    externalKey: 'bazi_dump',
  },
  {
    id: '3',
    title: 'Геоцентрическая астро-геометрия',
    externalKey: 'astro_dump',
  },
  {
    id: '4',
    title: 'Квантово-кибернетический синтез',
    externalKey: null,
  },
  {
    id: '5',
    title: 'Абсолютный реестр сухого пути',
    externalKey: null,
  },
];

export const CALLBACK_PREFIX = 'lv';

export const TEXT_INPUT_STEPS = new Set([
  STEPS.BIRTH_DATE,
  STEPS.BIRTH_TIME,
  STEPS.BIRTH_PLACE,
  STEPS.BAZI_UPLOAD,
  STEPS.ASTRO_UPLOAD,
]);

export const REJECT_TEXT =
  'Используй кнопки меню. Свободные сообщения не принимаются на этом шаге.';

export const TELEGRAM_MAX_MESSAGE = 4096;
