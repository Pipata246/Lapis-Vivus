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
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function countDialoguePairs(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.filter((m) => m.role === 'assistant' && m.kind !== 'welcome').length;
}

/** Текст приветствия (сохраняется в БД и показывается пользователю). */
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
    'Добро пожаловать в свободный диалог с Оракулом.',
    '',
    'Я вижу ваш профиль Lapis Vivus и могу говорить с вами о личных вопросах, символах и вашем маршруте.',
    '',
    `В этом чате — до ${MAX_ORACLE_AI_TURNS} моих ответов. Затем диалог сохранится в историю, и начнётся новый чат.`,
    '',
    'Напишите вопрос или мысль.',
  ].join('\n');
}

export function formatOracleReplyHtml(text) {
  const safe = escapeHtml(String(text ?? ''));
  return `🔮 <b>Оракул</b>\n\n${safe}`;
}

function formatOracleHistoryPair(userText, assistantText, lang = 'ru') {
  const yourLabel = lang === 'en' ? 'Your message' : 'Ваш вопрос';
  const myLabel = lang === 'en' ? 'Oracle' : 'Мой ответ';
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
      : `Осталось ответов: ${turnsLeft} из ${MAX_ORACLE_AI_TURNS}`;

  return [
    letterhead(code === 'en' ? 'Oracle' : 'Оракул', lang),
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
      : `Осталось ответов: ${left} из ${MAX_ORACLE_AI_TURNS}`;

  return [
    letterhead(code === 'en' ? 'Oracle · dialogue' : 'Оракул · диалог', lang),
    '',
    `<i>${status}</i>`,
    '',
    code === 'en' ? 'Write your question or thought.' : 'Напишите вопрос или мысль.',
  ].join('\n');
}

export function formatOracleHubScreen(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Oracle' : 'Оракул';
  const body =
    code === 'en'
      ? 'One active dialogue at a time. Up to 10 Oracle replies per chat — then it moves to history and a new chat opens.'
      : 'Один активный диалог. До 10 ответов Оракула в чате — затем он уходит в историю и открывается новый.';

  return [letterhead(title, lang), '', body, '', code === 'en' ? 'Choose:' : 'Выберите:'].join('\n');
}

export function formatOracleEmptyProfile(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Oracle' : 'Оракул';
  const body =
    code === 'en'
      ? 'Your birth profile is not filled yet. The Oracle needs your protocol data to speak personally with you.'
      : 'Ваш профиль рождения ещё не заполнен. Оракулу нужны данные протокола, чтобы говорить с вами персонально.';

  return [
    letterhead(title, lang),
    '',
    body,
    '',
    code === 'en' ? 'Complete the protocol first — it takes about a minute.' : 'Сначала пройдите протокол — это займёт около минуты.',
  ].join('\n');
}

export function formatOracleChatList(chats, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';

  if (!chats?.length) {
    return [
      letterhead(code === 'en' ? 'Chat history' : 'История чатов', lang),
      '',
      code === 'en' ? 'No archived chats yet.' : 'Архивных чатов пока нет.',
    ].join('\n');
  }

  const lines = chats.map((chat, index) => {
    const pairs = countDialoguePairs(chat.messages);
    const date = formatChatDate(chat.updated_at ?? chat.created_at, lang);
    const label = code === 'en' ? `Chat ${index + 1}` : `Чат ${index + 1}`;
    return `◆ <b>${label}</b> · ${date}\n<i>${code === 'en' ? 'Exchanges' : 'Диалогов'}: ${pairs}</i>`;
  });

  return [
    letterhead(code === 'en' ? 'Chat history' : 'История чатов', lang),
    '',
    `<i>${code === 'en' ? `Up to ${MAX_ORACLE_HISTORY} archived chats` : `До ${MAX_ORACLE_HISTORY} чатов в истории`}</i>`,
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
      letterhead(code === 'en' ? 'Chat history' : 'История чата', lang),
      '',
      code === 'en' ? 'This chat is empty.' : 'В этом чате нет сообщений.',
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
      pairs.push(`<b>${code === 'en' ? 'Oracle' : 'Мой ответ'}:</b>\n${escapeHtml(msg.content)}`);
    }
  }

  if (pendingUser !== null) {
    pairs.push(`<b>${code === 'en' ? 'Your message' : 'Ваш вопрос'}:</b>\n${escapeHtml(pendingUser)}`);
  }

  const body = pairs.join('\n\n—\n\n');
  const truncated = body.length > 3600 ? `${body.slice(0, 3600)}\n\n<i>…</i>` : body;

  return [letterhead(code === 'en' ? 'Chat history' : 'История чата', lang), '', truncated].join('\n');
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
    const label = lang === 'en' ? `📜 Chat ${index + 1}` : `📜 Чат ${index + 1}`;
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
