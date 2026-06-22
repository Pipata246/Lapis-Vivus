/**
 * Постраничный просмотр длинных ответов — одно сообщение, навигация «как книга».
 */

import { splitTelegramMessages, TELEGRAM_PARSE_MODE, htmlToPlain } from '../ai/formatResponse.js';
import { letterhead, btn } from './brand.js';
import { CALLBACK_PREFIX } from '../scenario/constants.js';
import { deliverSingleMessage } from './singleMessage.js';

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
export function formatBookPage({ headerHtml, bodyHtml, pageIndex, totalPages, lang = 'ru', isLastPage = false, showDoneLine = true }) {
  const code = lang === 'en' ? 'en' : 'ru';
  const pageNum = pageIndex + 1;
  const indicator =
    totalPages > 1
      ? `<i>${code === 'en' ? 'Page' : 'Страница'} ${pageNum} / ${totalPages}</i>`
      : '';

  const doneLine =
    isLastPage && showDoneLine
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
      rows.push([{ text: btn(lang, 'comparePair'), callback_data: cb('compare_start') }]);
    }
  }

  rows.push([{ text: btn(lang, 'menu'), callback_data: cb('menu') }]);

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
    showDoneLine: pager?.showDoneLine !== false,
  });

  const keyboard = bookPagerKeyboard({
    pageIndex: index,
    totalPages: total,
    lang,
    completeActions: pager?.completeActions ?? 'compare',
  });

  return { text, keyboard, index, total, isLast };
}

export async function replaceCallbackMessage(ctx, { text, keyboard, lang = 'ru' }) {
  await deliverSingleMessage(ctx, {
    text,
    keyboard,
    userId: ctx.from?.id,
    lang,
    skipMainMenu: true,
  });
}
