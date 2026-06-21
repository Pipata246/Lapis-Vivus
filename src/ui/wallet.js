import { btn, escapeHtml, letterhead, section } from './brand.js';
import { PAYMENT_TTL_MINUTES } from '../config.js';
import { normalizeAnalysisProfile } from '../db/userAnalysisProfile.js';

export function formatBalanceRub(amountRub, lang = 'ru') {
  const formatted = Number(amountRub ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU');
  return `${formatted} ₽`;
}

function formatProfileDate(iso, lang = 'ru') {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatDisplayName(profile) {
  const full = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  if (full) return full;
  if (profile.username) return `@${profile.username}`;
  return null;
}

function countCompletedStages(analysisProfile) {
  const blocks = analysisProfile?.blocks ?? {};
  return Object.keys(blocks).filter((id) => blocks[id]?.json_payload || blocks[id]?.completed_at).length;
}

function formatBirthProfileSummary(userData, lang) {
  const parts = [];
  const gender = userData.gender_label || userData.gender;
  if (gender) {
    parts.push(lang === 'en' ? `Gender · ${gender}` : `Пол · ${gender}`);
  }
  if (userData.birth_date) {
    parts.push(lang === 'en' ? `Date · ${userData.birth_date}` : `Дата · ${userData.birth_date}`);
  }
  if (userData.birth_time) {
    parts.push(lang === 'en' ? `Time · ${userData.birth_time}` : `Время · ${userData.birth_time}`);
  }
  if (userData.birth_place) {
    parts.push(lang === 'en' ? `Place · ${userData.birth_place}` : `Место · ${userData.birth_place}`);
  }
  return parts;
}

/**
 * Карточка профиля для экрана «Мой профиль».
 */
export function formatUserProfileCard(profile, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const analysisProfile = normalizeAnalysisProfile(profile.profile);
  const userData = analysisProfile.user_data ?? {};
  const displayName = formatDisplayName(profile);
  const modulesDone = countCompletedStages(analysisProfile);
  const birthLines = formatBirthProfileSummary(userData, lang);
  const hasBirthProfile = birthLines.length > 0;

  const lines = [
    letterhead(code === 'en' ? 'Client profile' : 'Профиль клиента', lang),
    '',
  ];

  if (displayName) {
    lines.push(`👋 <b>${escapeHtml(displayName)}</b>`);
    if (profile.username && displayName !== `@${profile.username}`) {
      lines.push(`<i>@${escapeHtml(profile.username)}</i>`);
    }
    lines.push('');
  }

  const identityRows = [];
  const nameLine = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  if (nameLine) {
    identityRows.push(
      code === 'en'
        ? `Name · ${escapeHtml(nameLine)}`
        : `Имя · ${escapeHtml(nameLine)}`,
    );
  }
  if (profile.username) {
    identityRows.push(
      code === 'en'
        ? `Telegram · @${escapeHtml(profile.username)}`
        : `Telegram · @${escapeHtml(profile.username)}`,
    );
  }

  lines.push(
    section(
      code === 'en' ? 'Identity' : 'Личные данные',
      identityRows.join('\n'),
      '👤',
    ),
    '',
  );

  const langFlag = profile.language === 'ru' ? '🇷🇺' : '🇬🇧';
  const langName = profile.language === 'ru' ? 'Русский' : 'English';
  const accountRows = [
    code === 'en'
      ? `Language · ${langFlag} ${langName}`
      : `Язык · ${langFlag} ${langName}`,
  ];
  if (profile.is_premium) {
    accountRows.push(code === 'en' ? 'Telegram Premium · ✓' : 'Telegram Premium · ✓');
  }

  lines.push(
    section(code === 'en' ? 'Account' : 'Аккаунт', accountRows.join('\n'), '🌐'),
    '',
  );

  const protocolRows = [];
  if (modulesDone > 0) {
    protocolRows.push(
      code === 'en'
        ? `Steps completed · ${modulesDone}`
        : `Пройдено этапов · ${modulesDone}`,
    );
  } else {
    protocolRows.push(
      code === 'en' ? 'Steps completed · none yet' : 'Пройдено этапов · пока нет',
    );
  }

  if (hasBirthProfile) {
    protocolRows.push(
      code === 'en' ? 'Birth profile · filled' : 'Профиль рождения · заполнен',
    );
    protocolRows.push(...birthLines.map((line) => escapeHtml(line)));
  } else {
    protocolRows.push(
      code === 'en' ? 'Birth profile · not filled' : 'Профиль рождения · не заполнен',
    );
  }

  if (analysisProfile.updated_at) {
    protocolRows.push(
      code === 'en'
        ? `Last analysis · ${formatProfileDate(analysisProfile.updated_at, lang)}`
        : `Последний анализ · ${formatProfileDate(analysisProfile.updated_at, lang)}`,
    );
  }

  lines.push(
    section(code === 'en' ? 'Protocol' : 'Протокол', protocolRows.join('\n'), '📊'),
    '',
  );

  const historyRows = [
    code === 'en'
      ? `Registered · ${formatProfileDate(profile.created_at, lang)}`
      : `Регистрация · ${formatProfileDate(profile.created_at, lang)}`,
    code === 'en'
      ? `Last visit · ${formatProfileDate(profile.last_seen_at, lang)}`
      : `Последний визит · ${formatProfileDate(profile.last_seen_at, lang)}`,
  ];

  lines.push(section(code === 'en' ? 'History' : 'История', historyRows.join('\n'), '📅'));

  return lines.join('\n');
}

/** Экран «Баланс» — сумма и действия пополнения / магазина. */
export function formatBalanceCard(profile, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const balanceRub = profile.balance_rub ?? 0;
  const hint =
    code === 'en'
      ? 'Available for sessions and shop'
      : 'Доступен для сессий и магазина';

  return [
    letterhead(code === 'en' ? 'Balance' : 'Баланс', lang),
    '',
    `<b>${escapeHtml(formatBalanceRub(balanceRub, lang))}</b>`,
    `<i>${hint}</i>`,
  ].join('\n');
}

export function getProfileKeyboard(lang) {
  return {
    inline_keyboard: [[{ text: btn(lang, 'back'), callback_data: 'nav:main_menu' }]],
  };
}

export function getBalanceKeyboard(lang) {
  const topUpLabel = lang === 'en' ? '💳 Top up' : '💳 Пополнить';
  const shopLabel = lang === 'en' ? '🛒 Shop' : '🛒 Магазин';

  return {
    inline_keyboard: [
      [{ text: topUpLabel, callback_data: 'nav:topup' }],
      [{ text: shopLabel, callback_data: 'nav:shop' }],
      [{ text: btn(lang, 'back'), callback_data: 'nav:main_menu' }],
    ],
  };
}

export function getTopupCancelKeyboard(lang) {
  return {
    inline_keyboard: [[{ text: btn(lang, 'cancel'), callback_data: 'nav:topup_cancel' }]],
  };
}

export function getPaymentLinkKeyboard(confirmationUrl, lang) {
  const payLabel = lang === 'en' ? '💳 Pay' : '💳 Оплатить';
  return {
    inline_keyboard: [
      [{ text: payLabel, url: confirmationUrl }],
      [{ text: btn(lang, 'back'), callback_data: 'nav:balance' }],
    ],
  };
}

export function formatTopupPrompt(lang) {
  return lang === 'en'
    ? 'Enter the top-up amount in rubles (50–100,000).'
    : 'Введите сумму пополнения в рублях (от 50 до 100 000).';
}

export function formatTopupInvalidAmount(lang, { min, max } = {}) {
  if (min) {
    return lang === 'en'
      ? `Minimum top-up is ${min} ₽. Enter a whole number.`
      : `Минимальная сумма — ${min} ₽. Введите целое число.`;
  }
  if (max) {
    return lang === 'en'
      ? `Maximum top-up is ${max.toLocaleString('en-US')} ₽.`
      : `Максимальная сумма — ${max.toLocaleString('ru-RU')} ₽.`;
  }
  return lang === 'en'
    ? 'Enter a whole number in rubles, e.g. 500.'
    : 'Введите целое число в рублях, например 500.';
}

export function formatPaymentLinkMessage(amountRub, lang) {
  const amount = formatBalanceRub(amountRub, lang);
  const ttl = PAYMENT_TTL_MINUTES;
  return lang === 'en'
    ? `Amount · ${amount}\n\nPayment invoice is valid for ${ttl} minutes.`
    : `Сумма · ${amount}\n\nСчет на оплату действует ${ttl} минут.`;
}

export function formatShopStub(lang) {
  const code = lang === 'en' ? 'en' : 'ru';
  return [
    letterhead(code === 'en' ? 'Shop' : 'Магазин', lang),
    '',
    code === 'en'
      ? '<i>The curated shop is opening soon. Your balance will be available here.</i>'
      : '<i>Кураторский магазин скоро откроется. Баланс можно будет использовать здесь.</i>',
  ].join('\n');
}

export function formatTopupSuccessNotification(amountRub, balanceRub, lang) {
  const amount = formatBalanceRub(amountRub, lang);
  const balance = formatBalanceRub(balanceRub, lang);
  return lang === 'en'
    ? `Balance topped up · ${amount}\n\nCurrent balance · ${balance}`
    : `Баланс пополнен · ${amount}\n\nТекущий баланс · ${balance}`;
}
