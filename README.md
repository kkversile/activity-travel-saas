# VOYA Vendor Platform

NestJS 11, Prisma 6 and PostgreSQL backend in activity-saas-backend; React and Vite frontend in activity-saas-frontend. Use Node.js 22 or newer. PostgreSQL 15 and 16 are covered by release rehearsal.

## Local setup

Install each project with npm ci. Copy each .env.example to .env and configure your local database, JWT and encryption secrets. Never point local setup, seeding or verifiers at the live demo.

From the backend, run npm run prisma:generate, then follow [the database bootstrap runbook](docs/RELEASE_READINESS_OPERATIONS.md) for a new empty database. The inherited historical chain cannot replay from empty in filename order. Do not reset an existing DB or edit applied migrations to work around it.

For a disposable demonstration DB only, set NODE_ENV=development and DEMO_PASSWORD, then run npm run prisma:seed. Production provisioning does not use the demo seed. Start the backend with npm run start:dev (API http://localhost:4007/api, Swagger /api/docs), and frontend with npm run dev (http://localhost:3007). Frontend local configuration uses VITE_API_BASE_URL=http://localhost:4007/api.

## Verification and handover

- Backend: npm test, npm run build, npm run test:operations, npm audit.
- Frontend: npm test, npm run build, node scripts/check-build-budget.mjs, npm audit.
- [Operations, guarded staging commands, storage and recovery](docs/RELEASE_READINESS_OPERATIONS.md).
- [Client UAT and acceptance worksheet](docs/RELEASE_READINESS_UAT.md).
- [19 November implementation and verification report](docs/RELEASE_READINESS_REPORT_2026-11-19.md).

Staging scripts have explicit loopback DB guards and create synthetic data. Deployment and live database changes require separate approval.
