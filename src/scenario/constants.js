/** Шаги FSM — только сервер решает переходы */
export const STEPS = {
  MENU: 'menu',
  GENDER: 'gender',
  BIRTH_DATE: 'birth_date',
  BIRTH_TIME: 'birth_time',
  BIRTH_PLACE: 'birth_place',
  CONFIRM: 'confirm',
  BLOCK_PREP: 'block_prep',
  BLOCK_RUNNING: 'block_running',
  BLOCK_REVIEW: 'block_review',
  BLOCK_FAILED: 'block_failed',
  COMPLETED: 'completed',
};

/** Фиксированный стек v21.5 */
export const BLOCK_STACK = [
  {
    id: '1A',
    title: 'Генетическая матрица (Дизайн Человека)',
    description:
      'БЛОК 1A: ГЕНЕТИЧЕСКАЯ МАТРИЦА (Дизайн Человека — тип, профиль, определённые каналы, центры).',
    requiresExternal: false,
  },
  {
    id: '1B',
    title: 'Цифровая психоматрица и нумерология',
    description:
      'БЛОК 1B: ЦИФРОВАЯ ПСИХОМАТРИЦА И НУМЕРОЛОГИЯ (Квадрат Пифагора — расчёт рабочих чисел X1–X4, заполнение матрицы 3×3).',
    requiresExternal: false,
  },
  {
    id: '1C',
    title: 'Архетипическая матрица судьбы и чакральный контур',
    description:
      'БЛОК 1C: АРХЕТИПИЧЕСКАЯ МАТРИЦА СУДЬБЫ И ЧАКРАЛЬНЫЙ КОНТУР (модульное сложение по 22 Старшим Арканам, узлы A, B, C, D, E).',
    requiresExternal: false,
  },
  {
    id: '1D',
    title: 'Матрица Цолькин',
    description:
      'БЛОК 1D: МАТРИЦА ЦОЛЬКИН (Кин, Печать, Тон, радиальная плазма). Коридор Кин−1 / текущий Кин / Кин+1.',
    requiresExternal: false,
  },
  {
    id: '2',
    title: 'Архитектура Бацзы и У-Син',
    description:
      'БЛОК 2: АРХИТЕКТУРА БАЦЗЫ И У-СИН (4 Столпа, скрытые НС, фазы Ци, трение стихий — по прикреплённым файлам).',
    requiresExternal: true,
  },
  {
    id: '3',
    title: 'Геоцентрическая натальная астро-геометрия',
    description:
      'БЛОК 3: ГЕОЦЕНТРИЧЕСКАЯ НАТАЛЬНАЯ АСТРО-ГЕОМЕТРИЯ (координаты планет, куспиды Placidus, аспекты — по файлам).',
    requiresExternal: true,
  },
  {
    id: '3B',
    title: 'Динамический транзитный контур',
    description:
      'БЛОК 3B: ДИНАМИЧЕСКИЙ ТРАНЗИТНЫЙ КОНТУР (транзиты, ретроградности, Сатурн на дату запроса — по файлам).',
    requiresExternal: true,
  },
  {
    id: '4',
    title: 'Квантово-кибернетический синтез',
    description:
      'БЛОК 4: КВАНТОВО-КИБЕРНЕТИЧЕСКИЙ СИНТЕЗ (кросс-анализ всех систем, аттракторы, нелокальные связи).',
    requiresExternal: false,
  },
  {
    id: '4B',
    title: 'Гностическая деконструкция',
    description:
      'БЛОК 4B: ГНОСТИЧЕСКАЯ ДЕКОНСТРУКЦИЯ (Искра, Кенома, архонтические зажимы, шифр Плеромического побега).',
    requiresExternal: false,
  },
  {
    id: '5',
    title: 'Абсолютный реестр сухого пути',
    description:
      'БЛОК 5: АБСОЛЮТНЫЙ РЕЕСТР СУХОГО ПУТИ (стратегические протоколы, сомато-инструкции Дао).',
    requiresExternal: false,
  },
];

export const BLOCK_IDS = BLOCK_STACK.map((b) => b.id);

export const CALLBACK_PREFIX = 'lv';

/** Только анкета: дата, время, город */
export const TEXT_INPUT_STEPS = new Set([
  STEPS.BIRTH_DATE,
  STEPS.BIRTH_TIME,
  STEPS.BIRTH_PLACE,
]);

/** На экране блока — только файлы, без текста */
export const FILE_ONLY_STEPS = new Set([STEPS.BLOCK_PREP]);

export const REJECT_TEXT =
  'На этом шаге текст не принимается. Используй кнопки или прикрепи файл.';

export const TELEGRAM_MAX_MESSAGE = 4096;
