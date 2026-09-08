# Voya Activity SaaS

## Backend

```bash
cd activity-saas-backend
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

Backend: `http://localhost:4007`  
Swagger: `http://localhost:4007/api/docs`

## Frontend

```bash
cd activity-saas-frontend
npm install
npm run dev
```

Frontend: `http://localhost:3007`

Demo login: `vendor@voya.demo` / `Demo@123`

PostgreSQL: database `activity_saas` on `localhost:5432`.
