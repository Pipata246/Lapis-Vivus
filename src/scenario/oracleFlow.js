import { letterhead, escapeHtml, btn } from '../ui/brand.js';
import { CALLBACK_PREFIX } from './constants.js';
import { MAX_ORACLE_AI_TURNS, MAX_ORACLE_HISTORY } from '../db/oracle.js';

export function isOracleMode(data) {
  return Boolean(data?.oracle_mode);
}

function cb(action, value = null) {
  return value ? `${CALLBACK_PREFIX}:${action}:${value}` : `${CALLBACK_PREFIX}:${action}`;
}

function formatChatDate(iso, lang) {
  if (!iso) return 'тАФ';
  try {
    return new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'тАФ';
  }
}

function countDialoguePairs(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.filter((m) => m.role === 'assistant' && m.kind !== 'welcome').length;
}

/** ╨в╨╡╨║╤Б╤В ╨┐╤А╨╕╨▓╨╡╤В╤Б╤В╨▓╨╕╤П (╤Б╨╛╤Е╤А╨░╨╜╤П╨╡╤В╤Б╤П ╨▓ ╨С╨Ф ╨╕ ╨┐╨╛╨║╨░╨╖╤Л╨▓╨░╨╡╤В╤Б╤П ╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤О). */
export function getOracleWelcomeText(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';

  if (code === 'en') {
    return [
      'Welcome to a free dialogue with the Oracle.',
      '',
      'I see your Lapis Vivus profile and can speak with you about personal questions, symbols, and your route.',
      '',
      `This chat holds up to ${MAX_ORACLE_AI_TURNS} of my replies. Then the dialogue is saved to history and a new chat begins.`,
      '',
      'Write your question or thought.',
    ].join('\n');
  }

  return [
    '╨Ф╨╛╨▒╤А╨╛ ╨┐╨╛╨╢╨░╨╗╨╛╨▓╨░╤В╤М ╨▓ ╤Б╨▓╨╛╨▒╨╛╨┤╨╜╤Л╨╣ ╨┤╨╕╨░╨╗╨╛╨│ ╤Б ╨Ю╤А╨░╨║╤Г╨╗╨╛╨╝.',
    '',
    '╨п ╨▓╨╕╨╢╤Г ╨▓╨░╤И ╨┐╤А╨╛╤Д╨╕╨╗╤М Lapis Vivus ╨╕ ╨╝╨╛╨│╤Г ╨│╨╛╨▓╨╛╤А╨╕╤В╤М ╤Б ╨▓╨░╨╝╨╕ ╨╛ ╨╗╨╕╤З╨╜╤Л╤Е ╨▓╨╛╨┐╤А╨╛╤Б╨░╤Е, ╤Б╨╕╨╝╨▓╨╛╨╗╨░╤Е ╨╕ ╨▓╨░╤И╨╡╨╝ ╨╝╨░╤А╤И╤А╤Г╤В╨╡.',
    '',
    `╨Т ╤Н╤В╨╛╨╝ ╤З╨░╤В╨╡ тАФ ╨┤╨╛ ${MAX_ORACLE_AI_TURNS} ╨╝╨╛╨╕╤Е ╨╛╤В╨▓╨╡╤В╨╛╨▓. ╨Ч╨░╤В╨╡╨╝ ╨┤╨╕╨░╨╗╨╛╨│ ╤Б╨╛╤Е╤А╨░╨╜╨╕╤В╤Б╤П ╨▓ ╨╕╤Б╤В╨╛╤А╨╕╤О, ╨╕ ╨╜╨░╤З╨╜╤С╤В╤Б╤П ╨╜╨╛╨▓╤Л╨╣ ╤З╨░╤В.`,
    '',
    '╨Э╨░╨┐╨╕╤И╨╕╤В╨╡ ╨▓╨╛╨┐╤А╨╛╤Б ╨╕╨╗╨╕ ╨╝╤Л╤Б╨╗╤М.',
  ].join('\n');
}

