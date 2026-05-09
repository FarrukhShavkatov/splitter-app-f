# Frontend

Expo React Native app for the Receipt Splitter starter project.

Use the root documentation first:

- `../README.md` - quick start
- `../BEGINNER_SETUP.md` - detailed beginner setup
- `../TROUBLESHOOTING.md` - common Expo/network fixes
- `../ARCHITECTURE.md` - project structure

## Start

From the repository root:

```bash
npm run frontend:dev
```

Clear Expo cache:

```bash
npm run frontend:start:clean
```

Web preview:

```bash
npm run frontend:web
```

Mobile through Expo Go is the main supported student workflow. Web mode is useful for preview, but can be less stable because this is a React Native app.

## API URL

Create `frontend/.env` from `frontend/.env.example`.

For Expo Go on a real phone:

```text
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:8080
```

Find your IP from the repository root:

```bash
npm run ip
```
