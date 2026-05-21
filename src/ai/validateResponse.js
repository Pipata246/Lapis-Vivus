/**
 * Проверка ответа модели по 0x05_SATURN_CONVERGENCE и 0x02_HERMETIC_METALOG_CHANNELS.
 */
export function validateBlockResponse(text) {
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

  return {
    ok: issues.length === 0,
    issues,
  };
}
