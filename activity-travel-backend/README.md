# Activity Travel Backend

NestJS + PostgreSQL + Prisma backend.

## Structure

```text
activity-travel-backend/
├── prisma/
├── src/
│   ├── activities/
│   ├── bookings/
│   ├── common/
│   ├── prisma/
│   ├── app.controller.ts
│   ├── app.module.ts
│   └── main.ts
└── test/
```

## Setup

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run start:dev
```

## URLs

- API: http://localhost:4006/api/v1
- Swagger: http://localhost:4006/docs
- Health: http://localhost:4006/api/v1/health