export function formatOracleReplyHtml(text) {
  const safe = escapeHtml(String(text ?? ''));
  return `ЁЯФо <b>╨Ю╤А╨░╨║╤Г╨╗</b>\n\n${safe}`;
}

function formatOracleHistoryPair(userText, assistantText, lang = 'ru') {
  const yourLabel = lang === 'en' ? 'Your message' : '╨Т╨░╤И ╨╛╤В╨▓╨╡╤В';
  const myLabel = lang === 'en' ? 'Oracle' : '╨Ь╨╛╨╣ ╨╛╤В╨▓╨╡╤В';
  return [
    `<b>${yourLabel}:</b>\n${escapeHtml(userText)}`,
    '',
    `<b>${myLabel}:</b>\n${escapeHtml(assistantText)}`,
  ].join('\n');
}

export function formatOracleWelcomeScreen(lang = 'ru', turnsLeft = MAX_ORACLE_AI_TURNS) {
  const code = lang === 'en' ? 'en' : 'ru';
  const status =
    code === 'en'
      ? `Replies left: ${turnsLeft} of ${MAX_ORACLE_AI_TURNS}`
      : `╨Ю╤Б╤В╨░╨╗╨╛╤Б╤М ╨╛╤В╨▓╨╡╤В╨╛╨▓: ${turnsLeft} ╨╕╨╖ ${MAX_ORACLE_AI_TURNS}`;

  return [
    letterhead(code === 'en' ? 'Oracle' : '╨Ю╤А╨░╨║╤Г╨╗', lang),
    '',
    escapeHtml(getOracleWelcomeText(lang)),
    '',
    `<i>${status}</i>`,
  ].join('\n');
}

export function isFreshOracleChat(chat) {
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];
  if (messages.length === 0) return true;
  if (messages.length === 1 && messages[0]?.kind === 'welcome') return true;
  return messages.length <= 1 && !messages.some((m) => m.role === 'user');
}

export function formatOracleActiveScreen(chat, lang = 'ru') {
  const turns = chat?.ai_turns ?? 0;
  const left = Math.max(0, MAX_ORACLE_AI_TURNS - turns);

  if (isFreshOracleChat(chat)) {
    return formatOracleWelcomeScreen(lang, left);
  }

  const code = lang === 'en' ? 'en' : 'ru';
  const status =
    code === 'en'
      ? `Replies left: ${left} of ${MAX_ORACLE_AI_TURNS}`
      : `╨Ю╤Б╤В╨░╨╗╨╛╤Б╤М ╨╛╤В╨▓╨╡╤В╨╛╨▓: ${left} ╨╕╨╖ ${MAX_ORACLE_AI_TURNS}`;

  return [
    letterhead(code === 'en' ? 'Oracle ┬╖ dialogue' : '╨Ю╤А╨░╨║╤Г╨╗ ┬╖ ╨┤╨╕╨░╨╗╨╛╨│', lang),
    '',
    `<i>${status}</i>`,
    '',
    code === 'en' ? 'Write your question or thought.' : '╨Э╨░╨┐╨╕╤И╨╕╤В╨╡ ╨▓╨╛╨┐╤А╨╛╤Б ╨╕╨╗╨╕ ╨╝╤Л╤Б╨╗╤М.',
  ].join('\n');
}

