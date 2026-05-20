import { loadAiConfig } from '../config.js';

const API_URL = 'https://gptunnel.ru/v1/chat/completions';

export async function askGpt(userMessage) {
  const { gptunnelApiKey, gptunnelModel, useWalletBalance } = loadAiConfig();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: gptunnelApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: gptunnelModel,
      messages: [{ role: 'user', content: userMessage }],
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
