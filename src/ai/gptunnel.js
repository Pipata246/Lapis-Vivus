import { loadConfig } from '../config.js';

const API_URL = 'https://gptunnel.ru/v1/chat/completions';

export async function askGpt(userMessage) {
  const { gptunnelApiKey, gptunnelModel } = loadConfig();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: gptunnelApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: gptunnelModel,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GPTunnel ${response.status}: ${body}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content?.trim()) {
    throw new Error('Пустой ответ от GPTunnel');
  }

  return content.trim();
}
