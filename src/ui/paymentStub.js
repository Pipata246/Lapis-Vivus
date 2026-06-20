/**
 * Заглушки оплаты ЮKassa для скриншотов при подключении магазина.
 * Удалить после интеграции реальной оплаты.
 */

import { BRAND, btn, escapeHtml, letterhead, section } from './brand.js';

/** @typedef {{ id: string, priceRub: number, period?: string, title: { ru: string, en: string }, description: { ru: string, en: string }, features: { ru: string[], en: string[] } }} SubscriptionPlan */

/** @type {SubscriptionPlan[]} */
export const SUBSCRIPTION_PLANS = [
  {
    id: 'single',
    priceRub: 2990,
    title: {
      ru: 'Полная сессия анализа',
      en: 'Full analysis session',
    },
    description: {
      ru: 'Разовый доступ ко всем модулям Lapis Vivus — от карты происхождения до протокола интеграции.',
      en: 'One-time access to all Lapis Vivus modules — from origin mapping to integration protocol.',
    },
    features: {
      ru: [
        'Полный маршрут сессии',
        'Персональный профиль рождения',
        'Сохранение результатов в профиле',
      ],
      en: [
        'Full session route',
        'Personal birth profile',
        'Results saved to profile',
      ],
    },
  },
  {
    id: 'monthly',
    priceRub: 990,
    period: 'month',
    title: {
      ru: 'Подписка · 1 месяц',
      en: 'Subscription · 1 month',
    },
    description: {
      ru: 'Ежемесячный доступ к сессиям анализа и обновлениям протокола.',
      en: 'Monthly access to analysis sessions and protocol updates.',
    },
    features: {
      ru: [
        'Неограниченные сессии в течение месяца',
        'Приоритетная обработка модулей',
        'Доступ к новым модулям',
      ],
      en: [
        'Unlimited sessions during the month',
        'Priority module processing',
        'Access to new modules',
      ],
    },
  },
  {
    id: 'annual',
    priceRub: 8990,
    period: 'year',
    title: {
      ru: 'Подписка · 12 месяцев',
      en: 'Subscription · 12 months',
    },
    description: {
      ru: 'Годовой доступ со скидкой — для регулярной работы с протоколом.',
      en: 'Annual access at a discount — for regular work with the protocol.',
    },
    features: {
      ru: [
        'Все возможности месячной подписки',
        'Экономия 2 890 ₽ относительно помесячной оплаты',
        'Закрепление тарифа на 12 месяцев',
      ],
      en: [
        'All monthly subscription features',
        'Save 2,890 ₽ vs monthly billing',
        'Rate locked for 12 months',
      ],
    },
  },
];

export function formatPriceRub(amount, lang = 'ru') {
  const formatted = amount.toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU');
  return lang === 'en' ? `${formatted} ₽` : `${formatted} ₽`;
}

export function getPlanById(planId) {
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId) ?? null;
}

function formatPlanCard(plan, lang, index) {
  const title = plan.title[lang === 'en' ? 'en' : 'ru'];
  const desc = plan.description[lang === 'en' ? 'en' : 'ru'];
  const features = plan.features[lang === 'en' ? 'en' : 'ru'];
  const priceLine =
    plan.period === 'month'
      ? lang === 'en'
        ? `<b>${formatPriceRub(plan.priceRub, lang)}</b> / month`
        : `<b>${formatPriceRub(plan.priceRub, lang)}</b> / месяц`
      : plan.period === 'year'
        ? lang === 'en'
          ? `<b>${formatPriceRub(plan.priceRub, lang)}</b> / year`
          : `<b>${formatPriceRub(plan.priceRub, lang)}</b> / год`
        : `<b>${formatPriceRub(plan.priceRub, lang)}</b>`;

  const featureLines = features.map((f) => `  · ${escapeHtml(f)}`).join('\n');

  return (
    `<b>${index + 1}. ${escapeHtml(title)}</b>\n` +
    `${priceLine}\n\n` +
    `${escapeHtml(desc)}\n\n` +
    featureLines
  );
}

export function formatSubscriptionStatus(lang) {
  const label = lang === 'en' ? 'Subscription' : 'Подписка';
  const value =
    lang === 'en'
      ? 'Inactive · choose a plan below'
      : 'Не активна · выберите тариф ниже';
  return `${label}\n${value}`;
}

export function formatSubscriptionCatalog(lang) {
  const heading = lang === 'en' ? 'Plans & pricing' : 'Тарифы и цены';
  const intro =
    lang === 'en'
      ? 'Digital services of Lapis Vivus. Select a plan to proceed to checkout.'
      : 'Цифровые услуги Lapis Vivus. Выберите тариф для перехода к оформлению заказа.';

  const cards = SUBSCRIPTION_PLANS.map((plan, i) => formatPlanCard(plan, lang, i)).join(
    '\n\n───────────────\n\n',
  );

  return [
    letterhead(heading, lang),
    '',
    intro,
    '',
    cards,
    '',
    lang === 'en'
      ? '<i>Tap a plan below to open checkout.</i>'
      : '<i>Нажмите на тариф ниже, чтобы перейти к оформлению заказа.</i>',
  ].join('\n');
}

