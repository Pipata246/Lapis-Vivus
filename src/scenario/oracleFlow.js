import { letterhead, escapeHtml, btn, section } from '../ui/brand.js';
import { markdownToTelegramHtml } from '../ai/formatResponse.js';
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

/** Пары вопрос–ответ в порядке диалога. */
export function getDialoguePairs(chat) {
  const pairs = [];
  let pendingUser = null;

  for (const msg of dialogueMessages(chat)) {
    if (msg.role === 'user') {
      pendingUser = msg.content;
    } else if (msg.role === 'assistant' && pendingUser !== null) {
      pairs.push({ user: pendingUser, assistant: msg.content });
      pendingUser = null;
    }
  }

  return pairs;
}

/** Премиальное оформление текста Оракула — без сырого markdown. */
export function formatOracleBodyHtml(raw, maxLen = 3400) {
  const html = markdownToTelegramHtml(raw, maxLen);
  return html || '—';
}

function formatOracleHistoryPair(userText, assistantText, lang = 'ru', limits = {}) {
  const userMax = limits.userMax ?? 1200;
  const assistantMax = limits.assistantMax ?? 2200;
  const yourLabel = lang === 'en' ? 'You' : 'Вы';
  const myLabel = lang === 'en' ? 'Oracle' : 'Оракул';
  return [
    `<b>${yourLabel}</b>\n${formatOracleBodyHtml(userText, userMax)}`,
    '',
    `<b>${myLabel}</b>\n${formatOracleBodyHtml(assistantText, assistantMax)}`,
  ].join('\n');
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
  return section('Оракул', formatOracleBodyHtml(text), '🔮');
}

function formatTurnsHint(lang, left) {
  return lang === 'en'
    ? `Replies left · ${left} of ${MAX_ORACLE_AI_TURNS}`
    : `Осталось ответов · ${left} из ${MAX_ORACLE_AI_TURNS}`;
}

/** Полная история диалога — для экрана «Прошлые вопросы». */
function formatFullDialogue(chat, lang, maxChars = 3400) {
  const pairs = getDialoguePairs(chat);
  if (!pairs.length) return '';

  let body = pairs.map((p) => formatOracleHistoryPair(p.user, p.assistant, lang)).join('\n\n—\n\n');
  if (body.length > maxChars) {
    const trimmed = body.slice(body.length - maxChars + 16);
    const code = lang === 'en' ? 'en' : 'ru';
    const note = code === 'en' ? 'Earlier messages hidden' : 'Ранние сообщения скрыты';
    body = `<i>… ${note}</i>\n\n${trimmed}`;
  }

  return body;
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

  const pairs = getDialoguePairs(chat);
  const last = pairs[pairs.length - 1];
  if (!last) {
    return formatOracleWelcomeScreen(lang, left);
  }

  const title = code === 'en' ? 'Oracle · dialogue' : 'Оракул · диалог';
  const qLabel = code === 'en' ? 'Your question' : 'Ваш вопрос';
  const aLabel = code === 'en' ? 'Oracle' : 'Оракул';

  return [
    letterhead(title, lang),
    '',
    `<i>${formatTurnsHint(code, left)}</i>`,
    '',
    section(qLabel, formatOracleBodyHtml(last.user, 900), '💬'),
    '',
    section(aLabel, formatOracleBodyHtml(last.assistant, 2800), '🔮'),
    '',
    `<i>${code === 'en' ? 'Write your next message.' : 'Напишите следующее сообщение.'}</i>`,
  ].join('\n');
}

/** Экран «Прошлые вопросы» — все обмены из БД, разбитые на страницы. */
const ORACLE_HISTORY_PAGE_MAX = 3000;

