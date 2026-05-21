import { loadAiConfig } from '../config.js';

const API_URL = 'https://gptunnel.ru/v1/chat/completions';
const ALLOWED_ROLES = new Set(['user', 'assistant', 'system']);

function normalizeContent(content) {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Пустое сообщение в контексте.');
    }
    return trimmed;
  }

  if (Array.isArray(content)) {
    if (content.length === 0) {
      throw new Error('Пустой multimodal-контент.');
    }
    return content;
  }

  throw new Error('Некорректный формат content.');
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Пустой контекст для ИИ.');
  }

  return messages.map((msg) => {
    const role = msg?.role;
    if (!ALLOWED_ROLES.has(role)) {
      throw new Error('Некорректная роль сообщения.');
    }
    return { role, content: normalizeContent(msg.content) };
  });
}

export async function askGpt(messages) {
  const { gptunnelApiKey, gptunnelModel, useWalletBalance } = loadAiConfig();
  const payloadMessages = normalizeMessages(messages);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: gptunnelApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: gptunnelModel,
      messages: payloadMessages,
      temperature: 0,
      useWalletBalance,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const json = JSON.parse(body);
      detail = json?.error?.message ?? body;
    } catch {
      // keep raw body
    }
    throw new Error(`GPTunnel ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const textPart = content.find((p) => p.type === 'text');
    if (textPart?.text?.trim()) {
      return textPart.text.trim();
    }
  }

  throw new Error('Пустой ответ от GPTunnel');
}
