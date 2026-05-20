import 'dotenv/config';

const API_URL = 'https://gptunnel.ru/v1/models';

async function main() {
  const apiKey = process.env.GPTUNNEL_API_KEY?.trim();

  if (!apiKey) {
    console.error('Задайте GPTUNNEL_API_KEY в .env');
    process.exit(1);
  }

  const response = await fetch(API_URL, {
    headers: { Authorization: apiKey },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Ошибка:', data?.error?.message ?? response.status);
    process.exit(1);
  }

  const models = data?.data ?? [];
  const query = (process.argv[2] ?? 'gemini').toLowerCase();

  const filtered = models.filter(
    (m) =>
      m.id?.toLowerCase().includes(query) ||
      m.title?.toLowerCase().includes(query),
  );

  const list = filtered.length > 0 ? filtered : models;

  console.log(`\nМодели (фильтр: "${query}", всего: ${list.length}):\n`);
  console.log('id (→ GPTUNNEL_MODEL)          | title');
  console.log('--------------------------------|------------------');

  for (const m of list) {
    const id = (m.id ?? '').padEnd(30);
    console.log(`${id} | ${m.title ?? '—'}`);
  }

  if (filtered.length > 0) {
    console.log(`\nДля .env скопируй id, например:\nGPTUNNEL_MODEL=${filtered[0].id}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
