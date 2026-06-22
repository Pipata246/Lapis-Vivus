/**
 * Постраничный просмотр длинных ответов — одно сообщение, навигация «как книга».
 */

import { splitTelegramMessages, TELEGRAM_PARSE_MODE, htmlToPlain } from '../ai/formatResponse.js';
import { letterhead, btn } from './brand.js';
import { CALLBACK_PREFIX } from '../scenario/constants.js';
const TELEGRAM_MAX = 4096;
/** Запас под шапку, индикатор страницы и кнопки. */
export const PAGER_CONTENT_MAX = 3400;

function cb(action) {
  return `${CALLBACK_PREFIX}:${action}`;
}

/**
 * Разбивает тело ответа на страницы (без шапки).
 * @param {string} bodyHtml
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function splitIntoBookPages(bodyHtml, maxLen = PAGER_CONTENT_MAX) {
  const trimmed = (bodyHtml ?? '').trim();
  if (!trimmed) return ['—'];
  return splitTelegramMessages(trimmed, maxLen);
}

/**
 * @param {object} opts
 * @param {string} opts.headerHtml — шапка экрана (бренд + контекст)
 * @param {string} opts.bodyHtml — тело текущей страницы
 * @param {number} opts.pageIndex — 0-based
 * @param {number} opts.totalPages
 * @param {string} [opts.lang]
 * @param {boolean} [opts.isLastPage]
 */
export function formatBookPage({ headerHtml, bodyHtml, pageIndex, totalPages, lang = 'ru', isLastPage = false }) {
  const code = lang === 'en' ? 'en' : 'ru';
  const pageNum = pageIndex + 1;
  const indicator =
    totalPages > 1
      ? `<i>${code === 'en' ? 'Page' : 'Страница'} ${pageNum} / ${totalPages}</i>`
      : '';

  const doneLine = isLastPage
    ? `\n\n<b>${code === 'en' ? '✓ Complete' : '✅ Готово'}</b>`
    : '';

  const full = [headerHtml, '', bodyHtml, doneLine, indicator].filter((line) => line !== '').join('\n');
  if (full.length <= TELEGRAM_MAX) return full;
  return `${full.slice(0, TELEGRAM_MAX - 1)}…`;
}

/**
 * Клавиатура листания: ◀ Назад · Далее ▶; на последней — меню.
 */
export function bookPagerKeyboard({ pageIndex, totalPages, lang = 'ru', completeActions = 'compare' }) {
  const code = lang === 'en' ? 'en' : 'ru';
  const isFirst = pageIndex <= 0;
  const isLast = pageIndex >= totalPages - 1;

  const backLabel = code === 'en' ? '◀ Back' : '◀ Назад';
  const nextLabel = code === 'en' ? 'Next ▶' : 'Далее ▶';

  const navRow = [];

  if (!isFirst) {
    navRow.push({ text: backLabel, callback_data: cb('page_prev') });
  }

  if (!isLast) {
    navRow.push({ text: nextLabel, callback_data: cb('page_next') });
  }

  const rows = [];
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  if (isLast) {
    if (completeActions === 'compare') {
      rows.push(
        [{ text: btn(lang, 'comparePair'), callback_data: cb('compare_start') }],
        [{ text: btn(lang, 'menu'), callback_data: cb('menu') }],
      );
    } else {
      rows.push([{ text: btn(lang, 'menu'), callback_data: cb('menu') }]);
    }
  }

  return { inline_keyboard: rows };
}

/**
 * Собирает полный текст страницы из сохранённого pager-состояния сессии.
 * @param {object} pager — { headerHtml, pages, index }
 */
export function renderPagerPage(pager, lang = 'ru') {
  const headerHtml = pager?.headerHtml ?? letterhead(lang === 'en' ? 'Result' : 'Результат', lang);
  const reserved = headerHtml.length + 96;
  const pageMax = Math.max(1200, PAGER_CONTENT_MAX - reserved);
  const pages =
    pager?.pages?.length > 0
      ? pager.pages
      : splitIntoBookPages(pager?.bodyHtml ?? '', pageMax);
  const index = Math.min(Math.max(pager?.index ?? 0, 0), Math.max(pages.length - 1, 0));
  const total = pages.length || 1;
  const isLast = index >= total - 1;

  const text = formatBookPage({
    headerHtml,
    bodyHtml: pages[index] ?? '—',
    pageIndex: index,
    totalPages: total,
    lang,
    isLastPage: isLast,
  });

  const keyboard = bookPagerKeyboard({
    pageIndex: index,
    totalPages: total,
    lang,
    completeActions: pager?.completeActions ?? 'compare',
  });

  return { text, keyboard, index, total, isLast };
}

/**
 * Удаляет текущее callback-сообщение и отправляет новое (листание «книги»).
 */
async function deliverTelegramPayload(ctx, text, keyboard, { preferEdit = false } = {}) {
  const replyOptions = { parse_mode: TELEGRAM_PARSE_MODE };
  if (keyboard) replyOptions.reply_markup = keyboard;

  const sendPlain = async () => {
    const plainOptions = {};
    if (keyboard) plainOptions.reply_markup = keyboard;
    await ctx.reply(htmlToPlain(text), plainOptions);
  };

  if (preferEdit && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, replyOptions);
      return;
    } catch (err) {
      console.log('[pager] edit fallback:', err.message);
    }
  }

  if (ctx.callbackQuery?.message) {
    await ctx.deleteMessage().catch(() => {});
  }

  try {
    await ctx.reply(text, replyOptions);
  } catch (err) {
    if (err.message?.includes('parse') || err.message?.includes('entities')) {
      await sendPlain();
      return;
    }
    if (err.message?.includes('message is too long')) {
      await ctx.reply(htmlToPlain(text).slice(0, TELEGRAM_MAX - 1), {
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
      return;
    }
    throw err;
  }
}

export async function replaceCallbackMessage(ctx, { text, keyboard, preferEdit = false }) {
  await deliverTelegramPayload(ctx, text, keyboard, { preferEdit });
}
