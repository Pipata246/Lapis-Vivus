import { getSupabase } from '../db/supabase.js';
import { loadBotConfig } from '../config.js';
import { sanitizeUserInput } from '../ai/sanitizeUserInput.js';

const STORAGE_BUCKET = 'user-files';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Определяет тип файла по MIME или расширению
 */
export function detectFileType(mimeType, fileName) {
  const lowerMime = (mimeType || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();

  // Проверяем изображение по MIME
  if (lowerMime.startsWith('image/')) return 'image';
  
  // Проверяем изображение по расширению (для документов, отправленных как файл)
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'];
  if (imageExts.some(ext => lowerName.endsWith(ext))) return 'image';
  
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (
    lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  )
    return 'docx';
  if (
    lowerMime.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.csv')
  )
    return 'text';

  return 'other';
}

/**
 * Загружает файл из Telegram и сохраняет в Supabase Storage
 */
export async function uploadTelegramFileToStorage(fileId, userId, blockId, fileName, mimeType) {
  const { botToken } = loadBotConfig();

  // 1. Получаем информацию о файле из Telegram
  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const meta = await metaRes.json();

  if (!meta.ok || !meta.result?.file_path) {
    throw new Error('Не удалось получить файл из Telegram.');
  }

  const filePath = meta.result.file_path;
  const fileSize = meta.result.file_size || 0;

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`Файл слишком большой (макс. ${MAX_FILE_SIZE / 1024 / 1024} MB).`);
  }

  // 2. Скачиваем файл
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const fileRes = await fetch(fileUrl);

  if (!fileRes.ok) {
    throw new Error('Не удалось скачать файл из Telegram.');
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 3. Определяем тип файла
  const isPhoto = filePath.startsWith('photos/') || filePath.startsWith('photo/');
  const fileType = isPhoto ? 'image' : detectFileType(mimeType, fileName || filePath);

  // 4. Генерируем путь в Storage
  const ext = (fileName || filePath).split('.').pop() || 'bin';
  const storagePath = `${userId}/${blockId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  // 5. Загружаем в Supabase Storage
  const supabase = getSupabase();
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Не удалось загрузить файл в Storage: ${uploadError.message}`);
  }

  // 6. Получаем публичный URL
  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: urlData?.publicUrl || null,
    fileSize,
    fileType,
    buffer,
  };
}

/**
 * Извлекает текст из файла для ИИ
 * ВАЖНО: Санитизирует извлечённый текст для защиты от prompt injection
 */
export async function extractTextFromFile(buffer, fileType, mimeType) {
  // Для изображений возвращаем null (они обрабатываются через vision)
  if (fileType === 'image') {
    return null;
  }

  let extractedText = null;

  // Для текстовых файлов
  if (fileType === 'text') {
    try {
      extractedText = buffer.toString('utf-8').slice(0, 50000);
    } catch {
      extractedText = '[Не удалось декодировать текстовый файл]';
    }
  }
  // PDF не поддерживается (требует Canvas API, недоступный на Vercel)
  else if (fileType === 'pdf') {
    extractedText = '[PDF не поддерживается на сервере - скопируйте текст вручную]';
  }
  // DOCX может быть добавлен позже через mammoth
  else if (fileType === 'docx') {
    extractedText = '[DOCX файл — извлечение текста будет добавлено]';
  }

  // Санитизируем извлечённый текст для защиты от prompt injection
  if (extractedText) {
    return sanitizeUserInput(extractedText);
  }

  return null;
}

/**
 * Удаляет файл из Storage
 */
export async function deleteFileFromStorage(storagePath) {
  const supabase = getSupabase();

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);

  if (error) {
    console.error('Ошибка удаления файла из Storage:', error.message);
  }
}

/**
 * Создаёт bucket в Storage если не существует
 */
export async function ensureStorageBucket() {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage.listBuckets();

  if (error) {
    console.error('Не удалось получить список buckets:', error.message);
    return false;
  }

  const exists = data?.some((b) => b.name === STORAGE_BUCKET);

  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
    });

    if (createError) {
      console.error('Не удалось создать bucket:', createError.message);
      return false;
    }

    console.log(`Bucket "${STORAGE_BUCKET}" создан.`);
  }

  return true;
}
