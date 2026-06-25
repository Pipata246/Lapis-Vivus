import { letterhead, escapeHtml, btn, section } from '../ui/brand.js';
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

function dialogueMessages(chat) {
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];
  return messages.filter((m) => m.kind !== 'welcome');
}

function countDialoguePairs(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.filter((m) => m.role === 'assistant' && m.kind !== 'welcome').length;
}

function clipPreview(text, max = 72) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function lastUserPreview(chat) {
  const messages = dialogueMessages(chat);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser ? clipPreview(lastUser.content) : '';
}

/** Текст приветствия нового чата (сохраняется в БД). */
export function getOracleWelcomeText(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';

  if (code === 'en') {
    return [
      'I see your Lapis Vivus profile and I am here for a personal dialogue.',
      '',
      `Up to ${MAX_ORACLE_AI_TURNS} replies in this chat — then it is saved to history.`,
      '',
      'Write your question.',
    ].join('\n');
  }

  return [
    'Я вижу ваш профиль Lapis Vivus и готов к личному диалогу.',
    '',
    `В этом чате — до ${MAX_ORACLE_AI_TURNS} моих ответов, затем диалог сохранится в историю.`,
    '',
    'Напишите ваш вопрос.',
  ].join('\n');
}

export function formatOracleReplyHtml(text) {
  const safe = escapeHtml(String(text ?? ''));
  return `🔮 <b>Оракул</b>\n\n${safe}`;
}

function formatTurnsHint(lang, left) {
  return lang === 'en'
    ? `Replies left · ${left} of ${MAX_ORACLE_AI_TURNS}`
    : `Осталось ответов · ${left} из ${MAX_ORACLE_AI_TURNS}`;
}

function formatOracleHistoryPair(userText, assistantText, lang = 'ru') {
  const yourLabel = lang === 'en' ? 'You' : 'Вы';
  const myLabel = lang === 'en' ? 'Oracle' : 'Оракул';
  return [
    `<b>${yourLabel}</b>\n${escapeHtml(userText)}`,
    '',
    `<b>${myLabel}</b>\n${escapeHtml(assistantText)}`,
  ].join('\n');
}

function formatRecentDialogue(chat, lang, maxPairs = 3) {
  const messages = dialogueMessages(chat);
  const pairs = [];
  let pendingUser = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      pendingUser = msg.content;
    } else if (msg.role === 'assistant' && pendingUser !== null) {
      pairs.push(formatOracleHistoryPair(pendingUser, msg.content, lang));
      pendingUser = null;
    }
  }

  if (pendingUser !== null) {
    const label = lang === 'en' ? 'You' : 'Вы';
    pairs.push(`<b>${label}</b>\n${escapeHtml(pendingUser)}`);
  }

  if (!pairs.length) return '';

  const recent = pairs.slice(-maxPairs);
  return recent.join('\n\n—\n\n');
}

export function formatOracleWelcomeScreen(lang = 'ru', turnsLeft = MAX_ORACLE_AI_TURNS) {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Oracle · dialogue' : 'Оракул · диалог';

  return [
    letterhead(title, lang),
    '',
    section(
      code === 'en' ? 'Welcome' : 'Добро пожаловать',
      escapeHtml(getOracleWelcomeText(lang)),
      '🔮',
    ),
    '',
    `<i>${formatTurnsHint(code, turnsLeft)}</i>`,
  ].join('\n');
}

export function isFreshOracleChat(chat) {
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];
  if (messages.length === 0) return true;
  if (messages.length === 1 && messages[0]?.kind === 'welcome') return true;
  return !messages.some((m) => m.role === 'user');
}

export function formatOracleActiveScreen(chat, lang = 'ru') {
  const turns = chat?.ai_turns ?? 0;
  const left = Math.max(0, MAX_ORACLE_AI_TURNS - turns);
  const code = lang === 'en' ? 'en' : 'ru';

  if (isFreshOracleChat(chat)) {
    return formatOracleWelcomeScreen(lang, left);
  }

  const title = code === 'en' ? 'Oracle · dialogue' : 'Оракул · диалог';
  const recent = formatRecentDialogue(chat, lang);
  const prompt = code === 'en' ? 'Continue the dialogue — write your message.' : 'Продолжайте диалог — напишите сообщение.';

  const lines = [letterhead(title, lang), '', `<i>${formatTurnsHint(code, left)}</i>`];

  if (recent) {
    lines.push('', section(code === 'en' ? 'Recent messages' : 'Недавние сообщения', recent, '💬'));
  }

  lines.push('', `<i>${prompt}</i>`);
  return lines.join('\n');
}

