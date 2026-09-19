# Neon Founder ID

MVP приложения для Windows-киоска: анкета на 5 вопросов для студентов, расчет
предпринимательского профиля, съемка или загрузка фото и вставка головы участника
в готовый шаблон результата.

## Запуск

```bash
pnpm install
pnpm dev
```

После запуска:

- интерфейс: `http://localhost:5173`
- API обработки фото: `http://localhost:8787`
- готовые изображения: `public/results`
- базовые шаблоны для обработки: `public/templates`

## Как подключить настоящую нейронку

Сейчас `server.js` содержит рабочий processor на `sharp`: он принимает фото и вставляет
голову в размеченную область выбранного студенческого шаблона. На GitHub Pages тот же
пайплайн работает прямо в браузере через canvas.

Для production с настоящей нейросетевой заменой лица можно заменить функцию
`createStudentPoster` на вызов face-swap движка:

1. Положить базовые изображения в `public/templates`.
2. Поставить локальный движок, например FaceFusion, InsightFace/inswapper или SimSwap.
3. В `POST /api/process-photo` передать:
   - фото пользователя;
   - выбранный `profile`;
   - имя шаблона.
4. Получить от движка финальную картинку и сохранить ее в `public/results`.

Рекомендуемая production-схема:

```text
React kiosk UI
  -> Node API
  -> Python face-swap service
  -> InsightFace / ONNX Runtime / GPU
  -> public/results/final.png
```

## Режим киоска

Для установки на Windows:

1. Включить автозапуск приложения.
2. Открывать `http://localhost:5173` в полноэкранном браузере или Electron shell.
3. Запретить системные жесты и выход из окна.
4. Настроить очистку `public/results` и временных фото по расписанию.
