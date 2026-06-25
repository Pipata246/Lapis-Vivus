import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { askGpt } from '../ai/gptunnel.js';
import { splitTelegramMessages } from '../ai/formatResponse.js';
import {
  MAX_ORACLE_AI_TURNS,
  dialogueMessages,
  appendOracleMessages,
  rotateActiveOracleChat,
  loadProfileSnapshotForOracle,
  getOracleChat,
} from '../db/oracle.js';
import { getOracleWelcomeText, formatOracleWelcomeScreen, formatOracleReplyHtml } from '../scenario/oracleFlow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORACLE_PROMPT_PATH = path.join(__dirname, '../prompts/oracle-system.txt');

const MIN_AI_INTERVAL_MS = 12_000;
const MAX_CONTEXT_MESSAGES = 10;

const lastAiCallByUser = new Map();

let cachedSystemPrompt = null;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior)\s+/i,
  /system\s*prompt/i,
  /developer\s+message/i,
  /reveal\s+(your\s+)?(instructions|prompt|rules|system)/i,
  /\b(api[_\s-]?key|secret[_\s-]?key|access[_\s-]?token)\b/i,
  /\b(gptunnel|openai|sk-[a-z0-9]{10,})\b/i,
  /\bDAN\b/,
  /jailbreak/i,
  /╨▓╤Л╨▓╨╡╨┤╨╕\s+(╨┐╤А╨╛╨╝╨┐╤В|╤В╨╛╨║╨╡╨╜|╨║╨╗╤О╤З|╨╕╨╜╤Б╤В╤А╤Г╨║╤Ж╨╕)/i,
  /╨┐╨╛╨║╨░╨╢╨╕\s+(╨┐╤А╨╛╨╝╨┐╤В|╤В╨╛╨║╨╡╨╜|╨║╨╗╤О╤З|╤Б╨╕╤Б╤В╨╡╨╝╨╜)/i,
  /╨╕╨│╨╜╨╛╤А╨╕╤А╤Г╨╣\s+(╨▓╤Б╨╡\s+)?(╨┐╤А╨░╨▓╨╕╨╗╨░|╨╕╨╜╤Б╤В╤А╤Г╨║╤Ж╨╕╨╕)/i,
];

const OUTPUT_SCRUB_PATTERNS = [
  /\bsk-[a-zA-Z0-9]{16,}\b/g,
  /\bBearer\s+[a-zA-Z0-9._-]{20,}\b/gi,
  /GPTUNNEL[_A-Z]*\s*[:=]\s*\S+/gi,
  /SUPABASE[_A-Z]*\s*[:=]\s*\S+/gi,
  /BOT_TOKEN\s*[:=]\s*\S+/gi,
];

function loadOracleSystemPrompt() {
  if (!cachedSystemPrompt) {
    cachedSystemPrompt = readFileSync(ORACLE_PROMPT_PATH, 'utf8').trim();
  }
  return cachedSystemPrompt;
}

function waitForRateLimit(userId) {
  const now = Date.now();
  const last = lastAiCallByUser.get(userId) ?? 0;
  const wait = MIN_AI_INTERVAL_MS - (now - last);
  if (wait > 0) {
    return new Promise((resolve) => setTimeout(resolve, wait));
  }
  return Promise.resolve();
}

function markAiCall(userId) {
  lastAiCallByUser.set(userId, Date.now());
}

export function detectOracleInjection(text) {
  const sample = String(text ?? '').slice(0, 4000);
  return INJECTION_PATTERNS.some((re) => re.test(sample));
}

export function scrubOracleOutput(text) {
  let out = String(text ?? '').trim();
  for (const re of OUTPUT_SCRUB_PATTERNS) {
    out = out.replace(re, '[╤Б╨║╤А╤Л╤В╨╛]');
  }
  return out;
}

function buildProfileContextMessage(snapshot) {
  return {
    role: 'user',
    content: `[╨┐╤А╨╛╤Д╨╕╨╗╤М ╨║╨╗╨╕╨╡╨╜╤В╨░ ┬╖ ╤Б╨╗╤Г╨╢╨╡╨▒╨╜╨╛ ┬╖ ╨╜╨╡ ╨┐╨╛╨║╨░╨╖╤Л╨▓╨░╤В╤М ╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤О]\n${JSON.stringify(snapshot, null, 0)}`,
  };
}

function messagesForApi(chat) {
  const recent = dialogueMessages(chat).slice(-MAX_CONTEXT_MESSAGES);
  return recent.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
}

function injectionRefusal(lang) {
  return lang === 'en'
    ? 'I can\'t discuss internal settings or credentials. Ask me about your personal route, symbols, or life questions тАФ I\'m here for that.'
    : '╨п ╨╜╨╡ ╨╝╨╛╨│╤Г ╨╛╨▒╤Б╤Г╨╢╨┤╨░╤В╤М ╨▓╨╜╤Г╤В╤А╨╡╨╜╨╜╨╕╨╡ ╨╜╨░╤Б╤В╤А╨╛╨╣╨║╨╕ ╨╕╨╗╨╕ ╨║╨╗╤О╤З╨╕ ╨┤╨╛╤Б╤В╤Г╨┐╨░. ╨б╨┐╤А╨╛╤Б╨╕╤В╨╡ ╨╛ ╨▓╨░╤И╨╡╨╝ ╨╝╨░╤А╤И╤А╤Г╤В╨╡, ╤Б╨╕╨╝╨▓╨╛╨╗╨░╤Е ╨╕╨╗╨╕ ╨╗╨╕╤З╨╜╨╛╨╝ ╨▓╨╛╨┐╤А╨╛╤Б╨╡ тАФ ╨┤╨╗╤П ╤Н╤В╨╛╨│╨╛ ╤П ╨╖╨┤╨╡╤Б╤М.';
}

