/** Пользовательские тексты — без технических деталей и сырого err.message. */

export function resolveLang(lang) {
  return lang === 'en' ? 'en' : 'ru';
}

const COPY = {
  ru: {
    errorGeneric: 'Не удалось выполнить действие. Попробуйте ещё раз.',
    tryAgain: 'Попробуйте ещё раз или отправьте /start.',
    errorLoad: 'Не удалось загрузить раздел. Попробуйте позже.',
    errorStart: 'Не удалось открыть меню. Попробуйте позже.',
    errorAccess: 'Недостаточно прав для этого действия.',
    errorUnknownAction: 'Действие недоступно. Откройте главное меню.',
    errorStaleButton: 'Кнопка устарела. Отправьте /start.',
    errorPayment: 'Не удалось создать счёт на оплату. Попробуйте позже.',
    errorStage: 'Не удалось выполнить этап. Повторите попытку или вернитесь в меню.',
    errorAi: 'Не удалось получить ответ. Повторите запрос или перейдите дальше.',
    errorFile: 'Не удалось обработать файл. Попробуйте ещё раз.',
    errorPhoto: 'Не удалось обработать изображение. Попробуйте ещё раз.',
    errorDocument: 'Не удалось обработать документ. Попробуйте ещё раз.',
    errorRateLimit: 'Подождите несколько секунд перед следующим запросом.',
    errorFileRequired: 'Для этого этапа нужен файл или текстовое описание данных.',
    errorSessionComplete: 'Протокол завершён.',
    errorTreeStep: 'Выберите один из предложенных вариантов.',
    errorTreeBranch: 'Не удалось продолжить. Начните сессию заново из меню.',
    rejectInput:
      'На этом шаге используйте кнопки, поля анкеты или прикрепите файл — если экран это предусматривает.',
    sessionReset: 'Сессия завершена. Можно начать новый протокол из меню.',
    sessionComplete: 'Протокол завершён.',
    stageSkipped: 'Этап пропущен.',
    stageNextFailed: 'Не удалось перейти дальше. Попробуйте ещё раз.',
    stageRunning: 'Идёт расчёт. Пожалуйста, подождите.',
    stagePreparing: 'Подготовка этапа…',
    stageFailed: 'Этап не выполнен. Повторите или вернитесь в меню.',
    stageDone: 'Этап завершён. Задайте вопрос или перейдите дальше.',
    stageAlreadyRunning: 'Расчёт уже выполняется. Дождитесь завершения.',
    stageRetryHint: 'Повторите этап или вернитесь в меню.',
    dataSaved: 'Данные сохранены.',
    cycleComplete: 'Полный цикл протокола завершён.',
    filesWrongStep:
      'Файлы принимаются на экране этапа после подтверждения профиля. Начните протокол из главного меню.',
    unsupportedMessage:
      'Используйте кнопки на экране, ответы анкеты или файл — если этап это предусматривает.',
    paymentLinkMissing: 'Ссылка на оплату не получена. Попробуйте ещё раз.',
    dateFormat: 'Дата в формате ДД.ММ.ГГГГ, например 15.03.1990',
    dateInvalid: 'Некорректная дата. Проверьте день и месяц.',
    dateFuture: 'Дата рождения не может быть в будущем.',
    dateTooRecent: 'Укажите дату не позднее вчерашнего дня.',
    dateYearMin: 'Год рождения не раньше {year}.',
    timeFormat: 'Время в формате ЧЧ:ММ, например 14:30',
    placeLength: 'Укажите город или населённый пункт (2–80 символов).',
    placeChars: 'Только буквы, пробелы, дефис и апостроф.',
    placeLetters: 'В названии должны быть буквы.',
    placeReal: 'Укажите реальный город или населённый пункт рождения.',
    placeShort: 'Слишком короткое название. Пример: Москва, Казань.',
    placeSingleWord:
      'Для одного слова укажите полное название (от 6 букв) или с заглавной: Омск, Уфа.',
    placeInvalid: 'Некорректное название места.',
  },
  en: {
    errorGeneric: 'Something went wrong. Please try again.',
    tryAgain: 'Please try again or send /start.',
    errorLoad: 'Could not load this section. Please try later.',
    errorStart: 'Could not open the menu. Please try later.',
    errorAccess: 'You do not have access to this action.',
    errorUnknownAction: 'This action is unavailable. Open the main menu.',
    errorStaleButton: 'This button is outdated. Send /start.',
    errorPayment: 'Could not create a payment invoice. Please try later.',
    errorStage: 'This step could not be completed. Retry or return to the menu.',
    errorAi: 'Could not get a response. Retry or continue to the next step.',
    errorFile: 'Could not process the file. Please try again.',
    errorPhoto: 'Could not process the image. Please try again.',
    errorDocument: 'Could not process the document. Please try again.',
    errorRateLimit: 'Please wait a few seconds before your next request.',
    errorFileRequired: 'This step requires a file or a text description of your data.',
    errorSessionComplete: 'Protocol complete.',
    errorTreeStep: 'Please choose one of the options shown.',
    errorTreeBranch: 'Could not continue. Start a new session from the menu.',
    rejectInput:
      'At this step, use the buttons, profile fields, or attach a file when the screen allows it.',
    sessionReset: 'Session ended. You may start a new protocol from the menu.',
    sessionComplete: 'Protocol complete.',
    stageSkipped: 'Step skipped.',
    stageNextFailed: 'Could not proceed. Please try again.',
    stageRunning: 'Calculation in progress. Please wait.',
    stagePreparing: 'Preparing step…',
    stageFailed: 'Step not completed. Retry or return to the menu.',
    stageDone: 'Step complete. Ask a question or continue.',
    stageAlreadyRunning: 'A calculation is already running. Please wait.',
    stageRetryHint: 'Retry the step or return to the menu.',
    dataSaved: 'Data saved.',
    cycleComplete: 'Full protocol cycle complete.',
    filesWrongStep:
      'Files are accepted on the step screen after profile confirmation. Start the protocol from the main menu.',
    unsupportedMessage:
      'Use the on-screen buttons, profile answers, or a file when the step requires it.',
    paymentLinkMissing: 'Payment link was not received. Please try again.',
    dateFormat: 'Date as DD.MM.YYYY, e.g. 15.03.1990',
    dateInvalid: 'Invalid date. Check the day and month.',
    dateFuture: 'Birth date cannot be in the future.',
    dateTooRecent: 'Enter a date no later than yesterday.',
    dateYearMin: 'Birth year cannot be before {year}.',
    timeFormat: 'Time as HH:MM, e.g. 14:30',
    placeLength: 'Enter a city or town (2–80 characters).',
    placeChars: 'Letters, spaces, hyphens and apostrophes only.',
    placeLetters: 'The name must contain letters.',
    placeReal: 'Enter a real city or town of birth.',
    placeShort: 'Name too short. Example: Moscow, London.',
    placeSingleWord:
      'For a single word, use the full city name (6+ letters) or capitalize: Omsk, Perm.',
    placeInvalid: 'Invalid place name.',
  },
};

export function u(lang, key, params = {}) {
  const code = resolveLang(lang);
  let text = COPY[code][key] ?? COPY.en[key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
}

export function rejectText(lang) {
  return u(lang, 'rejectInput');
}

export function mapErrorToUser(lang, err) {
  const msg = String(err?.message ?? '');
  if (/Подожди|wait|rate|част/i.test(msg)) return u(lang, 'errorRateLimit');
  if (/файл|file|прикреп/i.test(msg)) return u(lang, 'errorFileRequired');
  if (/платёж|payment|оплат/i.test(msg)) return u(lang, 'errorPayment');
  if (/Стек блоков|cycle complete|завершён/i.test(msg)) return u(lang, 'cycleComplete');
  if (/Compute|VPS|Vercel|GPTunnel|Supabase|Storage|промпт|JSON|модел|validation|constraint/i.test(msg)) {
    return u(lang, 'errorStage');
  }
  return u(lang, 'errorGeneric');
}
