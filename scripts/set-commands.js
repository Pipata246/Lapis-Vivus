import 'dotenv/config';

const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{35,}$/;

const COMMAND_SETS = {
  ru: [
    { command: 'start', description: 'Главное меню' },
    { command: 'profile', description: 'Мой профиль' },
    { command: 'balance', description: 'Баланс' },
    { command: 'protocol', description: 'Запустить протокол' },
    { command: 'settings', description: 'Настройки' },
    { command: 'help', description: 'Справка' },
  ],
  en: [
    { command: 'start', description: 'Main menu' },
    { command: 'profile', description: 'My profile' },
    { command: 'balance', description: 'Balance' },
    { command: 'protocol', description: 'Launch protocol' },
    { command: 'settings', description: 'Settings' },
    { command: 'help', description: 'Help' },
  ],
};

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Переменная ${name} не задана.`);
  return value;
}

async function setCommands(botToken, commands, languageCode) {
  const body = { commands };
  if (languageCode) body.language_code = languageCode;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description ?? 'setMyCommands failed');
  }
}

async function main() {
  const botToken = requireEnv('BOT_TOKEN');
  if (!TOKEN_PATTERN.test(botToken)) {
    throw new Error('BOT_TOKEN имеет неверный формат.');
  }

  await setCommands(botToken, COMMAND_SETS.ru, 'ru');
  await setCommands(botToken, COMMAND_SETS.en, 'en');
  await setCommands(botToken, COMMAND_SETS.en);

  console.log('Команды меню установлены (ru, en, default).');
  console.log('');
  console.log('Для BotFather вручную (@BotFather → /setcommands):');
  console.log('');
  console.log('RU:');
  for (const cmd of COMMAND_SETS.ru) {
    console.log(`${cmd.command} - ${cmd.description}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
