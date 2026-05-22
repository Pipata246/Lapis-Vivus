import { loadBotConfig } from '../config.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function mimeFromPath(filePath) {
  const path = filePath.toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function isImagePath(filePath) {
  const lower = filePath.toLowerCase();
  return [...IMAGE_EXT].some((ext) => lower.endsWith(ext));
}

export async function fetchTelegramPhotoAsDataUrl(fileId) {
  const { botToken } = loadBotConfig();

  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = await metaRes.json();

  if (!meta.ok || !meta.result?.file_path) {
    throw new Error('Не удалось получить файл из Telegram.');
  }

  const filePath = meta.result.file_path;
  if (!isImagePath(filePath)) {
    throw new Error('Файл не является изображением (нужен скрин JPG/PNG).');
  }

  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const fileRes = await fetch(fileUrl);

  if (!fileRes.ok) {
    throw new Error('Не удалось скачать фото из Telegram.');
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const mime = mimeFromPath(filePath);

  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export async function buildVisionContentParts(textPayload, photoFileIds, maxPhotos = 3) {
  const parts = [{ type: 'text', text: textPayload }];
  const ids = (photoFileIds ?? []).slice(0, maxPhotos);
  const skipped = [];

  for (const fileId of ids) {
    try {
      const dataUrl = await fetchTelegramPhotoAsDataUrl(fileId);
      parts.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    } catch (err) {
      console.warn('Пропуск вложения для ИИ:', err.message);
      skipped.push(err.message);
    }
  }

  if (skipped.length > 0 && parts.length === 1) {
    parts[0].text += `\n\n[Вложения не переданы в vision: ${skipped.join('; ')}. Анализ по данным анкеты.]`;
  } else if (skipped.length > 0) {
    parts[0].text += `\n\n[Часть вложений пропущена: ${skipped.join('; ')}]`;
  }

  return parts;
}
