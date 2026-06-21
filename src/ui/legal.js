import { letterhead } from './brand.js';
import { loadSiteConfig } from '../config.js';

const LABELS = {
  ru: {
    privacy: 'Политика конфиденциальности',
    offer: 'Публичная оферта',
    accept: '✓ Принимаю',
  },
  en: {
    privacy: 'Privacy policy',
    offer: 'Public offer',
    accept: '✓ I accept',
  },
};

export function getLegalDocUrls() {
  const { siteUrl } = loadSiteConfig();
  if (!siteUrl) {
    return { privacy: null, offer: null };
  }
  return {
    privacy: `${siteUrl}/legal/privacy.html`,
    offer: `${siteUrl}/legal/offer.html`,
  };
}

export function formatLegalGateMessage(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  if (code === 'en') {
    return [
      letterhead('Agreement', lang),
      '',
      'To continue using Lapis Vivus, please read the documents below and confirm your consent to personal data processing and the terms of the public offer.',
      '',
      '<i>After reading, tap «I accept».</i>',
    ].join('\n');
  }
  return [
    letterhead('Согласие', lang),
    '',
    'Для продолжения работы с Lapis Vivus необходимо ознакомиться с документами ниже и подтвердить согласие на обработку персональных данных и условия публичной оферты.',
    '',
    '<i>После ознакомления нажмите «Принимаю».</i>',
  ].join('\n');
}

function legalLinkRows(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  const labels = LABELS[code];
  const urls = getLegalDocUrls();

  if (!urls.privacy || !urls.offer) {
    return [];
  }

  return [
    [{ text: labels.privacy, url: urls.privacy }],
    [{ text: labels.offer, url: urls.offer }],
  ];
}

/** Экран до принятия: ссылки + кнопка «Принимаю». */
export function getLegalGateKeyboard(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  const rows = legalLinkRows(lang);
  rows.push([{ text: LABELS[code].accept, callback_data: 'nav:legal_accept' }]);
  return { inline_keyboard: rows };
}

/** Документы для справки (+ принять + назад). */
export function getLegalDocsKeyboard(lang, { includeAccept = true } = {}) {
  const code = lang === 'en' ? 'en' : 'ru';
  const rows = legalLinkRows(lang);

  if (includeAccept) {
    rows.push([{ text: LABELS[code].accept, callback_data: 'nav:legal_accept' }]);
  }

  return rows;
}