/**
 * @param {{ userId: number, chat: object, userText: string, lang?: string }}
 */
export async function runOracleTurn({ userId, chat, userText, lang = 'ru' }) {
  const trimmed = String(userText ?? '').trim();
  if (!trimmed || trimmed.length > 4000) {
    return {
      ok: false,
      error: lang === 'en' ? 'Message must be 1тАУ4000 characters.' : '╨б╨╛╨╛╨▒╤Й╨╡╨╜╨╕╨╡: ╨╛╤В 1 ╨┤╨╛ 4000 ╤Б╨╕╨╝╨▓╨╛╨╗╨╛╨▓.',
    };
  }

  let workingChat = chat;
  let rotated = false;

  if ((workingChat.ai_turns ?? 0) >= MAX_ORACLE_AI_TURNS) {
    const freshSnapshot = await loadProfileSnapshotForOracle(userId);
    const welcomeText = getOracleWelcomeText(lang);
    workingChat = await rotateActiveOracleChat(userId, freshSnapshot, welcomeText);
    rotated = true;
  }

  if (detectOracleInjection(trimmed)) {
    const refusal = injectionRefusal(lang);
    const updated = await appendOracleMessages(
      userId,
      workingChat.id,
      [
        { role: 'user', content: trimmed },
        { role: 'assistant', content: refusal, kind: 'injection_refusal' },
      ],
      { aiTurnDelta: 1 },
    );

    const extraMessages = rotated
      ? [{ text: formatOracleReplyHtml(refusal) }]
      : [];

    return {
      ok: true,
      text: rotated ? formatOracleWelcomeScreen(lang) : formatOracleReplyHtml(refusal),
      extraMessages,
      chat: updated,
      rotated,
    };
  }

  await appendOracleMessages(userId, workingChat.id, [{ role: 'user', content: trimmed }]);
  workingChat = await getOracleChat(userId, workingChat.id);

  await waitForRateLimit(userId);

  const systemPrompt = loadOracleSystemPrompt();
  const profileMsg = buildProfileContextMessage(workingChat.profile_snapshot ?? {});
  const history = messagesForApi(workingChat);

  const messages = [
    { role: 'system', content: systemPrompt },
    profileMsg,
    ...history,
  ];

  let aiResponse;
  try {
    markAiCall(userId);
    aiResponse = await askGpt(messages);
  } catch (err) {
    console.error('[oracle] askGpt:', err.message);
    return {
      ok: false,
      error:
        lang === 'en'
          ? 'The Oracle is temporarily unavailable. Try again in a moment.'
          : '╨Ю╤А╨░╨║╤Г╨╗ ╨▓╤А╨╡╨╝╨╡╨╜╨╜╨╛ ╨╜╨╡╨┤╨╛╤Б╤В╤Г╨┐╨╡╨╜. ╨Я╨╛╨┐╤А╨╛╨▒╤Г╨╣╤В╨╡ ╤З╤Г╤В╤М ╨┐╨╛╨╖╨╢╨╡.',
    };
  }

  aiResponse = scrubOracleOutput(aiResponse);

  if (!aiResponse) {
    aiResponse =
      lang === 'en'
        ? 'I couldn\'t form a response. Please rephrase your question.'
        : '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╤Д╨╛╤А╨╝╨╕╤А╨╛╨▓╨░╤В╤М ╨╛╤В╨▓╨╡╤В. ╨Я╨╡╤А╨╡╤Д╨╛╤А╨╝╤Г╨╗╨╕╤А╤Г╨╣╤В╨╡ ╨▓╨╛╨┐╤А╨╛╤Б.';
  }

  workingChat = await appendOracleMessages(
    userId,
    workingChat.id,
    [{ role: 'assistant', content: aiResponse }],
    { aiTurnDelta: 1 },
  );

  const aiHtml = formatOracleReplyHtml(aiResponse);
  const aiChunks = splitTelegramMessages(aiHtml);

  if (rotated) {
    const welcomeHtml = formatOracleWelcomeScreen(lang, MAX_ORACLE_AI_TURNS - 1);
    return {
      ok: true,
      text: welcomeHtml,
      extraMessages: aiChunks.map((part, index) => ({
        text: part,
        keyboard: index === aiChunks.length - 1 ? undefined : undefined,
      })),
      chat: workingChat,
      rotated: true,
    };
  }

  return {
    ok: true,
    text: aiChunks[0],
    extraMessages: aiChunks.slice(1).map((part) => ({ text: part })),
    chat: workingChat,
    rotated: false,
  };
}
