import { Telegraf } from 'telegraf';
import { loadBotConfig } from './config.js';
import {
  initUser,
  handleCallback,
  handleText,
  handleFile,
  sendScenarioReply,
} from './services/scenario.js';

let botInstance = null;

// Map для отслеживания обработки callback'ов и сообщений (debounce)
const processingCallbacks = new Map();
const processingMessages = new Map();
const CALLBACK_DEBOUNCE_MS = 1000;
const MESSAGE_DEBOUNCE_MS = 500;

function registerHandlers(bot) {
  bot.start(async (ctx) => {
    if (!ctx.from?.id) return;
    try {
      // Сбрасываем режим админа при /start
      const { getSession, updateSession } = await import('./db/sessions.js');
      const session = await getSession(ctx.from.id);
      if (session?.admin_mode) {
        await updateSession(ctx.from.id, { admin_mode: null });
      }
      
      const payload = await initUser(ctx.from);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка /start:', err.message);
      await ctx.reply('Не удалось запустить бота. Попробуй позже.');
    }
  });

  bot.command('admin', async (ctx) => {
    if (!ctx.from?.id) return;
    
    try {
      const { isAdmin } = await import('./db/users.js');
      const adminStatus = await isAdmin(ctx.from.id);
      
      if (!adminStatus) {
        await ctx.reply('У вас недостаточно прав');
        return;
      }
      
      await ctx.reply(
        '🔐 *Панель администратора*\n\nВыберите действие:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Изменить системный промпт', callback_data: 'admin:edit_system_prompt' }],
              [{ text: '🔄 Изменить этапы', callback_data: 'admin:edit_blocks' }],
              [{ text: '❌ Закрыть', callback_data: 'admin:close' }],
            ],
          },
        }
      );
    } catch (err) {
      console.error('Ошибка /admin:', err.message);
      await ctx.reply('Ошибка проверки прав доступа.');
    }
  });

  bot.on('callback_query', async (ctx) => {
    if (!ctx.from?.id) return;

    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;
    
    // Обработка admin callback'ов
    if (callbackData.startsWith('admin:')) {
      const { isAdmin } = await import('./db/users.js');
      const { updateSession } = await import('./db/sessions.js');
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        await ctx.answerCbQuery('У вас недостаточно прав').catch(() => {});
        return;
      }
      
      await ctx.answerCbQuery().catch(() => {});
      
      const action = callbackData.split(':')[1];
      
      switch (action) {
        case 'edit_system_prompt':
          await updateSession(userId, { admin_mode: 'edit_system_prompt' });
          await ctx.reply(
            '📝 *Редактирование системного промпта*\n\n' +
            'Отправьте новый текст системного промпта.\n\n' +
            'Можете отправить:\n' +
            '• Текстовое сообщение\n' +
            '• TXT файл\n' +
            '• PDF файл\n\n' +
            '⚠️ Внимание: это изменит поведение ИИ для всех пользователей.\n\n' +
            'Для отмены используйте /admin',
            { parse_mode: 'Markdown' }
          );
          break;
          
        case 'edit_blocks':
          await updateSession(userId, { admin_mode: 'edit_blocks' });
          await ctx.reply(
            '🔄 *Редактирование этапов*\n\n' +
            'Отправьте новый текст этапов блоков.\n\n' +
            'Можете отправить:\n' +
            '• Текстовое сообщение\n' +
            '• TXT файл\n' +
            '• PDF файл\n\n' +
            '⚠️ Внимание: это изменит структуру анализа для всех пользователей.\n\n' +
            'Для отмены используйте /admin',
            { parse_mode: 'Markdown' }
          );
          break;
          
        case 'close':
          await updateSession(userId, { admin_mode: null });
          await ctx.deleteMessage().catch(() => {});
          break;
          
        default:
          await ctx.reply('Неизвестное действие.');
      }
      
      return;
    }
    
    // Обычная обработка callback'ов для сценария
    const key = `${userId}:${callbackData}`;
    const now = Date.now();
    const lastProcessed = processingCallbacks.get(key);
    
    if (lastProcessed && (now - lastProcessed) < CALLBACK_DEBOUNCE_MS) {
      await ctx.answerCbQuery('⏳ Обрабатывается...').catch(() => {});
      return;
    }
    
    processingCallbacks.set(key, now);
    
    // Очищаем старые записи (старше 5 секунд)
    for (const [k, timestamp] of processingCallbacks.entries()) {
      if (now - timestamp > 5000) {
        processingCallbacks.delete(k);
      }
    }

    await ctx.answerCbQuery().catch(() => {});
    await ctx.sendChatAction('typing').catch(() => {});

    try {
      const payload = await handleCallback(ctx.from, ctx.callbackQuery.data);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка callback:', err.message, err.stack);
      await ctx.reply(`❌ Ошибка: ${err.message}\n\nПопробуй ещё раз или используй /start`).catch(() => {});
    } finally {
      // Убираем блокировку через некоторое время
      setTimeout(() => {
        processingCallbacks.delete(key);
      }, CALLBACK_DEBOUNCE_MS);
    }
  });

  bot.on('text', async (ctx) => {
    if (!ctx.from?.id) return;

    const text = ctx.message.text?.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      await ctx.reply(
        'Команды отключены. Используй /start и кнопки сценария Lapis Vivus.',
      );
      return;
    }

    const userId = ctx.from.id;
    
    // Проверяем режим админа из БД
    const { getSession, updateSession } = await import('./db/sessions.js');
    const session = await getSession(userId);
    const adminMode = session?.admin_mode;
    
    if (adminMode) {
      const { isAdmin } = await import('./db/users.js');
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        console.log('[text] НЕ админ, сбрасываем режим');
        await updateSession(userId, { admin_mode: null });
        await ctx.reply('У вас недостаточно прав');
        return;
      }
      
      try {
        const { updatePrompt } = await import('./prompts/loadSystemPrompt.js');
        const promptId = adminMode === 'edit_system_prompt' ? 'system' : 'blocks';
        const promptName = adminMode === 'edit_system_prompt' ? 'Системный промпт' : 'Этапы';
        
        await ctx.sendChatAction('typing').catch(() => {});
        await updatePrompt(promptId, text, userId);
        
        await updateSession(userId, { admin_mode: null });
        await ctx.reply(
          `✅ ${promptName} успешно обновлен!\n\n` +
          `Длина: ${text.length} символов\n` +
          `Новый промпт будет использоваться для всех новых запросов к ИИ.`
        );
      } catch (err) {
        console.error('Ошибка обновления промпта:', err.message);
        await ctx.reply(`❌ Ошибка: ${err.message}`);
      }
      
      return;
    }
    
    const key = `${userId}:text`;
    const now = Date.now();
    const lastProcessed = processingMessages.get(key);
    
    if (lastProcessed && (now - lastProcessed) < MESSAGE_DEBOUNCE_MS) {
      return; // Игнорируем дубликаты
    }
    
    processingMessages.set(key, now);
    
    // Очищаем старые записи
    for (const [k, timestamp] of processingMessages.entries()) {
      if (now - timestamp > 3000) {
        processingMessages.delete(k);
      }
    }

    await ctx.sendChatAction('typing').catch(() => {});

    try {
      const payload = await handleText(ctx.from, text);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка text:', err.message, err.stack);
      await ctx.reply(`❌ Ошибка: ${err.message}\n\nПопробуй ещё раз.`).catch(() => {});
    } finally {
      setTimeout(() => {
        processingMessages.delete(key);
      }, MESSAGE_DEBOUNCE_MS);
    }
  });

  bot.on('photo', async (ctx) => {
    if (!ctx.from?.id) return;

    const photos = ctx.message.photo ?? [];
    const largest = photos[photos.length - 1];
    if (!largest?.file_id) return;

    await ctx.sendChatAction('typing').catch(() => {});
    
    try {
      const payload = await handleFile(ctx.from, largest.file_id, 'photo');
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка photo:', err.message);
      await ctx.reply('Ошибка обработки фото. Попробуй ещё раз.');
    }
  });

  bot.on('document', async (ctx) => {
    if (!ctx.from?.id) return;

    const document = ctx.message.document;
    if (!document?.file_id) return;
    
    const userId = ctx.from.id;
    
    // Проверяем режим админа из БД
    const { getSession, updateSession } = await import('./db/sessions.js');
    const session = await getSession(userId);
    const adminMode = session?.admin_mode;
    
    console.log(`[document] userId=${userId}, adminMode=${adminMode}, fileName=${document.file_name}`);
    
    if (adminMode) {
      console.log(`[document] Админ в режиме ${adminMode}`);
      const { isAdmin } = await import('./db/users.js');
      const adminStatus = await isAdmin(userId);
      
      if (!adminStatus) {
        console.log('[document] НЕ админ, сбрасываем режим');
        await updateSession(userId, { admin_mode: null });
        await ctx.reply('У вас недостаточно прав');
        return;
      }
      
      const mimeType = document.mime_type || '';
      const fileName = document.file_name || '';
      
      // Проверяем тип файла - TXT или PDF
      const isTxt = mimeType.includes('text') || fileName.endsWith('.txt');
      const isPdf = mimeType === 'application/pdf' || fileName.endsWith('.pdf');
      
      if (!isTxt && !isPdf) {
        await ctx.reply(
          '❌ Поддерживаются только TXT и PDF файлы\n\n' +
          'Отправьте промпт в одном из форматов:\n' +
          '• Текстовое сообщение\n' +
          '• TXT файл\n' +
          '• PDF файл'
        );
        return;
      }
      
      try {
        await ctx.sendChatAction('typing').catch(() => {});
        
        const { loadBotConfig } = await import('./config.js');
        const { botToken } = loadBotConfig();
        
        // Получаем файл из Telegram
        const metaRes = await fetch(
          `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(document.file_id)}`
        );
        const meta = await metaRes.json();
        
        if (!meta.ok || !meta.result?.file_path) {
          throw new Error('Не удалось получить файл из Telegram.');
        }
        
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${meta.result.file_path}`;
        const fileRes = await fetch(fileUrl);
        
        if (!fileRes.ok) {
          throw new Error('Не удалось скачать файл.');
        }
        
        const arrayBuffer = await fileRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Извлекаем текст из TXT или PDF
        let extractedText;
        
        if (isTxt) {
          extractedText = buffer.toString('utf-8');
        } else if (isPdf) {
          // Используем pdfjs-dist для извлечения текста из PDF
          try {
            const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
            
            // Загружаем PDF документ
            const loadingTask = pdfjsLib.getDocument({
              data: new Uint8Array(buffer),
              useSystemFonts: true,
              isEvalSupported: false,
            });
            
            const pdfDocument = await loadingTask.promise;
            const numPages = pdfDocument.numPages;
            
            // Извлекаем текст со всех страниц
            const textPromises = [];
            for (let i = 1; i <= numPages; i++) {
              textPromises.push(
                pdfDocument.getPage(i).then(page => 
                  page.getTextContent().then(content => 
                    content.items.map(item => item.str).join(' ')
                  )
                )
              );
            }
            
            const pageTexts = await Promise.all(textPromises);
            extractedText = pageTexts.join('\n\n');
            
          } catch (pdfError) {
            console.error('Ошибка извлечения текста из PDF:', pdfError);
            throw new Error('Не удалось извлечь текст из PDF. Попробуйте сохранить документ как .txt файл.');
          }
        }
        
        if (!extractedText || extractedText.trim().length < 10) {
          throw new Error('Не удалось извлечь текст из файла или файл пустой');
        }
        
        const { updatePrompt } = await import('./prompts/loadSystemPrompt.js');
        const promptId = adminMode === 'edit_system_prompt' ? 'system' : 'blocks';
        const promptName = adminMode === 'edit_system_prompt' ? 'Системный промпт' : 'Этапы';
        
        await updatePrompt(promptId, extractedText, userId);
        
        await updateSession(userId, { admin_mode: null });
        await ctx.reply(
          `✅ ${promptName} успешно обновлен из файла!\n\n` +
          `Файл: ${fileName}\n` +
          `Длина: ${extractedText.length} символов\n` +
          `Новый промпт будет использоваться для всех новых запросов к ИИ.`
        );
      } catch (err) {
        console.error('Ошибка обработки файла промпта:', err.message);
        await ctx.reply(`❌ Ошибка: ${err.message}`);
      }
      
      return;
    }

    await ctx.sendChatAction('typing').catch(() => {});
    
    try {
      const payload = await handleFile(ctx.from, document.file_id, 'document', document.file_name, document.mime_type);
      await sendScenarioReply(ctx, payload);
    } catch (err) {
      console.error('Ошибка document:', err.message);
      await ctx.reply('Ошибка обработки документа. Попробуй ещё раз.');
    }
  });

  bot.on('message', async (ctx) => {
    if (ctx.message.text || ctx.message.photo || ctx.message.document) return;
    if (!ctx.from?.id) return;

    await ctx.reply(
      'Этот тип сообщения не поддерживается. Используй кнопки, текст анкеты или файл на экране блока.',
    );
  });

  bot.catch((err) => {
    console.error('Ошибка обработки обновления:', err.message);
  });
}

export function getBot() {
  if (!botInstance) {
    const { botToken } = loadBotConfig();
    botInstance = new Telegraf(botToken);
    registerHandlers(botInstance);
  }

  return botInstance;
}
