import { BLOCK_IDS, jsonArtifactPatterns } from '../scenario/constants.js';

/**
 * Проверка ответа блока — v26.90 (JSON + профанский комментарий) и legacy v26.30.
 */
export function validateBlockResponse(text, expectedBlockId) {
  const issues = [];
  const critical = [];

  if (!text || text.trim().length < 50) {
    critical.push('ответ слишком короткий');
  }

  if (!/```json/i.test(text)) {
    critical.push('нет блока ```json');
  }

  if (!/осталось_блоков_в_стеке|remaining_blocks_in_stack/i.test(text)) {
    critical.push('нет поля остатка блоков (осталось_блоков_в_стеке / remaining_blocks_in_stack)');
  }

  const hasOldMeta = /Метакомментарии_Блока/i.test(text);
  const hasProfan = /ПРОФАНСКИЙ\s+КОММЕНТАРИЙ/i.test(text);
  const jsonEnd = text.search(/```json[\s\S]*?```/i);
  const afterJson = jsonEnd >= 0 ? text.slice(jsonEnd).replace(/```json[\s\S]*?```/i, '').trim() : '';

  if (!hasOldMeta && !hasProfan && afterJson.length < 80) {
    issues.push('нет развёрнутого текста после JSON (ПРОФАНСКИЙ КОММЕНТАРИЙ или метакомментарии)');
  }

  if (hasOldMeta && (!/Уровень_1/i.test(text) || !/Уровень_5/i.test(text))) {
    issues.push('нет пятиуровневых метакомментариев (Уровень_1 … Уровень_5)');
  }

  if (expectedBlockId) {
    const patterns = jsonArtifactPatterns(expectedBlockId);
    const hasArtifact = patterns.some((name) => {
      const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return re.test(text);
    });

    if (!hasArtifact) {
      issues.push(`нет JSON-артефакта (${patterns[0]})`);
    }

    const escapedId = expectedBlockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockPatterns = [
      new RegExp(`"block_id"\\s*:\\s*"${escapedId}"`, 'i'),
      new RegExp(`"текущий_блок"\\s*:\\s*"${escapedId}"`, 'i'),
      new RegExp(`"сервер_назначил_блок"\\s*:\\s*"${escapedId}"`, 'i'),
      new RegExp(`ITERATIVE_BLOCK[_\\s]*${escapedId.replace(/\./g, '[._]')}`, 'i'),
      new RegExp(`БЛОК\\s*${escapedId}\\b`, 'i'),
    ];

    if (!blockPatterns.some((pattern) => pattern.test(text))) {
      issues.push(`ответ не привязан к блоку ${expectedBlockId}`);
    }

    for (const otherId of BLOCK_IDS) {
      if (otherId === expectedBlockId) continue;

      const otherPatterns = jsonArtifactPatterns(otherId);
      for (const name of otherPatterns.slice(0, 2)) {
        const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (re.test(text)) {
          issues.push(`обнаружен артефакт чужого блока ${otherId}`);
          break;
        }
      }
    }
  }

  return {
    ok: critical.length === 0 && issues.length === 0,
    critical,
    issues: [...critical, ...issues],
    deliverable: critical.length === 0,
  };
}

/** Можно показать пользователю, даже если мягкая валидация не прошла */
export function isDeliverableBlockResponse(text, expectedBlockId) {
  const result = validateBlockResponse(text, expectedBlockId);
  return result.deliverable && /```json/i.test(text);
}
