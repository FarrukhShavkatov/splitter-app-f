# Beginner Setup

Этот файл написан для студентов, которые впервые запускают Docker, Expo и React Native проект.

## 0. Что вы запускаете

В проекте две части:

- Backend: сервер API. Он отвечает за регистрацию, login, друзей, группы, sessions и работу с базой.
- Frontend: mobile app на Expo. Оно отправляет запросы в backend.

Backend и база данных запускаются через Docker. Frontend запускается через Expo.

## 1. Установите программы

Установите:

- Git
- Node.js 20 LTS
- Docker Desktop
- Expo Go на телефон

После установки перезапустите терминал.

Проверьте:

```bash
node -v
npm -v
docker --version
docker compose version
```

Если `docker` не найден, откройте Docker Desktop и дождитесь, пока он полностью запустится.

## 2. Скачайте проект

```bash
git clone <repo-url>
cd splitter-app-f
```

Если проект уже скачан, просто откройте терминал в папке проекта.

## 3. Проверьте проект

```bash
node doctor.cjs
```

Doctor проверит Node.js, npm, Docker и env-файлы.

Предупреждения на первом запуске нормальны. Например, `frontend/.env is missing` означает, что файл еще надо создать.

## 4. Установите зависимости

```bash
npm run setup
```

Это выполнит `npm install` в `backend/` и `frontend/`.

Если установка падает:

```bash
npm --prefix backend install
npm --prefix frontend install
```

Если npm пишет про peer dependencies, попробуйте:

```bash
npm --prefix frontend install --legacy-peer-deps
```

## 5. Запустите backend и базу данных

Убедитесь, что Docker Desktop открыт.

```bash
npm run backend:docker
```

Первый запуск может занять несколько минут. Docker скачает PostgreSQL image, соберет backend image и применит Prisma migrations.

Когда backend готов, вы увидите логи примерно такого вида:

```text
Server running on http://localhost:8080
Health check: http://localhost:8080/health
Swagger docs: http://localhost:8080/api-docs
```

Не закрывайте этот терминал, пока пользуетесь backend.

## 6. Проверьте backend

Откройте второй терминал в папке проекта:

```bash
curl http://localhost:8080/health
```

Ожидаемый ответ:

```json
{ "status": "ok" }
```

Если `curl` не работает, откройте в браузере:

```text
http://localhost:8080/health
```

## 7. Что такое localhost

`localhost` означает "этот же компьютер".

Если вы открыли frontend в браузере на компьютере, `localhost:8080` указывает на backend на компьютере.

Если вы открыли приложение в Expo Go на телефоне, `localhost` указывает на сам телефон. На телефоне backend не запущен, поэтому запросы падают с `ERR_NETWORK`.

Поэтому для телефона нужен IP компьютера в Wi-Fi сети.

## 8. Узнайте IP компьютера

```bash
npm run ip
```

Пример вывода:

```text
192.168.1.23 -> EXPO_PUBLIC_API_URL=http://192.168.1.23:8080
```

Скопируйте URL.

Телефон и компьютер должны быть в одной Wi-Fi сети. Если телефон в мобильном интернете, он не увидит backend.

## 9. Настройте frontend/.env

Создайте файл:

```bash
copy frontend\.env.example frontend\.env
```

На macOS/Linux:

```bash
cp frontend/.env.example frontend/.env
```

Откройте `frontend/.env` и замените:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.23:8080
```

на IP вашего компьютера.

Важно:

- Не используйте `localhost`, если запускаете на телефоне.
- Не удаляйте `http://`.
- Не удаляйте `:8080`.
- После изменения `.env` перезапустите Expo.

## 10. Проверьте env

```bash
node check-env.cjs
```

Если видите warning про localhost, это нормально только для web/emulator. Для телефона используйте LAN IP.

## 11. Запустите frontend

```bash
npm run frontend:dev
```

Откроется Expo Metro bundler.

Варианты запуска:

- Expo Go: отсканируйте QR-код телефоном.
- Android emulator: нажмите `a`.
- iOS simulator: нажмите `i` на macOS.
- Web preview: нажмите `w`, но mobile flow считается основным.

## 12. Если поменяли .env

Остановите Expo через `Ctrl + C`.

Запустите заново с очисткой cache:

```bash
npm run frontend:start:clean
```

## 13. Как остановить проект

Frontend:

```text
Ctrl + C
```

Backend Docker:

```bash
npm run backend:stop
```

Если Docker был запущен в текущем терминале, также можно нажать `Ctrl + C`.

## 14. Где что находится

- `frontend/app/` - экраны Expo Router
- `frontend/src/features/` - feature logic, API helpers, stores
- `frontend/src/shared/` - общие UI/components/config
- `backend/src/routes/` - API routes
- `backend/src/middleware/` - auth/error middleware
- `backend/prisma/schema.prisma` - модели базы данных
- `backend/docker-compose.yml` - PostgreSQL + backend

## 15. Мини-чеклист перед сдачей

```bash
node check-env.cjs
curl http://localhost:8080/health
npm run frontend:dev
```

Проверьте:

- регистрация работает
- login работает
- телефон и компьютер в одной сети
- `frontend/.env` содержит правильный IP
- backend logs не показывают fatal errors

## 16. Как добавить свой endpoint

1. Создайте файл в `backend/src/routes/`, например `tasks.ts`.
2. Добавьте Express router.
3. Подключите его в `backend/src/server.ts`.
4. Перезапустите backend.
5. Проверьте endpoint через браузер, curl или Postman.

Простой пример:

```ts
import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ message: "Hello from tasks" });
});

export default router;
```

В `server.ts`:

```ts
import tasksRoutes from "./routes/tasks.js";
app.use("/tasks", tasksRoutes);
```

## 17. Как подключить endpoint во frontend

Создайте API helper в `frontend/src/features/tasks/api/tasks.api.ts`:

```ts
import { apiClient } from "@/features/auth/api";

export async function getTasks() {
  const { data } = await apiClient.get("/tasks");
  return data;
}
```

Потом вызовите helper из screen/component.

## 18. Главное правило

Если frontend на телефоне пишет `Network error`, почти всегда проблема в одном из этих пунктов:

- backend не запущен
- неправильный IP
- телефон и компьютер не в одной сети
- firewall блокирует порт `8080`
- Expo не был перезапущен после изменения `.env`