export function buildOracleHistoryPages(pairs, lang = 'ru') {
  if (!pairs?.length) return [];

  const code = lang === 'en' ? 'en' : 'ru';
  const pages = [];
  let chunk = '';

  for (let i = 0; i < pairs.length; i += 1) {
    const block = formatOracleHistoryPair(pairs[i].user, pairs[i].assistant, lang, {
      userMax: 2000,
      assistantMax: 3500,
    });
    const labeled =
      pairs.length > 1
        ? `◆ <b>${code === 'en' ? `Exchange ${i + 1}` : `Обмен ${i + 1}`}</b>\n\n${block}`
        : block;

    if (!chunk) {
      chunk = labeled;
      continue;
    }

    const candidate = `${chunk}\n\n—\n\n${labeled}`;
    if (candidate.length > ORACLE_HISTORY_PAGE_MAX) {
      pages.push(chunk);
      chunk = labeled;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) pages.push(chunk);
  return pages;
}

export function formatOraclePastQuestionsPage(pager, lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Previous questions' : 'Прошлые вопросы';
  const pages = pager?.pages ?? [];
  const total = Math.max(pages.length, 1);
  const index = Math.min(Math.max(pager?.index ?? 0, 0), total - 1);
  const body = pages[index];

  if (!body) {
    return [
      letterhead(title, lang),
      '',
      `<i>${code === 'en' ? 'No messages in this chat.' : 'В этом чате пока нет сообщений.'}</i>`,
    ].join('\n');
  }

  const indicator =
    total > 1
      ? `<i>${code === 'en' ? 'Page' : 'Страница'} ${index + 1} / ${total}</i>`
      : '';

  return [letterhead(title, lang), '', body, indicator].filter(Boolean).join('\n');
}

/** @deprecated — используйте buildOracleHistoryPages + formatOraclePastQuestionsPage */
export function formatOraclePastQuestionsScreen(chat, lang = 'ru') {
  const pages = buildOracleHistoryPages(getDialoguePairs(chat), lang);
  return formatOraclePastQuestionsPage({ pages, index: 0 }, lang);
}

export function hasOraclePastQuestions(chat) {
  return getDialoguePairs(chat).length >= 1;
}

export function formatOracleThinkingScreen(lang = 'ru') {
  const code = lang === 'en' ? 'en' : 'ru';
  const title = code === 'en' ? 'Oracle · dialogue' : 'Оракул · диалог';

  return [
    letterhead(title, lang),
    '',
    section(
      code === 'en' ? 'Oracle' : 'Оракул',
      code === 'en'
        ? 'Reading your profile and composing a personal answer…'
        : 'Читаю ваш профиль и составляю персональный ответ…',
      '🔮',
    ),
    '',
    `<i>${code === 'en' ? 'Please wait a moment.' : 'Подождите немного.'}</i>`,
  ].join('\n');
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

  const body = formatFullDialogue(chat, lang, 3600);
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

export function oracleActiveChatKeyboard(lang = 'ru', chat = null) {
  const rows = [];

  if (chat && hasOraclePastQuestions(chat)) {
    rows.push([{ text: btn(lang, 'oraclePast'), callback_data: cb('oracle_past') }]);
  }

  rows.push([
    { text: btn(lang, 'oracleHistory'), callback_data: cb('oracle_chats') },
    { text: btn(lang, 'oracleNewChat'), callback_data: cb('oracle_new') },
  ]);
  rows.push([{ text: btn(lang, 'menu'), callback_data: cb('menu') }]);

  return { inline_keyboard: rows };
}

export function oraclePastQuestionsKeyboard(lang = 'ru', pageIndex = 0, totalPages = 1) {
  const code = lang === 'en' ? 'en' : 'ru';
  const rows = [];
  const navRow = [];

  if (totalPages > 1 && pageIndex > 0) {
    navRow.push({ text: code === 'en' ? '◀ Back' : '◀ Назад', callback_data: cb('oracle_hist_prev') });
  }
  if (totalPages > 1 && pageIndex < totalPages - 1) {
    navRow.push({ text: code === 'en' ? 'Next ▶' : 'Далее ▶', callback_data: cb('oracle_hist_next') });
  }
  if (navRow.length) rows.push(navRow);

  rows.push([{ text: btn(lang, 'back'), callback_data: cb('oracle_back') }]);
  rows.push([{ text: btn(lang, 'menu'), callback_data: cb('menu') }]);

  return { inline_keyboard: rows };
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