export function formatCheckout(plan, lang) {
  const title = plan.title[lang === 'en' ? 'en' : 'ru'];
  const desc = plan.description[lang === 'en' ? 'en' : 'ru'];
  const heading = lang === 'en' ? 'Checkout' : 'Оформление заказа';
  const orderLabel = lang === 'en' ? 'Order' : 'Заказ';
  const orderId = `LV-${Date.now().toString().slice(-8)}`;
  const serviceLabel = lang === 'en' ? 'Service' : 'Услуга';
  const priceLabel = lang === 'en' ? 'Amount due' : 'К оплате';
  const methodLabel = lang === 'en' ? 'Payment method' : 'Способ оплаты';
  const methodValue = lang === 'en' ? 'Bank card (YooKassa)' : 'Банковская карта (ЮKassa)';
  const buyerLabel = lang === 'en' ? 'Buyer' : 'Покупатель';
  const buyerValue = lang === 'en' ? 'Telegram user' : 'Пользователь Telegram';

  const periodNote =
    plan.period === 'month'
      ? lang === 'en'
        ? 'Billing period · 1 month'
        : 'Период · 1 месяц'
      : plan.period === 'year'
        ? lang === 'en'
          ? 'Billing period · 12 months'
          : 'Период · 12 месяцев'
        : lang === 'en'
          ? 'One-time purchase'
          : 'Разовая покупка';

  return [
    letterhead(heading, lang),
    '',
    section(orderLabel, `${orderId}\n${periodNote}`, '🧾'),
    '',
    section(serviceLabel, `${escapeHtml(title)}\n${escapeHtml(desc)}`, '💎'),
    '',
    section(buyerLabel, buyerValue, '👤'),
    '',
    section(methodLabel, methodValue, '💳'),
    '',
    section(priceLabel, `<b>${formatPriceRub(plan.priceRub, lang)}</b>`, '💰'),
    '',
    lang === 'en'
      ? '<i>By tapping Pay you confirm the order and proceed to secure payment.</i>'
      : '<i>Нажимая «Оплатить», вы подтверждаете заказ и переходите к безопасной оплате.</i>',
  ].join('\n');
}

export function formatPaymentPending(plan, lang) {
  const title = plan.title[lang === 'en' ? 'en' : 'ru'];
  const heading = lang === 'en' ? 'Payment' : 'Оплата';
  const amount = formatPriceRub(plan.priceRub, lang);

  return [
    letterhead(heading, lang),
    '',
    lang === 'en'
      ? `<b>${escapeHtml(title)}</b>\nAmount · ${amount}`
      : `<b>${escapeHtml(title)}</b>\nСумма · ${amount}`,
    '',
    lang === 'en'
      ? '⏳ <b>Awaiting YooKassa connection</b>\n\nThe payment window will open here after the store is activated. This screen is a preview for store verification.'
      : '⏳ <b>Ожидание подключения ЮKassa</b>\n\nОкно оплаты откроется здесь после активации магазина. Этот экран — превью для проверки при подключении.',
    '',
    lang === 'en'
      ? `<i>${BRAND.name} · digital services</i>`
      : `<i>${BRAND.name} · цифровые услуги</i>`,
  ].join('\n');
}

function planButtonLabel(plan, lang) {
  const title = plan.title[lang === 'en' ? 'en' : 'ru'];
  const price =
    plan.period === 'month'
      ? lang === 'en'
        ? `${formatPriceRub(plan.priceRub, lang)}/mo`
        : `${formatPriceRub(plan.priceRub, lang)}/мес`
      : plan.period === 'year'
        ? lang === 'en'
          ? `${formatPriceRub(plan.priceRub, lang)}/yr`
          : `${formatPriceRub(plan.priceRub, lang)}/год`
        : formatPriceRub(plan.priceRub, lang);
  return `${title} · ${price}`;
}

export function getProfileKeyboard(lang) {
  const subscriptionLabel =
    lang === 'en' ? '💳 Subscription & payment' : '💳 Подписка и оплата';

  return {
    inline_keyboard: [
      [{ text: subscriptionLabel, callback_data: 'nav:subscription' }],
      [{ text: btn(lang, 'back'), callback_data: 'nav:main_menu' }],
    ],
  };
}

export function getSubscriptionCatalogKeyboard(lang) {
  const rows = SUBSCRIPTION_PLANS.map((plan) => [
    {
      text: planButtonLabel(plan, lang),
      callback_data: `pay:select:${plan.id}`,
    },
  ]);

  rows.push([{ text: btn(lang, 'back'), callback_data: 'nav:profile' }]);

  return { inline_keyboard: rows };
}

export function getCheckoutKeyboard(plan, lang) {
  const payLabel =
    lang === 'en'
      ? `💳 Pay ${formatPriceRub(plan.priceRub, lang)}`
      : `💳 Оплатить ${formatPriceRub(plan.priceRub, lang)}`;

  return {
    inline_keyboard: [
      [{ text: payLabel, callback_data: `pay:confirm:${plan.id}` }],
      [{ text: lang === 'en' ? '◀️ All plans' : '◀️ Все тарифы', callback_data: 'nav:subscription' }],
      [{ text: btn(lang, 'back'), callback_data: 'nav:profile' }],
    ],
  };
}

export function getPaymentPendingKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: lang === 'en' ? '◀️ Back to checkout' : '◀️ К оформлению', callback_data: 'nav:subscription' }],
      [{ text: btn(lang, 'back'), callback_data: 'nav:profile' }],
    ],
  };
}
