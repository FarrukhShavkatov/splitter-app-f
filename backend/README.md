# Backend

Express + Prisma + PostgreSQL API for the Receipt Splitter starter project.

Use the root documentation first:

- `../README.md` - quick start
- `../BEGINNER_SETUP.md` - detailed beginner setup
- `../TROUBLESHOOTING.md` - common errors
- `../ARCHITECTURE.md` - project structure

## Docker start

From the repository root:

```bash
npm run backend:docker
```

Backend URL:

```text
http://localhost:8080
```

Health check:

```bash
curl http://localhost:8080/health
```

Swagger:

```text
http://localhost:8080/api-docs
```

## Local npm start

Docker is recommended for students. If you run backend locally:

```bash
copy .env.example .env
npm install
npm run db:migrate
npm run dev
```

Make sure PostgreSQL is running and `DATABASE_URL` in `.env` is correct.

## Useful commands

```bash
npm run dev
npm run build
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:studio
```
