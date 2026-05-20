import 'dotenv/config';
import { askGpt } from '../src/ai/gptunnel.js';

const testMessage = process.argv[2] || 'Привет, ответь одним словом: ок';

askGpt([{ role: 'user', content: testMessage }])
  .then((answer) => {
    console.log('OK:', answer);
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exit(1);
  });
