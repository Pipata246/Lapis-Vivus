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
    label: '🧬 Дизайн Человека',
    baseUrl: 'https://human-design.space/dizajn-cheloveka-raschet-karty/#/bodygraph',
  },
  pythagoras: {
    label: '🔢 Квадрат Пифагора',
    baseUrl: 'https://in-contri.ru/kvadrat-pifagora/',
  },
  chakraAnalysis: {
    label: '🔮 Чакроанализ (ХВД)',
    baseUrl: 'https://numeria.ru/calculators/chakroanaliz/',
  },
  destinyMatrix: {
    label: '🎯 Матрица судьбы',
    baseUrl: 'https://human-design.space/rasschitat-matriczu-sudby/',
  },
  taroPortrait: {
    label: '🃏 Кармический портрет Таро',
    baseUrl: 'https://olvia-center.ru/article/psihologicheskiy-portret-po-kartam-taro',
  },
  tzolkin: {
    label: '🌞 Цолькин / Кин',
    baseUrl: 'https://yamaya.ru/maya/kin-orakul/',
  },
  bazi: {
    label: '🏯 Бацзы (У-Син)',
    baseUrl: 'https://www.mingli.ru/card/739951',
  },
  jyotish: {
    label: '🕉 Джйотиш',
    baseUrl: 'https://vedic-horo.ru/#',
  },
  dasha: {
    label: '📅 Даша (расчет)',
    baseUrl: 'https://dasha-calculator.ru/#calculator',
  },
  gochara: {
    label: '🔄 Гочара (расчет)',
    baseUrl: 'https://aum4.com/jyotish/gochara/',
  },
  natal: {
    label: '⭐ Натальная карта',
    buildUrl: (data) => buildGeocultUrl(GEOCULT.natal, data),
  },
  transits: {
    label: '🔄 Транзиты',
    buildUrl: (data) => buildGeocultUrl(GEOCULT.transits, data),
  },
};

/** Калькуляторы по block_id */
const BLOCK_CALCULATORS = {
  '1A': ['humanDesign'],
  '1B': ['pythagoras'],
  '1C': ['chakraAnalysis', 'destinyMatrix', 'taroPortrait'],
  '1D': ['tzolkin'],
  '2': ['bazi', 'jyotish', 'dasha'],
  '2B': ['jyotish', 'dasha'],
  '3': ['natal', 'gochara'],
  '3B': ['transits', 'gochara'],
  '4': ['natal', 'bazi', 'destinyMatrix'],
  '4B': ['destinyMatrix', 'humanDesign'],
  '5': ['transits'],
};

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
  const keys = BLOCK_CALCULATORS[blockId] ?? [];
  const links = [];

  for (const key of keys) {
    const calc = CALCULATORS[key];
    if (!calc) continue;

    const url = resolveCalculatorUrl(key, collectedData);
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

  const lines = ['🧮 Калькуляторы (откроются в браузере):'];
  for (const link of links) {
    lines.push(`• ${link.label}${link.note ? ` — ${link.note}` : ''}`);
  }
  lines.push('');
  lines.push('Сделай скрин/сохрани результат и прикрепи файлом, где блок требует фактуру.');

  const hasGeocult = links.some((l) => l.url.includes('geocult.ru'));
  if (hasGeocult && collectedData?.birth_date) {
    lines.push('(Geocult: дата/время/город из анкеты подставлены в ссылку; город уточни на сайте.)');
  } else if (collectedData?.birth_date) {
    lines.push('(Дата рождения из анкеты — введи на сайте, если поля не заполнились.)');
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

/** Все калькуляторы для раздела «Полезные ссылки» */
export function getAllCalculatorLinks() {
  return [
    { label: '🧬 Дизайн Человека', url: 'https://human-design.space/dizajn-cheloveka-raschet-karty/#/bodygraph' },
    { label: '🔢 Квадрат Пифагора', url: 'https://in-contri.ru/kvadrat-pifagora/' },
    { label: '🔮 Чакроанализ (ХВД)', url: 'https://numeria.ru/calculators/chakroanaliz/' },
    { label: '🎯 Матрица судьбы', url: 'https://human-design.space/rasschitat-matriczu-sudby/' },
    { label: '🃏 Кармический портрет Таро', url: 'https://olvia-center.ru/article/psihologicheskiy-portret-po-kartam-taro' },
    { label: '🌞 Цолькин / Кин', url: 'https://yamaya.ru/maya/kin-orakul/' },
    { label: '🏯 Бацзы (У-Син)', url: 'https://www.mingli.ru/card/739951' },
    { label: '🕉 Джйотиш', url: 'https://vedic-horo.ru/#' },
    { label: '📅 Даша (расчет)', url: 'https://dasha-calculator.ru/#calculator' },
    { label: '🔄 Гочара (расчет)', url: 'https://aum4.com/jyotish/gochara/' },
    { label: '⭐ Натальная карта', url: 'https://geocult.ru/natalnaya-karta-onlayn-raschet' },
    { label: '🔄 Транзиты', url: 'https://geocult.ru/tranzityi-onlayn-raschet' },
  ];
}

/** Кнопки для раздела «Полезные ссылки» */
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
