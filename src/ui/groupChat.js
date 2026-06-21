import { letterhead, section, SUPPORT, COMMUNITY, BRAND, escapeHtml } from './brand.js';

function openBotUrl(username) {
  const handle = username?.replace(/^@/, '') || '';
  return handle ? `https://t.me/${handle}?start=from_group` : null;
}

export function getOpenBotKeyboard(username, lang = 'ru') {
  const url = openBotUrl(username);
  if (!url) return undefined;

  const label = lang === 'en' ? '💎 Open Lapis Vivus' : '💎 Открыть Lapis Vivus';
  return { inline_keyboard: [[{ text: label, url }]] };
}

/** Правила беседы — показываются при входе бота и по /rules. */
export function formatGroupRules(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';

  if (code === 'en') {
    return [
      letterhead('Community rules', lang),
      '',
      `<i>${BRAND.tagline.en}</i>`,
      '',
      section(
        'How the bot works',
        'Lapis Vivus runs only in <b>private chat</b>. Here in the group the bot does not answer messages — use the button below to launch your protocol.',
        '🤖',
      ),
      '',
      section(
        'Group etiquette',
        [
          '· Respectful communication',
          '· No spam, ads or off-topic floods',
          '· Do not share other people\'s personal data or protocol results',
          '· Questions about the service — ' + SUPPORT.telegramMention,
        ].join('\n'),
        '📜',
      ),
      '',
      `<i>Community · ${COMMUNITY.telegramMention}</i>`,
    ].join('\n');
  }

  return [
    letterhead('Правила беседы', lang),
    '',
    `<i>${BRAND.tagline.ru}</i>`,
    '',
    section(
      'Как работает бот',
      'Lapis Vivus работает только в <b>личных сообщениях</b>. В этой беседе бот не отвечает на сообщения — протокол запускается через кнопку ниже.',
      '🤖',
    ),
    '',
    section(
      'Правила общения',
      [
        '· Уважительное общение',
        '· Без спама, рекламы и флуда',
        '· Не публикуйте чужие персональные данные и результаты протокола',
        '· Вопросы по сервису — ' + SUPPORT.telegramMention,
      ].join('\n'),
      '📜',
    ),
    '',
    `<i>Сообщество · ${COMMUNITY.telegramMention}</i>`,
  ].join('\n');
}

/** Краткий ответ на /start в беседе. */
export function formatGroupStartHint(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  if (code === 'en') {
    return [
      letterhead('Lapis Vivus', lang),
      '',
      'This bot works in <b>private chat only</b>.',
      '',
      'Tap the button below to open the bot and start your protocol.',
      '',
      'Group rules · /rules',
    ].join('\n');
  }

  return [
    letterhead('Lapis Vivus', lang),
    '',
    'Бот работает только в <b>личных сообщениях</b>.',
    '',
    'Нажмите кнопку ниже, чтобы открыть бота и запустить протокол.',
    '',
    'Правила беседы · /rules',
  ].join('\n');
}

/** Приветствие нового участника. */
export function formatGroupWelcome(names, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const list = (names ?? []).filter(Boolean).map((n) => escapeHtml(n));
  const who =
    list.length === 0
      ? code === 'en'
        ? 'there'
        : 'друг'
      : list.length === 1
        ? list[0]
        : list.slice(0, -1).join(', ') + (code === 'en' ? ' and ' : ' и ') + list[list.length - 1];

  if (code === 'en') {
    return [
      letterhead('Welcome', lang),
      '',
      `Glad to have you, <b>${who}</b>.`,
      '',
      'Lapis Vivus is a personal analysis protocol — it runs in private chat with the bot, not here in the group.',
      '',
      'Read /rules and open the bot when you\'re ready.',
    ].join('\n');
  }

  return [
    letterhead('Добро пожаловать', lang),
    '',
    `Рады видеть вас, <b>${who}</b>.`,
    '',
    'Lapis Vivus — персональный протокол анализа. Он работает в личном чате с ботом, а не в этой беседе.',
    '',
    'Ознакомьтесь с /rules и откройте бота, когда будете готовы.',
  ].join('\n');
}
