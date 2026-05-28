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

/**
 * Загружает файл из Telegram и возвращает его как data URL или текст
 */
export async function fetchTelegramFile(fileId, expectedType = 'auto') {
  const { botToken } = loadBotConfig();

  // Получаем информацию о файле
  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = await metaRes.json();

  if (!meta.ok || !meta.result?.file_path) {
    throw new Error('Не удалось получить файл из Telegram.');
  }

  const filePath = meta.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  // Скачиваем файл
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error('Не удалось скачать файл из Telegram.');
  }

  const lowerPath = filePath.toLowerCase();

  // Изображения — конвертируем в base64 data URL для vision
  if (isImagePath(lowerPath)) {
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const mime = mimeFromPath(filePath);
    return {
      type: 'image',
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    };
  }

  // PDF — конвертируем в base64
  if (lowerPath.endsWith('.pdf')) {
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return {
      type: 'pdf',
      dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`,
      text: `[PDF файл прикреплён]`,
    };
  }

  // Текстовые файлы — читаем как текст
  if (
    lowerPath.endsWith('.txt') ||
    lowerPath.endsWith('.md') ||
    lowerPath.endsWith('.json') ||
    lowerPath.endsWith('.csv')
  ) {
    const text = await fileRes.text();
    return {
      type: 'text',
      text: text.slice(0, 50000), // ограничение 50к символов
    };
  }

  // Остальные файлы — binary base64
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const ext = lowerPath.split('.').pop() || 'bin';
  return {
    type: 'binary',
    dataUrl: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
    extension: ext,
    text: `[Файл .${ext} прикреплён]`,
  };
}

/**
 * Строит content parts для отправки в AI
 */
export async function buildVisionContentParts(textPayload, files, maxFiles = 5) {
  const parts = [{ type: 'text', text: textPayload }];
  const filesList = (files ?? []).slice(0, maxFiles);
  const skipped = [];
  const textParts = [];

  for (const fileInfo of filesList) {
    try {
      // Поддержка старого формата (строка file_id) и нового (объект)
      const fileId = typeof fileInfo === 'string' ? fileInfo : fileInfo.file_id;
      const loaded = await fetchTelegramFile(fileId);

      if (loaded.type === 'image') {
        parts.push({
          type: 'image_url',
          image_url: { url: loaded.dataUrl },
        });
      } else if (loaded.type === 'text') {
        textParts.push(loaded.text);
      } else if (loaded.text) {
        textParts.push(loaded.text);
      }
    } catch (err) {
      console.warn('Пропуск вложения для ИИ:', err.message);
      skipped.push(err.message);
    }
  }

  // Добавляем текст из файлов к основному сообщению
  if (textParts.length > 0) {
    parts[0].text += '\n\n📎 Содержимое прикреплённых файлов:\n\n' + textParts.join('\n\n---\n\n');
  }

  if (skipped.length > 0 && parts.length === 1) {
    parts[0].text += `\n\n[Вложения не переданы: ${skipped.join('; ')}. Анализ по данным анкеты.]`;
  } else if (skipped.length > 0) {
    parts[0].text += `\n\n[Часть вложений пропущена: ${skipped.join('; ')}]`;
  }

  return parts;
}
