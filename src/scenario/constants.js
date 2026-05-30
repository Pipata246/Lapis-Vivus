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

/**
 * Фиксированный стек v26.9 — порядок и формулировки из протокола.
 * Сервер сам выбирает block_index; модель не выбирает блок.
 */
export const BLOCK_STACK = [
  {
    id: '1A',
    title: 'Генетическая матрица (Дизайн Человека)',
    description: 'БЛОК 1A: ГЕНЕТИЧЕСКАЯ МАТРИЦА (Дизайн Человека: Тип, Профиль, Определенность)',
    requiresExternal: false,
  },
  {
    id: '1B',
    title: 'Синтетический код судьбы',
    description: 'БЛОК 1B: СИНТЕТИЧЕСКИЙ КОД СУДЬБЫ (Квадрат Пифагора + Арканы + Нумерология)',
    requiresExternal: false,
  },
  {
    id: '1C',
    title: 'Чакральный контур и плотность биоформы',
    description: 'БЛОК 1C: ЧАКРАЛЬНЫЙ КОНТУР И ПЛОТНОСТЬ БИОФОРМЫ (Энергодепо и Пробои)',
    requiresExternal: false,
  },
  {
    id: '1D',
    title: 'Матрица Цолькин',
    description: 'БЛОК 1D: МАТРИЦА ЦОЛЬКИН (Частота Дримспелл, Радиальная Синергия)',
    requiresExternal: false,
  },
  {
    id: '1E',
    title: 'Соматическая интеграция травмы',
    description: 'БЛОК 1E: СОМАТИЧЕСКАЯ ИНТЕГРАЦИЯ ТРАВМЫ (Карта Мышечных Блоков и Спазмов)',
    requiresExternal: false,
  },
  {
    id: '2A',
    title: 'Архитектура У-Син',
    description: 'БЛОК 2A: АРХИТЕКТУРА У-СИН (Баланс и Трение Пяти Первоэлементов)',
    requiresExternal: false,
  },
  {
    id: '2B',
    title: 'Сидерический Джйотиш-контур',
    description: 'БЛОК 2B: СИДЕРИЧЕСКИЙ ДЖЙОТИШ-КОНТУР (Раши, Лагна, Прессинг Сатурна)',
    requiresExternal: true,
  },
  {
    id: '2C',
    title: 'Гексаграммный контур и И-Цзин',
    description: 'БЛОК 2C: ГЕКСАГРАММНЫЙ КОНТУР И И-ЦЗИН (Линии Солнца/Земли)',
    requiresExternal: false,
  },
  {
    id: '2D',
    title: 'Радиксный синтез креста',
    description: 'БЛОК 2D: РАДИКСНЫЙ СИНТЕЗ КРЕСТА (Геометрия Инкарнационного Предназначения)',
    requiresExternal: false,
  },
  {
    id: '2E',
    title: 'Параметры корректного питания и среды',
    description: 'КОНТУР 2E: ПАРАМЕТРЫ КОРРЕКТНОГО ПИТАНИЯ И СРЕДЫ (Архитектура pHS)',
    requiresExternal: false,
  },
  {
    id: '2F',
    title: 'Теневая матрица',
    description: 'БЛОК 2F: ТЕНЕВАЯ МАТРИЦА (Генетические Травмы, Спецификация Лилит)',
    requiresExternal: false,
  },
  {
    id: '3_ARES',
    title: 'Реторта Овна',
    description: 'БЛОК 3_ARES: РЕТОРТА ОВНА (Calcinatio — Кинетический Импульс Марса)',
    requiresExternal: true,
  },
  {
    id: '3_TAURUS',
    title: 'Реторта Тельца',
    description: 'БЛОК 3_TAURUS: РЕТОРТА ТЕЛЬЦА (Congelatio — Накопление Формы Венеры)',
    requiresExternal: true,
  },
  {
    id: '3_GEMINI',
    title: 'Реторта Близнецов',
    description: 'БЛОК 3_GEMINI: РЕТОРТА БЛИЗНЕЦОВ (Sublimatio — Скорость Меркурия)',
    requiresExternal: true,
  },
  {
    id: '3_CANCER',
    title: 'Реторта Рака',
    description: 'БЛОК 3_CANCER: РЕТОРТА РАКА (Solutio — Капля Психеи Луны)',
    requiresExternal: true,
  },
  {
    id: '3_LEO',
    title: 'Реторта Льва',
    description: 'БЛОК 3_LEO: РЕТОРТА ЛЬВА (Digestio — Радиация Самости Солнца)',
    requiresExternal: true,
  },
  {
    id: '3_VIRGO',
    title: 'Реторта Девы',
    description: 'БЛОК 3_VIRGO: РЕТОРТА ДЕВЫ (Separatio — Вивисекция Фактов Прозерпины)',
    requiresExternal: true,
  },
  {
    id: '3_LIBRA',
    title: 'Реторта Весов',
    description: 'БЛОК 3_LIBRA: РЕТОРТА ВЕСОВ (Sublimatio — Зеркало Союзов Хирона)',
    requiresExternal: true,
  },
  {
    id: '3_SCORPIO',
    title: 'Реторта Скорпиона',
    description: 'БЛОК 3_SCORPIO: РЕТОРТА СКОРПИОНА (Putrefactio — Пиролиз Плутона)',
    requiresExternal: true,
  },
  {
    id: '3_SAGITTARIUS',
    title: 'Реторта Стрельца',
    description: 'БЛОК 3_SAGITTARIUS: РЕТОРТА СТРЕЛЬЦА (Incineratio — Экспансия Юпитера)',
    requiresExternal: true,
  },
  {
    id: '3_CAPRICORN',
    title: 'Реторта Козерога',
    description: 'БЛОК 3_CAPRICORN: РЕТОРТА КОЗЕРОГА (Coagulatio — Крио-фиксация Сатурна)',
    requiresExternal: true,
  },
  {
    id: '3_AQUARIUS',
    title: 'Реторта Водолея',
    description: 'БЛОК 3_AQUARIUS: РЕТОРТА ВОДОЛЕЯ (Sublimatio — Сети Будущего Урана)',
    requiresExternal: true,
  },
  {
    id: '3_PISCES',
    title: 'Реторта Рыб',
    description: 'БЛОК 3_PISCES: РЕТОРТА РЫБ (Solutio — Голографический Хаос Нептуна)',
    requiresExternal: true,
  },
  {
    id: '3B',
    title: 'Динамический транзитный контур',
    description: 'БЛОК 3B: ДИНАМИЧЕСКИЙ ТРАНЗИТНЫЙ КОНТУР (Астрономические Экстремумы)',
    requiresExternal: true,
  },
  {
    id: '3C',
    title: 'Реактор мидпоинтов и жребиев',
    description: 'БЛОК 3C: РЕАКТОР МИДПОИНТОВ И ЖРЕБИЕВ (Градусы Эклиптики, Антисы)',
    requiresExternal: true,
  },
  {
    id: '4',
    title: 'Квантово-кибернетический синтез',
    description: 'БЛОК 4: КВАНТОВО-КИБЕРНЕТИЧЕСКИЙ СИНТЕЗ (Веса Субъекта через Neo4j)',
    requiresExternal: false,
  },
  {
    id: '4A',
    title: 'Интеграция теневых структур',
    description: 'БЛОК 4A: ИНТЕГРАЦИЯ ТЕНЕВЫХ СТРУКТУР (Герметический Конвейер Сань Бао)',
    requiresExternal: false,
  },
  {
    id: '4B',
    title: 'Гностическая деконструкция',
    description: 'БЛОК 4B: ГНОСТИЧЕСКАЯ ДЕКОНСТРУКЦИЯ (Вычисление Индекса Кеномы)',
    requiresExternal: false,
  },
  {
    id: '4C',
    title: 'Алхимический катализатор',
    description: 'БЛОК 4C: АЛХИМИЧЕСКИЙ КАТАЛИЗАТОР (Точка Выжигания Эго-Сопротивления)',
    requiresExternal: false,
  },
  {
    id: '4D',
    title: 'Сингулярный итог',
    description: 'БЛОК 4D: СИНГУЛЯРНЫЙ ИТОГ (ТРАНСЦЕНДЕНТНЫЙ СВЕРХМАНИФЕСТ)',
    requiresExternal: false,
  },
  {
    id: '5A',
    title: 'Стратегический протокол и код коррекции',
    description: 'БЛОК 5A: СТРАТЕГИЧЕСКИЙ ПРОТОКОЛ И КОД КОРРЕКЦИИ (Runtime Инструкции)',
    requiresExternal: false,
  },
  {
    id: '5B',
    title: 'Компенсаторные сомато-инструкции Дао',
    description: 'БЛОК 5B: КОМПЕНСАТОРНЫЕ СОМАТО-ИНСТРУКЦИИ ДАО (Практики Нэйдань)',
    requiresExternal: false,
  },
];

export const BLOCK_IDS = BLOCK_STACK.map((b) => b.id);

/** Индекс блока 4 — с него в контекст подмешиваются метакомментарии прошлых блоков */
export const SYNTHESIS_BLOCK_INDEX = BLOCK_STACK.findIndex((b) => b.id === '4');

export function jsonArtifactName(blockId) {
  const safe = blockId.replace(/[^0-9A-Za-z_]/g, '_');
  return `блок_${safe}_инвариантСтрогийЗапуск_v26.9.json`;
}

export const CALLBACK_PREFIX = 'lv';

export const TEXT_INPUT_STEPS = new Set([
  STEPS.BIRTH_DATE,
  STEPS.BIRTH_TIME,
  STEPS.BIRTH_PLACE,
  STEPS.BLOCK_PREP,  // Пользователь может отвечать на вопросы ИИ на экране блока
]);

export const FILE_ONLY_STEPS = new Set([STEPS.BLOCK_PREP]);

export const REJECT_TEXT =
  'На этом шаге текст не принимается. Используй кнопки или прикрепи файл.';

export const TELEGRAM_MAX_MESSAGE = 4096;
