/**
 * Премиальное превью этапа прогона (единый стиль для всех блоков).
 */

import { SERVER_COMPUTE_BLOCKS } from '../services/computeClient.js';
import { formatCalculatorLinksText } from '../scenario/calculatorLinks.js';
import { escapeHtml, formatModuleHeader, ONBOARDING_ICON, section } from './brand.js';
import { getModuleMeta } from './modules.js';

function profileLines(collectedData, lang) {
  const data = collectedData ?? {};
  const rows = [
    [ONBOARDING_ICON.birth_date, lang === 'en' ? 'Date' : 'Дата', data.birth_date],
    [ONBOARDING_ICON.birth_time, lang === 'en' ? 'Time' : 'Время', data.birth_time],
    [ONBOARDING_ICON.birth_place, lang === 'en' ? 'Place' : 'Место', data.birth_place],
  ].filter(([, , v]) => v);

  if (rows.length === 0) return '';

  return rows.map(([icon, label, value]) => `${icon} ${label}: <b>${escapeHtml(String(value))}</b>`).join('\n');
}

function stripCalculatorFooter(html) {
  return html
    .replace(/🔗 <b>Инструменты расчёта<\/b>\n?/gi, '')
    .replace(/🔗 <b>Calculation tools<\/b>\n?/gi, '')
    .replace(/<i>📎 Сохраните результат и приложите файл, если модуль требует данных\.<\/i>\n?/gi, '')
    .replace(/<i>📎 Save the result and attach a file if this step needs data\.<\/i>\n?/gi, '')
    .trim();
}

function computePrepBody(blockId, collectedData, lang) {
  const profile = profileLines(collectedData, lang);
  const isEn = lang === 'en';

  const engineLine =
    blockId === '1A'
      ? isEn
        ? 'Human Design bodygraph from your birth profile.'
        : 'Бодиграф Human Design по данным профиля.'
      : isEn
        ? 'Digital matrices and cross-system stent tensor.'
        : 'Цифровые матрицы и кросс-системные стенты.';

  return [
    section(
      isEn ? 'Engine' : 'Расчёт',
      [
        `⚡ <b>${isEn ? 'Server-side compute' : 'Серверный расчёт'}</b>`,
        `<i>${engineLine}</i>`,
        `<i>${isEn ? 'No screenshots or file uploads.' : 'Скриншоты и файлы не нужны.'}</i>`,
      ].join('\n'),
      '◆',
    ),
    profile ? section(isEn ? 'Profile' : 'Профиль', profile, '◆') : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function externalPrepBody(blockId, collectedData, ownFiles, inheritedFiles, userText, lang) {
  const isEn = lang === 'en';
  const parts = [];

  const calcHint = stripCalculatorFooter(formatCalculatorLinksText(blockId, collectedData));
  if (calcHint) {
    parts.push(section(isEn ? 'Tools' : 'Инструменты', calcHint, '🔗'));
  }

  const materialLines = [];
  if (ownFiles.length > 0) {
    const names = ownFiles.map((f) => f.file_name || (isEn ? 'File' : 'Файл')).join(', ');
    materialLines.push(
      isEn
        ? `✅ Attached · ${ownFiles.length} (${names})`
        : `✅ Прикреплено · ${ownFiles.length} (${names})`,
    );
  } else if (inheritedFiles.length > 0) {
    materialLines.push(
      isEn
        ? `✅ Using materials from step 3 · ${inheritedFiles.length}`
        : `✅ Материалы этапа 3 · ${inheritedFiles.length}`,
    );
  } else {
    materialLines.push(`📎 <b>${isEn ? 'Attach required' : 'Нужно приложить'}</b>`);
    materialLines.push(
      `<i>${isEn ? 'Screenshot or export from the calculator.' : 'Скрин или файл расчёта с калькулятора.'}</i>`,
    );
  }

  if (userText) {
    const preview = userText.length > 100 ? `${userText.slice(0, 100)}…` : userText;
    materialLines.push(isEn ? `📝 Note · «${preview}»` : `📝 Комментарий · «${escapeHtml(preview)}»`);
  }

  parts.push(section(isEn ? 'Materials' : 'Материалы', materialLines.join('\n'), '◆'));
  return parts.filter(Boolean).join('\n\n');
}

function standardPrepBody(ownFiles, inheritedFiles, userText, lang) {
  const isEn = lang === 'en';
  const lines = [
    `✨ <b>${isEn ? 'Ready to run' : 'Готово к запуску'}</b>`,
    `<i>${isEn ? 'No extra files needed for this step.' : 'Дополнительные файлы для этого этапа не нужны.'}</i>`,
  ];

  if (ownFiles.length > 0) {
    lines.push(
      isEn
        ? `<i>Also attached: ${ownFiles.length} file(s).</i>`
        : `<i>Также прикреплено файлов: ${ownFiles.length}.</i>`,
    );
  }
  if (inheritedFiles.length > 0) {
    lines.push(
      isEn
        ? `<i>Using ${inheritedFiles.length} file(s) from step 3.</i>`
        : `<i>Используются материалы этапа 3: ${inheritedFiles.length}.</i>`,
    );
  }
  if (userText) {
    const preview = userText.length > 100 ? `${userText.slice(0, 100)}…` : userText;
    lines.push(isEn ? `<i>Your note: «${preview}»</i>` : `<i>Ваш комментарий: «${escapeHtml(preview)}»</i>`);
  }

  return section(isEn ? 'Launch' : 'Запуск', lines.join('\n'), '◆');
}

function prepFooter(block, lang) {
  const isEn = lang === 'en';
  if (SERVER_COMPUTE_BLOCKS.has(block.id)) {
    return isEn
      ? 'Tap ▶ Run step — compute takes a few seconds.'
      : 'Нажмите ▶ Запустить этап — расчёт займёт несколько секунд.';
  }
  if (block.requiresExternal) {
    return isEn ? 'Attach materials, then tap ▶ Run step.' : 'Приложите материалы и нажмите ▶ Запустить этап.';
  }
  return isEn ? 'When ready — tap ▶ Run step.' : 'Когда готовы — нажмите ▶ Запустить этап.';
}

/**
 * @param {{ id: string, requiresExternal?: boolean }} block
 */
export function formatBlockPrepScreen(block, blockIndex, ctx, lang = 'ru') {
  const { collectedData, ownFiles = [], inheritedFiles = [] } = ctx;
  const userText = collectedData?.block_user_text?.[block.id] ?? null;
  const isEn = lang === 'en';
  const meta = getModuleMeta(block.id, lang);
  const descLabel = isEn ? 'Overview' : 'Описание';

  let bodySection;
  if (SERVER_COMPUTE_BLOCKS.has(block.id)) {
    bodySection = computePrepBody(block.id, collectedData, lang);
  } else if (block.requiresExternal) {
    bodySection = externalPrepBody(
      block.id,
      collectedData,
      ownFiles,
      inheritedFiles,
      userText,
      lang,
    );
  } else {
    bodySection = standardPrepBody(ownFiles, inheritedFiles, userText, lang);
  }

  return [
    formatModuleHeader(block.id, blockIndex, lang),
    '',
    section(descLabel, `<i>${escapeHtml(meta.brief)}</i>`, '◆'),
    bodySection,
    '',
    `<i>${prepFooter(block, lang)}</i>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Показывать кнопки внешних калькуляторов только если блок реально требует файлов. */
export function blockNeedsCalculatorButtons(blockId) {
  if (SERVER_COMPUTE_BLOCKS.has(blockId)) return false;
  return true;
}
