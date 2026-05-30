import 'dotenv/config';
import { ensureStorageBucket } from '../src/services/fileStorage.js';

async function main() {
  console.log('Проверка и создание bucket для файлов...');
  
  const success = await ensureStorageBucket();
  
  if (success) {
    console.log('✅ Storage bucket готов к использованию');
  } else {
    console.error('❌ Не удалось настроить Storage bucket');
    console.error('Проверь:');
    console.error('1. SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
    console.error('2. Права доступа к Storage в Supabase Dashboard');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
