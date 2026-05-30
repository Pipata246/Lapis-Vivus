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
    
    // Проверяем наличие JSON-артефакта с правильным именем
    const artifactRegex = new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (!artifactRegex.test(text)) {
      issues.push(`нет JSON-артефакта ${artifact}`);
    }

    // Экранируем ID блока для regex
    const escapedId = expectedBlockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Проверяем привязку к блоку разными способами
    const blockPatterns = [
      new RegExp(`"текущий_блок"\\s*:\\s*"${escapedId}"`, 'i'),
      new RegExp(`"сервер_назначил_блок"\\s*:\\s*"${escapedId}"`, 'i'),
      new RegExp(`БЛОК\\s*${escapedId}\\b`, 'i'),
      new RegExp(`блок[_\\s]*${escapedId}`, 'i'),
    ];

    const mentionsCorrectBlock = blockPatterns.some(pattern => pattern.test(text));
    
    if (!mentionsCorrectBlock) {
      issues.push(`ответ не привязан к блоку ${expectedBlockId}`);
    }

    // Проверяем, что в ответе НЕТ других блоков (кроме текущего)
    const allBlockIds = ['1A', '1B', '1C', '1D', '2', '2B', '3', '3B', '4', '4B', '5'];
    const forbiddenBlocks = allBlockIds.filter(id => id !== expectedBlockId);
    
    for (const forbiddenId of forbiddenBlocks) {
      // Проверяем наличие JSON-артефакта другого блока
      const forbiddenArtifact = jsonArtifactName(forbiddenId);
      const forbiddenArtifactRegex = new RegExp(forbiddenArtifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      
      if (forbiddenArtifactRegex.test(text)) {
        issues.push(`обнаружен артефакт чужого блока ${forbiddenId}`);
        break;
      }
      
      // Проверяем заголовки других блоков (строго)
      const escapedForbidden = forbiddenId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const headerRegex = new RegExp(`##\\s*БЛОК\\s*${escapedForbidden}\\b`, 'i');
      
      if (headerRegex.test(text)) {
        issues.push(`обнаружен заголовок чужого блока ${forbiddenId}`);
        break;
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
