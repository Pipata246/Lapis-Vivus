/**
 * Внешние калькуляторы для оператора («для ленивых»).
 * Geocult: GET-параметры с формы (fd, fm, fy, fh, fmn, c1, ttz, hs, sb).
 */

const GEOCULT = {
  natal: 'https://geocult.ru/natalnaya-karta-onlayn-raschet',
  transits: 'https://geocult.ru/tranzityi-onlayn-raschet',
};

const CALCULATORS = {
  humanDesign: {
    label: 'Дизайн Человека',
    baseUrl: 'https://human-design.space/dizajn-cheloveka-raschet-karty/#/bodygraph',
  },
  pythagoras: {
    label: 'Квадрат Пифагора',
    baseUrl: 'https://in-contri.ru/kvadrat-pifagora/',
  },
  chakraAnalysis: {
    label: 'Чакроанализ',
    baseUrl: 'https://numeria.ru/calculators/chakroanaliz/',
  },
  destinyMatrix: {
    label: 'Матрица судьбы',
    baseUrl: 'https://human-design.space/rasschitat-matriczu-sudby/',
  },
  taroPortrait: {
    label: 'Кармический портрет Таро',
    baseUrl: 'https://olvia-center.ru/article/psihologicheskiy-portret-po-kartam-taro',
  },
  tzolkin: {
    label: 'Цолькин',
    baseUrl: 'https://yamaya.ru/maya/kin-orakul/',
  },
  bazi: {
    label: 'Бацзы · У-Син',
    baseUrl: 'https://www.mingli.ru/card/739951',
  },
  jyotish: {
    label: 'Джйотиш',
    baseUrl: 'https://vedic-horo.ru/#',
  },
  dasha: {
    label: 'Даша',
    baseUrl: 'https://dasha-calculator.ru/#calculator',
  },
  gochara: {
    label: 'Гочара',
    baseUrl: 'https://aum4.com/jyotish/gochara/',
  },
  natal: {
    label: 'Натальная карта',
    buildUrl: (data) => buildGeocultUrl(GEOCULT.natal, data),
  },
  transits: {
    label: 'Транзиты',
    buildUrl: (data) => buildGeocultUrl(GEOCULT.transits, data),
  },
};

/** Калькуляторы по базовому block_id (подблоки 2B.1, 3C_1 и т.д. резолвятся сюда) */
const BLOCK_CALCULATORS = {
  '1A': ['humanDesign'],
  '1B': ['pythagoras'],
  '1C': ['chakraAnalysis', 'destinyMatrix', 'taroPortrait'],
  '1D': ['tzolkin'],
  '1E': ['chakraAnalysis'],
  '2A': ['bazi'],
  '2B': ['jyotish', 'dasha'],
  '2G': ['jyotish', 'gochara', 'dasha'],
  '3': ['natal', 'gochara'],
  '3B': ['transits', 'gochara'],
  '3C': ['natal'],
  '4': ['natal', 'bazi', 'destinyMatrix'],
  '4A': ['bazi'],
  '4B': ['destinyMatrix', 'humanDesign'],
  '4E': ['destinyMatrix'],
  '4C': ['humanDesign'],
  '4G': ['destinyMatrix'],
  '4F': ['humanDesign'],
  '4D': ['natal', 'bazi', 'destinyMatrix'],
  '5A': ['transits'],
  '5B': ['bazi'],
};

function resolveBlockCalculatorKey(blockId) {
  if (BLOCK_CALCULATORS[blockId]) return blockId;
  if (blockId.startsWith('2B.')) return '2B';
  if (blockId.startsWith('2G.')) return '2G';
  if (blockId.startsWith('3B.')) return '3B';
  if (blockId.startsWith('3.')) return '3';
  if (blockId.startsWith('3C_') || blockId === '3C') return '3C';
  const m = blockId.match(/^(4[A-G]?|5[A-B]?)$/);
  if (m && BLOCK_CALCULATORS[m[1]]) return m[1];
  return blockId;
}

function parseBirthDate(dateStr) {
  if (!dateStr || !/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
    return null;
  }
  const [day, month, year] = dateStr.split('.').map(Number);
  return { day, month: month - 1, year };
}

function parseBirthTime(timeStr) {
  if (!timeStr || timeStr === 'неизвестно') {
    return { hour: 12, minute: 0 };
  }
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    return { hour: 12, minute: 0 };
  }
  let hour = Number(m[1]);
  let minute = Number(m[2]);
  if (hour === 12 && minute === 0) {
    minute = 1;
  }
  return { hour, minute };
}

