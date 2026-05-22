import { jsonArtifactName } from '../scenario/constants.js';

/**
 * Проверка ответа по 0x05 v21.5 и привязке к ожидаемому block_id (серверный стек).
 */
export function validateBlockResponse(text, expectedBlockId) {
  const issues = [];

  if (!/```json/i.test(text)) {
    issues.push('нет блока ```json');
  }

  if (!/осталось_блоков_в_стеке/i.test(text)) {
    issues.push('нет поля "осталось_блоков_в_стеке"');
  }

  if (!/Метакомментарии_Блока/i.test(text)) {
    issues.push('нет раздела ## Метакомментарии_Блока');
  }

  if (!/Уровень_1/i.test(text) || !/Уровень_5/i.test(text)) {
    issues.push('нет пятиуровневых метакомментариев (Уровень_1 … Уровень_5)');
  }

  if (!/ГЕРМЕТИЧЕСКИЙ ОПЕРАТОР/i.test(text)) {
    issues.push('нет Уровня_3: ГЕРМЕТИЧЕСКИЙ ОПЕРАТОР');
  }

  if (expectedBlockId) {
    const artifact = jsonArtifactName(expectedBlockId);
    const idPattern = expectedBlockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionsBlock =
      new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text) ||
      new RegExp(`блок[_\\s]*${idPattern}`, 'i').test(text) ||
      new RegExp(`"текущий_блок"\\s*:\\s*"${idPattern}"`, 'i').test(text) ||
      new RegExp(`БЛОК\\s*${idPattern}\\b`, 'i').test(text);

    if (!mentionsBlock) {
      issues.push(`ответ не привязан к блоку ${expectedBlockId}`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
