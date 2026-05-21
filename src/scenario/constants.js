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

/** Фиксированный стек итераций (0x04) v21.0 */
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
    title: 'Матрица Цолькин (коридор Кин-1 / Кин / Кин+1)',
    externalKey: null,
  },
  {
    id: '2',
    title: 'Архитектура Бацзы и У-Син',
    externalKey: 'bazi_dump',
    photoKey: 'bazi_photo_ids',
  },
  {
    id: '3',
    title: 'Геоцентрическая натальная астро-геометрия',
    externalKey: 'astro_dump',
    photoKey: 'astro_photo_ids',
  },
  {
    id: '3B',
    title: 'Динамический транзитный контур',
    externalKey: 'astro_dump',
    photoKey: 'astro_photo_ids',
  },
  {
    id: '4',
    title: 'Квантово-кибернетический синтез',
    externalKey: null,
  },
  {
    id: '4B',
    title: 'Гностическая деконструкция',
    externalKey: null,
  },
  {
    id: '5',
    title: 'Абсолютный реестр сухого пути',
    externalKey: null,
  },
];

export const BLOCK_IDS = BLOCK_STACK.map((b) => b.id);

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
