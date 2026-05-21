import 'dotenv/config';
import { askGpt } from '../src/ai/gptunnel.js';
import { getSystemPrompt } from '../src/prompts/loadSystemPrompt.js';

const testMessage = process.argv[2] || 'Привет, ответь одним словом: ок';

const messages = [
  { role: 'system', content: getSystemPrompt() },
  {
    role: 'user',
    content: JSON.stringify({
      режим: 'test',
      текущий_блок: '1A',
      осталось_блоков_в_стеке: 7,
      универсальные_входные_данные: {
        пол: 'Мужской',
        дата_рождения: '15.03.1990',
        время_рождения: '14:30',
        место_рождения: 'Москва',
      },
      инструкция_исполнения: 'Тест: выполни только БЛОК 1A.',
    }),
  },
];

askGpt(messages)
  .then((answer) => {
    console.log('OK (первые 500 символов):', answer.slice(0, 500));
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exit(1);
  });
