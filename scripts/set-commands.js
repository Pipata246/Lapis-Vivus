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

const GROUP_COMMANDS = {
  ru: [
    { command: 'start', description: 'О боте и как открыть личный чат' },
    { command: 'rules', description: 'Правила беседы' },
  ],
  en: [
    { command: 'start', description: 'About the bot and private chat' },
    { command: 'rules', description: 'Community rules' },
  ],
};

async function setCommands(botToken, commands, { languageCode, scope } = {}) {
  const body = { commands };
  if (languageCode) body.language_code = languageCode;
  if (scope) body.scope = scope;

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

  const privateScope = { type: 'all_private_chats' };
  const groupScope = { type: 'all_group_chats' };

  await setCommands(botToken, COMMAND_SETS.ru, { languageCode: 'ru', scope: privateScope });
  await setCommands(botToken, COMMAND_SETS.en, { languageCode: 'en', scope: privateScope });
  await setCommands(botToken, COMMAND_SETS.en, { scope: privateScope });

  await setCommands(botToken, GROUP_COMMANDS.ru, { languageCode: 'ru', scope: groupScope });
  await setCommands(botToken, GROUP_COMMANDS.en, { languageCode: 'en', scope: groupScope });
  await setCommands(botToken, GROUP_COMMANDS.ru, { scope: groupScope });

  console.log('Команды меню установлены.');
  console.log('');
  console.log('Личный чат (all_private_chats):');
  for (const cmd of COMMAND_SETS.ru) {
    console.log(`  /${cmd.command} — ${cmd.description}`);
  }
  console.log('');
  console.log('Беседа (all_group_chats):');
  for (const cmd of GROUP_COMMANDS.ru) {
    console.log(`  /${cmd.command} — ${cmd.description}`);
  }
  console.log('');
  console.log('Повторите после смены списка: npm run commands:set');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
