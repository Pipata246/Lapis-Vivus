/**
 * Проверка ответа модели по 0x05_SATURN_CONVERGENCE v21.5 и 0x02 (пять уровней).
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

  if (!/Уровень_1/i.test(text) || !/Уровень_5/i.test(text)) {
    issues.push('нет пятиуровневых метакомментариев (Уровень_1 … Уровень_5)');
  }

  if (!/ГЕРМЕТИЧЕСКИЙ ОПЕРАТОР/i.test(text)) {
    issues.push('нет Уровня_3: ГЕРМЕТИЧЕСКИЙ ОПЕРАТОР');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
