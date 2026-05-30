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
 * Удаляет все файлы чата из БД и Storage
 */
export async function deleteAllChatFiles(chatId) {
  const supabase = getSupabase();

  // Получаем все файлы чата
  const { data: files, error: selectError } = await supabase
    .from('user_files')
    .select('storage_path')
    .eq('chat_id', chatId);

  if (selectError) {
    console.error('Ошибка получения файлов для удаления:', selectError.message);
  }

  // Удаляем файлы из Storage
  if (files && files.length > 0) {
    const paths = files.map(f => f.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('user-files')
        .remove(paths);
      
      if (storageError) {
        console.error('Ошибка удаления файлов из Storage:', storageError.message);
      }
    }
  }

  // Удаляем записи из БД
  const { error: deleteError } = await supabase
    .from('user_files')
    .delete()
    .eq('chat_id', chatId);

  if (deleteError) {
    console.error('Ошибка удаления файлов из БД:', deleteError.message);
  }
}
