import { getSupabase } from './supabase.js';

const ALLOWED_FILE_TYPES = new Set(['image', 'pdf', 'docx', 'text', 'other']);

/**
 * Сохраняет информацию о файле в БД
 */
export async function saveUserFile({
  userId,
  chatId,
  blockId,
  fileName,
  fileType,
  mimeType,
  fileSize,
  storagePath,
  publicUrl,
  extractedText,
  telegramFileId,
}) {
  if (!ALLOWED_FILE_TYPES.has(fileType)) {
    throw new Error(`Некорректный тип файла: ${fileType}`);
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('user_files')
    .insert({
      user_id: userId,
      chat_id: chatId,
      block_id: blockId,
      file_name: fileName,
      file_type: fileType,
      mime_type: mimeType,
      file_size: fileSize,
      storage_path: storagePath,
      public_url: publicUrl,
      extracted_text: extractedText,
      telegram_file_id: telegramFileId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Не удалось сохранить файл: ${error.message}`);
  }

  return data;
}

/**
 * Получает файлы пользователя по блоку
 */
export async function getBlockFiles(chatId, blockId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('user_files')
    .select('*')
    .eq('chat_id', chatId)
    .eq('block_id', blockId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Не удалось загрузить файлы: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Получает все файлы чата
 */
export async function getChatFiles(chatId) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('user_files')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Не удалось загрузить файлы чата: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Удаляет файлы блока
 */
export async function deleteBlockFiles(chatId, blockId) {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('user_files')
    .delete()
    .eq('chat_id', chatId)
    .eq('block_id', blockId);

  if (error) {
    throw new Error(`Не удалось удалить файлы: ${error.message}`);
  }
}