export function formatOracleHubScreen(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Oracle' : '╨Ю╤А╨░╨║╤Г╨╗';
  const body =
    code === 'en'
      ? 'One active dialogue at a time. Up to 10 Oracle replies per chat тАФ then it moves to history and a new chat opens.'
      : '╨Ю╨┤╨╕╨╜ ╨░╨║╤В╨╕╨▓╨╜╤Л╨╣ ╨┤╨╕╨░╨╗╨╛╨│. ╨Ф╨╛ 10 ╨╛╤В╨▓╨╡╤В╨╛╨▓ ╨Ю╤А╨░╨║╤Г╨╗╨░ ╨▓ ╤З╨░╤В╨╡ тАФ ╨╖╨░╤В╨╡╨╝ ╨╛╨╜ ╤Г╤Е╨╛╨┤╨╕╤В ╨▓ ╨╕╤Б╤В╨╛╤А╨╕╤О ╨╕ ╨╛╤В╨║╤А╤Л╨▓╨░╨╡╤В╤Б╤П ╨╜╨╛╨▓╤Л╨╣.';

  return [letterhead(title, lang), '', body, '', code === 'en' ? 'Choose:' : '╨Т╤Л╨▒╨╡╤А╨╕╤В╨╡:'].join('\n');
}

export function formatOracleEmptyProfile(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Oracle' : '╨Ю╤А╨░╨║╤Г╨╗';
  const body =
    code === 'en'
      ? 'Your birth profile is not filled yet. The Oracle needs your protocol data to speak personally with you.'
      : '╨Т╨░╤И ╨┐╤А╨╛╤Д╨╕╨╗╤М ╤А╨╛╨╢╨┤╨╡╨╜╨╕╤П ╨╡╤Й╤С ╨╜╨╡ ╨╖╨░╨┐╨╛╨╗╨╜╨╡╨╜. ╨Ю╤А╨░╨║╤Г╨╗╤Г ╨╜╤Г╨╢╨╜╤Л ╨┤╨░╨╜╨╜╤Л╨╡ ╨┐╤А╨╛╤В╨╛╨║╨╛╨╗╨░, ╤З╤В╨╛╨▒╤Л ╨│╨╛╨▓╨╛╤А╨╕╤В╤М ╤Б ╨▓╨░╨╝╨╕ ╨┐╨╡╤А╤Б╨╛╨╜╨░╨╗╤М╨╜╨╛.';

  return [
    letterhead(title, lang),
    '',
    body,
    '',
    code === 'en' ? 'Complete the protocol first тАФ it takes about a minute.' : '╨б╨╜╨░╤З╨░╨╗╨░ ╨┐╤А╨╛╨╣╨┤╨╕╤В╨╡ ╨┐╤А╨╛╤В╨╛╨║╨╛╨╗ тАФ ╤Н╤В╨╛ ╨╖╨░╨╣╨╝╤С╤В ╨╛╨║╨╛╨╗╨╛ ╨╝╨╕╨╜╤Г╤В╤Л.',
  ].join('\n');
}

export function formatOracleChatList(chats, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';

  if (!chats?.length) {
    return [
      letterhead(code === 'en' ? 'Chat history' : '╨Ш╤Б╤В╨╛╤А╨╕╤П ╤З╨░╤В╨╛╨▓', lang),
      '',
      code === 'en' ? 'No archived chats yet.' : '╨Р╤А╤Е╨╕╨▓╨╜╤Л╤Е ╤З╨░╤В╨╛╨▓ ╨┐╨╛╨║╨░ ╨╜╨╡╤В.',
    ].join('\n');
  }

  const lines = chats.map((chat, index) => {
    const pairs = countDialoguePairs(chat.messages);
    const date = formatChatDate(chat.updated_at ?? chat.created_at, lang);
    const label = code === 'en' ? `Chat ${index + 1}` : `╨з╨░╤В ${index + 1}`;
    return `тЧЖ <b>${label}</b> ┬╖ ${date}\n<i>${code === 'en' ? 'Exchanges' : '╨Ф╨╕╨░╨╗╨╛╨│╨╛╨▓'}: ${pairs}</i>`;
  });

  return [
    letterhead(code === 'en' ? 'Chat history' : '╨Ш╤Б╤В╨╛╤А╨╕╤П ╤З╨░╤В╨╛╨▓', lang),
    '',
    `<i>${code === 'en' ? `Up to ${MAX_ORACLE_HISTORY} archived chats` : `╨Ф╨╛ ${MAX_ORACLE_HISTORY} ╤З╨░╤В╨╛╨▓ ╨▓ ╨╕╤Б╤В╨╛╤А╨╕╨╕`}</i>`,
    '',
    lines.join('\n\n'),
  ].join('\n');
}