function buildGeocultUrl(base, data) {
  const params = new URLSearchParams();
  params.set('fn', 'Оператор');
  params.set('sb', '1');
  params.set('ttz', '20');
  params.set('hs', 'P');

  const birth = parseBirthDate(data?.birth_date);
  if (birth) {
    params.set('fd', String(birth.day));
    params.set('fm', String(birth.month));
    params.set('fy', String(birth.year));
  }

  const time = parseBirthTime(data?.birth_time);
  params.set('fh', String(time.hour));
  params.set('fmn', String(time.minute));

  if (data?.birth_place) {
    params.set('c1', data.birth_place);
  }

  return `${base}?${params.toString()}`;
}

function resolveCalculatorUrl(key, data) {
  const calc = CALCULATORS[key];
  if (!calc) return null;

  if (typeof calc.buildUrl === 'function') {
    return calc.buildUrl(data);
  }
  return calc.baseUrl;
}

/**
 * @returns {{ label: string, url: string, note?: string }[]}
 */
export function getBlockCalculatorLinks(blockId, collectedData = {}) {
  const key = resolveBlockCalculatorKey(blockId);
  const keys = BLOCK_CALCULATORS[key] ?? [];
  const links = [];

  for (const calcKey of keys) {
    const calc = CALCULATORS[calcKey];
    if (!calc) continue;

    const url = resolveCalculatorUrl(calcKey, collectedData);
    if (!url) continue;

    links.push({
      label: calc.label,
      url,
      note: calc.note,
    });
  }

  return links;
}

export function formatCalculatorLinksText(blockId, collectedData = {}) {
  const links = getBlockCalculatorLinks(blockId, collectedData);
  if (links.length === 0) {
    return '';
  }

  const lines = [
    '<b>Справочные калькуляторы</b>',
    '<i>Ссылки откроются в браузере</i>',
  ];
  for (const link of links) {
    lines.push(`· ${link.label}${link.note ? ` — ${link.note}` : ''}`);
  }
  lines.push('');
  lines.push('Сохраните результат расчёта и приложите файл, если этап требует исходных данных.');

  const hasGeocult = links.some((l) => l.url.includes('geocult.ru'));
  if (hasGeocult && collectedData?.birth_date) {
    lines.push('<i>Дата, время и место из профиля подставлены в ссылку.</i>');
  } else if (collectedData?.birth_date) {
    lines.push('<i>Дата рождения из профиля — уточните на сайте при необходимости.</i>');
  }

  return lines.join('\n');
}

/** Кнопки для inline_keyboard Telegram (url). */
export function calculatorUrlButtons(blockId, collectedData = {}) {
  return getBlockCalculatorLinks(blockId, collectedData).map((link) => ({
    text: link.label.slice(0, 64),
    url: link.url,
  }));
}

/** Все калькуляторы для раздела «Справочные ресурсы» */
export function getAllCalculatorLinks() {
  const urls = {
    humanDesign: 'https://human-design.space/dizajn-cheloveka-raschet-karty/#/bodygraph',
    pythagoras: 'https://in-contri.ru/kvadrat-pifagora/',
    chakraAnalysis: 'https://numeria.ru/calculators/chakroanaliz/',
    destinyMatrix: 'https://human-design.space/rasschitat-matriczu-sudby/',
    taroPortrait: 'https://olvia-center.ru/article/psihologicheskiy-portret-po-kartam-taro',
    tzolkin: 'https://yamaya.ru/maya/kin-orakul/',
    bazi: 'https://www.mingli.ru/card/739951',
    jyotish: 'https://vedic-horo.ru/#',
    dasha: 'https://dasha-calculator.ru/#calculator',
    gochara: 'https://aum4.com/jyotish/gochara/',
    natal: GEOCULT.natal,
    transits: GEOCULT.transits,
  };

  return Object.entries(urls).map(([key, url]) => ({
    label: CALCULATORS[key]?.label ?? key,
    url,
  }));
}

/** Кнопки для раздела «Справочные ресурсы» */
export function allLinksButtons() {
  const links = getAllCalculatorLinks();
  const rows = [];

  for (let i = 0; i < links.length; i += 2) {
    rows.push(links.slice(i, i + 2).map((link) => ({
      text: link.label,
      url: link.url,
    })));
  }

  return rows;
}
