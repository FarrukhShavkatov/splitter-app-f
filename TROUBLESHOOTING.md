# Troubleshooting

## ERR_NETWORK в приложении

Проверьте:

```bash
curl http://localhost:8080/health
```

Если backend отвечает на компьютере, но телефон не видит API:

- телефон и компьютер должны быть в одной Wi-Fi сети
- `frontend/.env` должен содержать IP компьютера, не `localhost`
- пример: `EXPO_PUBLIC_API_URL=http://192.168.1.23:8080`
- после изменения `.env` перезапустите Expo
- проверьте firewall Windows/macOS

## Expo Go не подключается

Попробуйте:

```bash
npm run frontend:start:clean
```

Проверьте:

- Expo Go обновлен
- телефон и компьютер в одной сети
- VPN отключен
- QR-код сканируется из текущего Metro process
- firewall не блокирует Metro ports

Если сеть университета блокирует устройства друг от друга, используйте Expo tunnel:

```bash
npx expo start --tunnel
```

Tunnel может быть медленнее.

## Metro bundler issues

Очистите cache:

```bash
npm run frontend:start:clean
```

Если не помогло:

```bash
cd frontend
npx expo start --clear
```

Иногда помогает удалить `.expo/` и запустить снова.

## Node version incompatibility

Проект рассчитан на Node.js 18 или 20 LTS.

Проверьте:

```bash
node -v
```

Если у вас Node 21, 22 или выше, Expo/React Native dependencies могут вести себя нестабильно. Поставьте Node.js 20 LTS.

## Docker Desktop not running

Ошибка может выглядеть так:

```text
Cannot connect to the Docker daemon
```

Решение:

1. Откройте Docker Desktop.
2. Дождитесь статуса "Docker is running".
3. Повторите:

```bash
npm run backend:docker
```

## WSL issues

Если вы используете Windows + WSL:

- Docker Desktop должен иметь включенную WSL integration
- проект лучше хранить внутри WSL filesystem, например `~/projects/splitter-app-f`
- если проект лежит в `C:\...`, file watching может быть медленнее

Проверьте Docker внутри WSL:

```bash
docker --version
docker compose version
```

## localhost vs local IP

`localhost` работает только внутри того же устройства.

- Browser на компьютере -> `http://localhost:8080` работает
- Expo Go на телефоне -> `localhost` указывает на телефон и не работает
- Expo Go на телефоне -> используйте `http://YOUR_COMPUTER_IP:8080`

Команда:

```bash
npm run ip
```

## Firewall issues

На Windows может появиться запрос "Allow Node.js / Docker to access network". Разрешите private networks.

Если запрос не появился:

- откройте Windows Defender Firewall
- разрешите Node.js и Docker Desktop
- проверьте, что порт `8080` не заблокирован

## npm install problems

Сначала проверьте Node:

```bash
node -v
npm -v
```

Потом попробуйте:

```bash
npm run setup
```

Если frontend ругается на peer dependencies:

```bash
npm --prefix frontend install --legacy-peer-deps
```

Если install выглядит сломанным:

```bash
npm --prefix frontend install
npm --prefix backend install
```

## Expo cache issues

Симптомы:

- old env value still used
- strange bundling errors
- app shows old code

Решение:

```bash
npm run frontend:start:clean
```

## Mobile connection issues

Проверьте:

- телефон не на mobile data
- телефон и компьютер в одной Wi-Fi сети
- VPN отключен
- `EXPO_PUBLIC_API_URL` содержит IP компьютера
- backend health check открывается с другого устройства в сети

Можно проверить с телефона в browser:

```text
http://YOUR_COMPUTER_IP:8080/health
```

Если не открывается, проблема не в Expo, а в сети/firewall/backend.

## API not reachable

Проверьте Docker logs:

```bash
npm run backend:logs
```

Проверьте containers:

```bash
docker ps
```

Перезапустите:

```bash
npm run backend:stop
npm run backend:docker
```

## Prisma issues

Если backend пишет, что таблицы не существуют:

```bash
docker compose -f backend/docker-compose.yml exec splitter-backend npx prisma migrate deploy
```

Если база данных совсем сломана в учебной среде и данные не важны:

```bash
docker compose -f backend/docker-compose.yml down -v
npm run backend:docker
```

Внимание: `down -v` удаляет все данные PostgreSQL.

## Port already in use

Если порт `8080` занят:

```bash
set BACKEND_PORT=8081
npm run backend:docker
```

На macOS/Linux:

```bash
BACKEND_PORT=8081 npm run backend:docker
```

Тогда во frontend `.env` тоже нужен новый порт:

```text
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:8081
```

## Web mode unstable

Web mode не является главным учебным сценарием. Сначала проверяйте Expo Go mobile flow.

Если web падает:

```bash
npm run frontend:start:clean
npm run frontend:web
```

Если ошибка связана с React Native web/Tamagui/import.meta, используйте mobile flow и зафиксируйте проблему отдельно.
