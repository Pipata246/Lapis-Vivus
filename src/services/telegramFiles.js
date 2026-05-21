import { loadBotConfig } from '../config.js';

export async function fetchTelegramPhotoAsDataUrl(fileId) {
  const { botToken } = loadBotConfig();

  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = await metaRes.json();

  if (!meta.ok || !meta.result?.file_path) {
    throw new Error('Не удалось получить файл из Telegram.');
  }

  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${meta.result.file_path}`;
  const fileRes = await fetch(fileUrl);

  if (!fileRes.ok) {
    throw new Error('Не удалось скачать фото из Telegram.');
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const path = meta.result.file_path.toLowerCase();
  const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';

  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export async function buildVisionContentParts(textPayload, photoFileIds, maxPhotos = 3) {
  const parts = [{ type: 'text', text: textPayload }];
  const ids = (photoFileIds ?? []).slice(0, maxPhotos);

  for (const fileId of ids) {
    const dataUrl = await fetchTelegramPhotoAsDataUrl(fileId);
    parts.push({
      type: 'image_url',
      image_url: { url: dataUrl },
    });
  }

  return parts;
}
