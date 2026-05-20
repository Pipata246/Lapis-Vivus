import { loadAiConfig } from '../config.js';

const API_URL = 'https://gptunnel.ru/v1/chat/completions';
const ALLOWED_ROLES = new Set(['user', 'assistant', 'system']);

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Пустой контекст для ИИ.');
  }

  return messages.map((msg) => {
    const role = msg?.role;
    const content = msg?.content?.trim();

    if (!ALLOWED_ROLES.has(role) || !content) {
      throw new Error('Некорректное сообщение в контексте.');
    }

    return { role, content };
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

  if (!content?.trim()) {
    throw new Error('Пустой ответ от GPTunnel');
  }

  return content.trim();
}
