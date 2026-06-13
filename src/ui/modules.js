/**
 * Каталог модулей Lapis Vivus — премиальные названия, части сессии, описания.
 */

export const SESSION_TOTAL = 36;

export const PARTS = {
  I: { ru: 'Происхождение', en: 'Genesis' },
  II: { ru: 'Восточная аркана', en: 'Eastern Arcana' },
  III: { ru: 'Небесная карта', en: 'Celestial Chart' },
  IV: { ru: 'Синтез', en: 'Synthesis' },
  V: { ru: 'Интеграция', en: 'Integration' },
};

/** @type {Record<string, { part: keyof PARTS, title: { ru: string, en: string }, brief: { ru: string, en: string } }>} */
export const MODULES = {
  '1A': {
    part: 'I',
    title: { ru: 'Матрица происхождения', en: 'Matrix of Origin' },
    brief: {
      ru: 'Картирование генетической структуры личности. Основа последующих модулей сессии.',
      en: 'Mapping the genetic structure of personality. Foundation for the rest of the session.',
    },
  },
  '1B': {
    part: 'I',
    title: { ru: 'Числовой код', en: 'Numerical Code' },
    brief: {
      ru: 'Психоматрица и числовые паттерны даты рождения.',
      en: 'Psychomatrix and numerical patterns of the birth date.',
    },
  },
  '1C': {
    part: 'I',
    title: { ru: 'Когнитивная архитектура', en: 'Cognitive Architecture' },
    brief: {
      ru: 'Фильтры восприятия и метаболизм информации. Требуются внешние данные.',
      en: 'Perception filters and information metabolism. External data required.',
    },
  },
  '1D': {
    part: 'I',
    title: { ru: 'Цикл Цолькин', en: 'Tzolkin Cycle' },
    brief: {
      ru: 'Дуальная временная решётка майя — печать, тон, волна.',
      en: 'Dual Maya time lattice — seal, tone, wave.',
    },
  },
  '1E': {
    part: 'I',
    title: { ru: 'Соматическая карта', en: 'Somatic Map' },
    brief: {
      ru: 'Тело как носитель памяти и ресурса. Интеграция соматического уровня.',
      en: 'The body as carrier of memory and resource. Somatic integration.',
    },
  },
  '2A': {
    part: 'II',
    title: { ru: 'Пять элементов', en: 'Five Elements' },
    brief: {
      ru: 'У-Син и баланс стихий в структуре личности.',
      en: 'Wu Xing and elemental balance in personal structure.',
    },
  },
  '2B.1': {
    part: 'II',
    title: { ru: 'Джйотиш · дома I–III', en: 'Jyotish · Houses I–III' },
    brief: { ru: 'Ведическая натальная карта. Первый сектор гороскопа.', en: 'Vedic natal chart. First sector.' },
  },
  '2B.2': {
    part: 'II',
    title: { ru: 'Джйотиш · дома IV–VI', en: 'Jyotish · Houses IV–VI' },
    brief: { ru: 'Ведическая натальная карта. Второй сектор.', en: 'Vedic natal chart. Second sector.' },
  },
  '2B.3': {
    part: 'II',
    title: { ru: 'Джйотиш · дома VII–IX', en: 'Jyotish · Houses VII–IX' },
    brief: { ru: 'Ведическая натальная карта. Третий сектор.', en: 'Vedic natal chart. Third sector.' },
  },
  '2B.4': {
    part: 'II',
    title: { ru: 'Джйотиш · дома X–XII', en: 'Jyotish · Houses X–XII' },
    brief: { ru: 'Ведическая натальная карта. Четвёртый сектор.', en: 'Vedic natal chart. Fourth sector.' },
  },
  '2G.1': {
    part: 'II',
    title: { ru: 'Джйотиш · динамика I–III', en: 'Jyotish · Dynamics I–III' },
    brief: { ru: 'Динамика домов и транзитная активность.', en: 'House dynamics and transit activity.' },
  },
  '2G.2': {
    part: 'II',
    title: { ru: 'Джйотиш · динамика IV–VI', en: 'Jyotish · Dynamics IV–VI' },
    brief: { ru: 'Динамика домов. Сектор II.', en: 'House dynamics. Sector II.' },
  },
  '2G.3': {
    part: 'II',
    title: { ru: 'Джйотиш · динамика VII–IX', en: 'Jyotish · Dynamics VII–IX' },
    brief: { ru: 'Динамика домов. Сектор III.', en: 'House dynamics. Sector III.' },
  },
  '2G.4': {
    part: 'II',
    title: { ru: 'Джйотиш · динамика X–XII', en: 'Jyotish · Dynamics X–XII' },
    brief: { ru: 'Динамика домов. Завершение восточного цикла.', en: 'House dynamics. Eastern cycle completion.' },
  },
  '3.1': {
    part: 'III',
    title: { ru: 'Натальная карта · I', en: 'Natal Chart · I' },
    brief: { ru: 'Тропический зодиак. Овен — Близнецы.', en: 'Tropical zodiac. Aries through Gemini.' },
  },
  '3.2': {
    part: 'III',
    title: { ru: 'Натальная карта · II', en: 'Natal Chart · II' },
    brief: { ru: 'Тропический зодиак. Рак — Дева.', en: 'Tropical zodiac. Cancer through Virgo.' },
  },
  '3.3': {
    part: 'III',
    title: { ru: 'Натальная карта · III', en: 'Natal Chart · III' },
    brief: { ru: 'Тропический зодиак. Весы — Стрелец.', en: 'Tropical zodiac. Libra through Sagittarius.' },
  },
  '3.4': {
    part: 'III',
    title: { ru: 'Натальная карта · IV', en: 'Natal Chart · IV' },
    brief: { ru: 'Тропический зодиак. Козерог — Рыбы.', en: 'Tropical zodiac. Capricorn through Pisces.' },
  },
  '3B.1': {
    part: 'III',
    title: { ru: 'Транзиты · I', en: 'Transits · I' },
    brief: { ru: 'Текущие небесные влияния. Сектор I.', en: 'Current celestial influences. Sector I.' },
  },
  '3B.2': {
    part: 'III',
    title: { ru: 'Транзиты · II', en: 'Transits · II' },
    brief: { ru: 'Текущие небесные влияния. Сектор II.', en: 'Current celestial influences. Sector II.' },
  },
  '3B.3': {
    part: 'III',
    title: { ru: 'Транзиты · III', en: 'Transits · III' },
    brief: { ru: 'Текущие небесные влияния. Сектор III.', en: 'Current celestial influences. Sector III.' },
  },
  '3B.4': {
    part: 'III',
    title: { ru: 'Транзиты · IV', en: 'Transits · IV' },
    brief: { ru: 'Завершение транзитного цикла.', en: 'Transit cycle completion.' },
  },
  '3C_1': {
    part: 'III',
    title: { ru: 'Хиромантия · потенциал', en: 'Chiromancy · Potential' },
    brief: { ru: 'Левая ладонь — врождённый ресурс.', en: 'Left palm — innate resource.' },
  },
  '3C_2': {
    part: 'III',
    title: { ru: 'Хиромантия · реализация', en: 'Chiromancy · Expression' },
    brief: { ru: 'Правая ладонь — активная траектория.', en: 'Right palm — active trajectory.' },
  },
  '3C_3': {
    part: 'III',
    title: { ru: 'Хиромантия · хронология', en: 'Chiromancy · Timeline' },
    brief: { ru: 'Временные линии на ладонях.', en: 'Timeline markings on the palms.' },
  },
  '3C': {
    part: 'III',
    title: { ru: 'Мидпойнты и лоты', en: 'Midpoints & Lots' },
    brief: { ru: 'Скрытые точки натальной карты.', en: 'Hidden points of the natal chart.' },
  },
  '4': {
    part: 'IV',
    title: { ru: 'Граф связей', en: 'Connection Graph' },
    brief: {
      ru: 'Синтез всех систем в единую карту взаимосвязей.',
      en: 'Synthesis of all systems into a unified connection map.',
    },
  },
  '4A': {
    part: 'IV',
    title: { ru: 'Три сокровища', en: 'Three Treasures' },
    brief: { ru: 'Сан Бao — интеграция тела, дыхания и духа.', en: 'San Bao — integration of body, breath, spirit.' },
  },
  '4B': {
    part: 'IV',
    title: { ru: 'Архетипический слой', en: 'Archetypal Layer' },
    brief: { ru: 'Гностическая карта глубинных паттернов.', en: 'Gnostic map of deep patterns.' },
  },
  '4E': {
    part: 'IV',
    title: { ru: 'Работа с нафс', en: 'Nafs Work' },
    brief: { ru: 'Суфийский редуктор — трансформация внутренних драйверов.', en: 'Sufi reduction of inner drivers.' },
  },
  '4C': {
    part: 'IV',
    title: { ru: 'Алхимический катализатор', en: 'Alchemical Catalyst' },
    brief: { ru: 'Точка превращения — где системы сходятся.', en: 'Point of transformation where systems converge.' },
  },
  '4G': {
    part: 'IV',
    title: { ru: 'Деконструкция', en: 'Deconstruction' },
    brief: { ru: 'Пересборка смыслов через метод cut-up.', en: 'Meaning reassembly through cut-up method.' },
  },
  '4F': {
    part: 'IV',
    title: { ru: 'Обнуление паттернов', en: 'Pattern Annihilation' },
    brief: { ru: 'Адвaita-уровень — выход за пределы идентичности.', en: 'Advaita level — beyond identity.' },
  },
  '4D': {
    part: 'IV',
    title: { ru: 'Сверхманифест', en: 'Supermanifest' },
    brief: { ru: 'Итоговая формула — синтез всего пройденного пути.', en: 'Final formula — synthesis of the entire path.' },
  },
  '5A': {
    part: 'V',
    title: { ru: 'Стратегический протокол', en: 'Strategic Protocol' },
    brief: {
      ru: 'Персональный план действий на основе полного анализа.',
      en: 'Personal action plan based on the complete analysis.',
    },
  },
  '5B': {
    part: 'V',
    title: { ru: 'Телесные практики', en: 'Somatic Practices' },
    brief: {
      ru: 'Neidan-протокол — воплощение выводов в теле.',
      en: 'Neidan protocol — embodying insights in the body.',
    },
  },
};

export function getModuleMeta(blockId, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const meta = MODULES[blockId];
  if (!meta) {
    return {
      part: '—',
      partName: '—',
      title: blockId,
      brief: '',
    };
  }
  return {
    part: meta.part,
    partName: PARTS[meta.part][code],
    title: meta.title[code],
    brief: meta.brief[code],
  };
}
