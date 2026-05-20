import { askGpt } from '../ai/gptunnel.js';
import {
  getChatHistory,
  getOrCreateUserChat,
  normalizeUserMessage,
  saveChatMessages,
} from '../db/chats.js';
import { upsertUserFromTelegram } from '../db/users.js';

const DEFAULT_CONTEXT_LIMIT = 50;

function getContextLimit() {
  const raw = Number.parseInt(process.env.CHAT_CONTEXT_LIMIT ?? '', 10);
  if (Number.isNaN(raw) || raw < 1) {
    return DEFAULT_CONTEXT_LIMIT;
  }
  return Math.min(raw, 100);
}

export async function handleUserText(from, rawText) {
  const userMessage = normalizeUserMessage(rawText);
  const contextLimit = getContextLimit();

  await upsertUserFromTelegram(from);

  const chat = await getOrCreateUserChat(from.id);
  const history = await getChatHistory(chat.id, contextLimit);

  const messages = [...history, { role: 'user', content: userMessage }];
  const answer = await askGpt(messages);

  await saveChatMessages(chat.id, [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: answer },
  ]);

  return answer;
}
