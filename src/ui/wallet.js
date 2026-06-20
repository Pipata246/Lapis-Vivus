import { btn } from './brand.js';

export function formatBalanceRub(amountRub, lang = 'ru') {
  const formatted = Number(amountRub ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU');
  return `${formatted} ₽`;
}

export function getProfileKeyboard(lang) {
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
      [{ text: btn(lang, 'back'), callback_data: 'nav:profile' }],
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
  return lang === 'en'
    ? `Amount · ${amount}\n\nTap the button below to pay via YooKassa.`
    : `Сумма · ${amount}\n\nНажмите кнопку ниже для оплаты через ЮKassa.`;
}

export function formatShopStub(lang) {
  return lang === 'en'
    ? '👋 Hello! The shop will open here soon.'
    : '👋 Привет! Магазин скоро откроется здесь.';
}

export function formatTopupSuccessNotification(amountRub, balanceRub, lang) {
  const amount = formatBalanceRub(amountRub, lang);
  const balance = formatBalanceRub(balanceRub, lang);
  return lang === 'en'
    ? `✅ You topped up your balance by ${amount}.\n\nCurrent balance · ${balance}`
    : `✅ Вы пополнили баланс на ${amount}.\n\nТекущий баланс · ${balance}`;
}
