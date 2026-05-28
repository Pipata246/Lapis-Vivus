import { loadBotConfig } from '../config.js';
import { getSupabase } from '../db/supabase.js';

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
 * Загружает файл из Telegram и возвращает буфер
 */
export async function fetchTelegramFile(fileId) {
  const { botToken } = loadBotConfig();

  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = await metaRes.json();

  if (!meta.ok || !meta.result?.file_path) {
    throw new Error('Не удалось получить файл из Telegram.');
  }

  const filePath = meta.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error('Не удалось скачать файл из Telegram.');
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const lowerPath = filePath.toLowerCase();

  return {
    buffer,
    filePath,
    mimeType: mimeFromPath(filePath),
    isImage: isImagePath(lowerPath),
  };
}

/**
 * Строит content parts для отправки в AI из сохранённых файлов в БД
 */
export async function buildVisionContentParts(textPayload, files) {
  const parts = [{ type: 'text', text: textPayload }];
  const textParts = [];
  const skipped = [];

  for (const file of files ?? []) {
    try {
      // Изображения — загружаем из Storage и отправляем как vision
      if (file.file_type === 'image' && file.public_url) {
        // Для vision нужен base64, скачиваем из Storage
        const res = await fetch(file.public_url);
        if (!res.ok) {
          throw new Error(`Не удалось скачать изображение: ${res.status}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const mime = file.mime_type || 'image/jpeg';
        const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;

        parts.push({
          type: 'image_url',
          image_url: { url: dataUrl },
        });
      }
      // Для файлов с извлечённым текстом
      else if (file.extracted_text) {
        textParts.push(`📄 ${file.file_name || 'Файл'}:\n${file.extracted_text}`);
      }
      // Для изображений без public_url (fallback)
      else if (file.file_type === 'image' && file.telegram_file_id) {
        // Пробуем загрузить напрямую из Telegram
        const { buffer, mimeType } = await fetchTelegramFile(file.telegram_file_id);
        const mime = mimeType || file.mime_type || 'image/jpeg';
        const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
        
        parts.push({
          type: 'image_url',
          image_url: { url: dataUrl },
        });
      }
    } catch (err) {
      console.warn('Пропуск файла для ИИ:', err.message);
      skipped.push(err.message);
    }
  }

  // Добавляем текст из файлов к основному сообщению
  if (textParts.length > 0) {
    parts[0].text += '\n\n📎 Содержимое прикреплённых файлов:\n\n' + textParts.join('\n\n---\n\n');
  }

  if (skipped.length > 0) {
    parts[0].text += `\n\n[Часть файлов не передана: ${skipped.join('; ')}]`;
  }

  return parts;
}