export function formatOracleHistoryView(chat, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const messages = (Array.isArray(chat?.messages) ? chat.messages : []).filter(
    (m) => m.kind !== 'welcome',
  );

  if (messages.length === 0) {
    return [
      letterhead(code === 'en' ? 'Chat history' : '╨Ш╤Б╤В╨╛╤А╨╕╤П ╤З╨░╤В╨░', lang),
      '',
      code === 'en' ? 'This chat is empty.' : '╨Т ╤Н╤В╨╛╨╝ ╤З╨░╤В╨╡ ╨╜╨╡╤В ╤Б╨╛╨╛╨▒╤Й╨╡╨╜╨╕╨╣.',
    ].join('\n');
  }

  const pairs = [];
  let pendingUser = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      pendingUser = msg.content;
    } else if (msg.role === 'assistant' && pendingUser !== null) {
      pairs.push(formatOracleHistoryPair(pendingUser, msg.content, lang));
      pendingUser = null;
    } else if (msg.role === 'assistant') {
      pairs.push(`<b>${code === 'en' ? 'Oracle' : '╨Ь╨╛╨╣ ╨╛╤В╨▓╨╡╤В'}:</b>\n${escapeHtml(msg.content)}`);
    }
  }

  if (pendingUser !== null) {
    pairs.push(`<b>${code === 'en' ? 'Your message' : '╨Т╨░╤И ╨╛╤В╨▓╨╡╤В'}:</b>\n${escapeHtml(pendingUser)}`);
  }

  const body = pairs.join('\n\nтАФ\n\n');
  const truncated = body.length > 3600 ? `${body.slice(0, 3600)}\n\n<i>тАж</i>` : body;

  return [letterhead(code === 'en' ? 'Chat history' : '╨Ш╤Б╤В╨╛╤А╨╕╤П ╤З╨░╤В╨░', lang), '', truncated].join('\n');
}

export function oracleHubKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'oracleChats'), callback_data: cb('oracle_chats') }],
      [
        { text: btn(lang, 'oracleNewChat'), callback_data: cb('oracle_new') },
        { text: btn(lang, 'oracleLastChat'), callback_data: cb('oracle_last') },
      ],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function oracleEmptyChatsKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [[{ text: btn(lang, 'back'), callback_data: cb('oracle_start') }]],
  };
}

export function oracleChatListKeyboard(chats, lang = 'ru') {
  const rows = (chats ?? []).map((chat, index) => {
    const label = lang === 'en' ? `ЁЯУЬ Chat ${index + 1}` : `ЁЯУЬ ╨з╨░╤В ${index + 1}`;
    return [
      { text: label, callback_data: cb('oracle_open', chat.id) },
      { text: btn(lang, 'oracleDelete'), callback_data: cb('oracle_delete', chat.id) },
    ];
  });

  rows.push([{ text: btn(lang, 'back'), callback_data: cb('oracle_start') }]);

  return { inline_keyboard: rows };
}

export function oracleActiveChatKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'oracleChats'), callback_data: cb('oracle_chats') }],
      [{ text: btn(lang, 'oracleNewChat'), callback_data: cb('oracle_new') }],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function oracleViewChatKeyboard(chatId, lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'oracleDelete'), callback_data: cb('oracle_delete', chatId) }],
      [{ text: btn(lang, 'back'), callback_data: cb('oracle_chats') }],
    ],
  };
}

export function oracleEmptyProfileKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'startAnalysis'), callback_data: cb('start') }],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function oracleRunningKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [[{ text: btn(lang, 'menu'), callback_data: cb('menu') }]],
  };
}
