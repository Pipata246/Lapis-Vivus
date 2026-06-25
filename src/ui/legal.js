import { letterhead, COMMUNITY, languageSwapRow } from './brand.js';
import { loadSiteConfig } from '../config.js';

const LABELS = {
  ru: {
    privacy: 'Политика',
    offer: 'Оферта',
    accept: '✓ Принимаю',
  },
  en: {
    privacy: 'Privacy',
    offer: 'Offer',
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

export function formatLegalGateMessage(lang = 'ru', { needSubscription = false } = {}) {
  const code = lang === 'en' ? 'en' : 'ru';
  const community = `<a href="${COMMUNITY.telegramUrl}">${COMMUNITY.telegramMention}</a>`;

  if (code === 'en') {
    const lines = [
      letterhead('Agreement', lang),
      '',
      'To continue using Lapis Vivus:',
      '',
      '1. Read the documents below',
      `2. Join the community ${community}`,
      '3. Tap «I accept»',
      '',
      '<i>Subscription is verified automatically when you accept.</i>',
    ];
    if (needSubscription) {
      lines.push('', `⚠️ <b>Join ${community} first, then tap «I accept» again.</b>`);
    }
    return lines.join('\n');
  }

  const lines = [
    letterhead('Согласие', lang),
    '',
    'Для продолжения работы с Lapis Vivus:',
    '',
    '1. Ознакомьтесь с документами ниже',
    `2. Подпишитесь на сообщество ${community}`,
    '3. Нажмите «Принимаю»',
    '',
    '<i>Подписка проверяется автоматически при нажатии «Принимаю».</i>',
  ];
  if (needSubscription) {
    lines.push('', `⚠️ <b>Сначала подпишитесь на ${community}, затем снова нажмите «Принимаю».</b>`);
  }
  return lines.join('\n');
}

export function formatSubscriptionGateMessage(lang = 'ru', { needSubscription = false } = {}) {
  const code = lang === 'en' ? 'en' : 'ru';
  const community = `<a href="${COMMUNITY.telegramUrl}">${COMMUNITY.telegramMention}</a>`;

  if (code === 'en') {
    const lines = [
      letterhead('Community', lang),
      '',
      `Lapis Vivus is available to members of ${community}.`,
      '',
      '1. Join the community',
      '2. Tap «Check subscription»',
      '',
      '<i>Subscription is verified automatically when you continue.</i>',
    ];
    if (needSubscription) {
      lines.push('', `⚠️ <b>Join ${community}, then tap «Check subscription».</b>`);
    }
    return lines.join('\n');
  }

  const lines = [
    letterhead('Сообщество', lang),
    '',
    `Lapis Vivus доступен участникам ${community}.`,
    '',
    '1. Подпишитесь на сообщество',
    '2. Нажмите «Проверить подписку»',
    '',
    '<i>Подписка проверяется автоматически при продолжении работы.</i>',
  ];
  if (needSubscription) {
    lines.push('', `⚠️ <b>Подпишитесь на ${community}, затем нажмите «Проверить подписку».</b>`);
  }
  return lines.join('\n');
}

function legalLinkRows(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  const labels = LABELS[code];
  const urls = getLegalDocUrls();

  if (!urls.privacy || !urls.offer) {
    return [];
  }

  return [[{ text: labels.privacy, url: urls.privacy }, { text: labels.offer, url: urls.offer }]];
}

function communityLinkRow(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  const label =
    code === 'en'
      ? `👥 Join community · ${COMMUNITY.telegramMention}`
      : `👥 Подписаться · ${COMMUNITY.telegramMention}`;
  return [{ text: label, url: COMMUNITY.telegramUrl }];
}

/** Экран до принятия: документы + сообщество + «Принимаю». */
export function getLegalGateKeyboard(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  const rows = legalLinkRows(lang);
  rows.push(communityLinkRow(lang));
  rows.push(languageSwapRow(lang));
  rows.push([{ text: LABELS[code].accept, callback_data: 'nav:legal_accept' }]);
  return { inline_keyboard: rows };
}

/** Экран для пользователей с принятым согласием, но без подписки на сообщество. */
export function getSubscriptionGateKeyboard(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  const checkLabel = code === 'en' ? '✓ Check subscription' : '✓ Проверить подписку';
  return {
    inline_keyboard: [
      communityLinkRow(lang),
      [{ text: checkLabel, callback_data: 'nav:sub_check' }],
      languageSwapRow(lang),
    ],
  };
}

/** Ссылки на документы для справки (без «Принимаю»). */
export function getLegalDocsKeyboard(lang) {
  return legalLinkRows(lang);
}
