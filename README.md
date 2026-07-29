# Activity Travel SaaS — Separate Frontend and Backend

This starter contains two independent projects:

```text
activity-travel-saas-separated/
├── activity-travel-frontend/
│   └── src/
└── activity-travel-backend/
    └── src/
```

## Technology

### Frontend

- Next.js 15
- React 19
- TypeScript
- App Router
- Separate `src` directory

### Backend

- NestJS 11
- TypeScript
- PostgreSQL
- Prisma
- Swagger
- Separate `src` directory

## Local requirements

- Node.js 22 LTS or newer
- npm
- PostgreSQL installed directly on Windows
- No Docker required

## Backend setup

```bash
cd activity-travel-backend
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run start:dev
```

Backend URLs:

- API: http://localhost:4006/api/v1
- Swagger: http://localhost:4006/docs
- Health: http://localhost:4006/api/v1/health

## Frontend setup

Open another Git Bash window:

```bash
cd activity-travel-frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend:

- http://localhost:3000

## PostgreSQL

Create the database first:

```sql
CREATE DATABASE activity_saas;
```

A dedicated user is recommended:

```sql
CREATE USER activity_user WITH PASSWORD 'activity_password';
GRANT ALL PRIVILEGES ON DATABASE activity_saas TO activity_user;
\c activity_saas
GRANT ALL ON SCHEMA public TO activity_user;
ALTER SCHEMA public OWNER TO activity_user;
```

Backend `.env`:

```env
DATABASE_URL="postgresql://activity_user:activity_password@localhost:5432/activity_saas?schema=public"
```

## Codex

Run Codex from the parent folder so it can work on both repositories:

```bash
cd /c/wamp64/www/activity-travel-saas-separated
codex
```

Then paste the prompt in `CODEX_MASTER_PROMPT.md`.