export function formatOracleHubScreen(lang = 'ru', activeChat = null) {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Oracle' : 'Оракул';

  const intro =
    code === 'en'
      ? 'A personal dialogue with context from your Lapis Vivus profile.'
      : 'Личный диалог с опорой на ваш профиль Lapis Vivus.';

  const lines = [
    letterhead(title, lang),
    '',
    section(code === 'en' ? 'About' : 'О режиме', intro, '🔮'),
  ];

  if (activeChat) {
    const preview = lastUserPreview(activeChat);
    const left = Math.max(0, MAX_ORACLE_AI_TURNS - (activeChat.ai_turns ?? 0));
    const status = formatTurnsHint(code, left);
    const body = preview
      ? `«${escapeHtml(preview)}»\n<i>${status}</i>`
      : `<i>${status}</i>`;
    lines.push(
      '',
      section(code === 'en' ? 'Current chat' : 'Текущий чат', body, '💬'),
    );
  } else {
    lines.push(
      '',
      `<i>${code === 'en' ? 'Open a chat or start a new dialogue.' : 'Откройте чат или начните новый диалог.'}</i>`,
    );
  }

  return lines.join('\n');
}

export function formatOracleEmptyProfile(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Oracle' : 'Оракул';
  const body =
    code === 'en'
      ? 'Fill in your birth profile first — the Oracle speaks from your personal protocol data.'
      : 'Сначала заполните профиль рождения — Оракул опирается на данные вашего протокола.';

  return [
    letterhead(title, lang),
    '',
    section(code === 'en' ? 'Profile required' : 'Нужен профиль', body, '👤'),
    '',
    `<i>${code === 'en' ? 'Launch the protocol from the main menu.' : 'Запустите протокол из главного меню.'}</i>`,
  ].join('\n');
}

export function formatOracleChatList(chats, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Chat history' : 'История чатов';

  if (!chats?.length) {
    return [
      letterhead(title, lang),
      '',
      section(
        code === 'en' ? 'Empty' : 'Пока пусто',
        code === 'en'
          ? 'Finished dialogues will appear here.'
          : 'Здесь появятся завершённые диалоги.',
        '📜',
      ),
    ].join('\n');
  }

  const lines = chats.map((chat, index) => {
    const pairs = countDialoguePairs(chat.messages);
    const date = formatChatDate(chat.updated_at ?? chat.created_at, lang);
    const preview = lastUserPreview(chat);
    const label = code === 'en' ? `Dialogue ${index + 1}` : `Диалог ${index + 1}`;
    const meta = code === 'en' ? `${pairs} exchanges · ${date}` : `${pairs} обменов · ${date}`;
    const quote = preview ? `\n<i>«${escapeHtml(preview)}»</i>` : '';
    return `◆ <b>${label}</b>\n<i>${meta}</i>${quote}`;
  });

  return [
    letterhead(title, lang),
    '',
    `<i>${code === 'en' ? `Up to ${MAX_ORACLE_HISTORY} saved dialogues` : `До ${MAX_ORACLE_HISTORY} сохранённых диалогов`}</i>`,
    '',
    lines.join('\n\n'),
  ].join('\n');
}

export function formatOracleHistoryView(chat, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const messages = dialogueMessages(chat);

  if (messages.length === 0) {
    return [
      letterhead(code === 'en' ? 'Dialogue' : 'Диалог', lang),
      '',
      `<i>${code === 'en' ? 'This dialogue is empty.' : 'В этом диалоге нет сообщений.'}</i>`,
    ].join('\n');
  }

  const body = formatRecentDialogue(chat, lang, 12);
  const truncated = body.length > 3600 ? `${body.slice(0, 3600)}\n\n<i>…</i>` : body;
  const date = formatChatDate(chat.updated_at ?? chat.created_at, lang);

  return [
    letterhead(code === 'en' ? 'Saved dialogue' : 'Сохранённый диалог', lang),
    '',
    `<i>${date}</i>`,
    '',
    truncated,
  ].join('\n');
}

export function oracleHubKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'oracleOpenChat'), callback_data: cb('oracle_open_chat') }],
      [
        { text: btn(lang, 'oracleHistory'), callback_data: cb('oracle_chats') },
        { text: btn(lang, 'oracleNewChat'), callback_data: cb('oracle_new') },
      ],
      [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
    ],
  };
}

export function oracleEmptyChatsKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [{ text: btn(lang, 'oracleNewChat'), callback_data: cb('oracle_new') }],
      [{ text: btn(lang, 'back'), callback_data: cb('oracle_start') }],
    ],
  };
}

export function oracleChatListKeyboard(chats, lang = 'ru') {
  const rows = (chats ?? []).map((chat, index) => {
    const preview = lastUserPreview(chat);
    const suffix = preview ? ` · ${clipPreview(preview, 24)}` : '';
    const label =
      lang === 'en'
        ? `📜 Dialogue ${index + 1}${suffix}`
        : `📜 Диалог ${index + 1}${suffix}`;
    return [
      { text: label, callback_data: cb('oracle_open', chat.id) },
      { text: btn(lang, 'oracleDelete'), callback_data: cb('oracle_delete', chat.id) },
    ];
  });

  rows.push([
    { text: btn(lang, 'oracleNewChat'), callback_data: cb('oracle_new') },
    { text: btn(lang, 'back'), callback_data: cb('oracle_start') },
  ]);

  return { inline_keyboard: rows };
}

export function oracleActiveChatKeyboard(lang = 'ru') {
  return {
    inline_keyboard: [
      [
        { text: btn(lang, 'oracleHistory'), callback_data: cb('oracle_chats') },
        { text: btn(lang, 'oracleNewChat'), callback_data: cb('oracle_new') },
      ],
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
