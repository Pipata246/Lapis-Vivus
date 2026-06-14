import { extractMetacomments } from './formatResponse.js';
import { loadPromptConfig } from '../config.js';

const MAX_ASSISTANT_CHARS = 2500;

/**
 * Урезает историю чата для ИИ: полные JSON прошлых блоков не нужны на каждый запрос.
 */
export function compressMessagesForAI(messages) {
  const { chatHistoryMode } = loadPromptConfig();
  if (chatHistoryMode === 'full') {
    return messages;
  }

  return messages.map((msg) => {
    if (msg.role !== 'assistant' || msg.content.length <= MAX_ASSISTANT_CHARS) {
      return msg;
    }

    const summary = extractMetacomments(msg.content, MAX_ASSISTANT_CHARS);
    return {
      role: 'assistant',
      content:
        `[контекст прошлого блока · сжато]\n${summary || msg.content.slice(0, MAX_ASSISTANT_CHARS)}`,
    };
  });
}
