# Codex CLI Master Prompt

Act as the principal architect and implementation owner for this travel activity SaaS.

The repository contains two independent applications:

```text
activity-travel-frontend
activity-travel-backend
```

Both applications use a `src` folder.

You must inspect, edit, run, test and verify both projects end to end.

## Machine restrictions

- Do not install or use Docker.
- Do not use WSL.
- Use PostgreSQL installed directly on Windows.
- Run only one heavy command at a time.
- Do not run tests in parallel.
- Use headless browser testing.
- Avoid watch mode except during final verification.
- Stop temporary processes after testing.
- Do not open VS Code or Codex Desktop.
- Do not commit or push unless explicitly requested.

## Safety

- Never expose passwords or secrets.
- Do not run destructive database commands without explicit approval.
- Do not reset or drop the database.
- Preserve unrelated user changes.
- Never trust tenant identity from request bodies.
- Enforce tenant isolation in every backend query.
- Store money as integer minor units with currency codes.
- Store instants in UTC and preserve local activity timezone.
- Use transactions and idempotency for booking mutations.
- Prevent overselling with database-safe capacity updates.

## First tasks

1. Read:
   - README.md
   - activity-travel-frontend/README.md
   - activity-travel-backend/README.md
   - activity-travel-backend/docs/ARCHITECTURE.md
   - both package.json files
   - backend Prisma schema
   - both environment examples

2. Inspect both folder structures.

3. Run `git status` from the parent and from each child if they are repositories.

4. Verify:
   - Node.js
   - npm
   - PostgreSQL service
   - psql availability
   - port 5432
   - frontend port 3000
   - backend port 4006

5. Install backend dependencies.

6. Validate backend environment.

7. Generate Prisma Client.

8. Apply migrations safely.

9. Seed the database.

10. Run backend type checking, lint, tests and build.

11. Install frontend dependencies.

12. Run frontend type checking, lint and build.

13. Start backend and frontend temporarily.

14. Verify:
   - health endpoint
   - Swagger
   - activity listing
   - booking creation
   - idempotency
   - capacity protection
   - tenant isolation
   - frontend loading and API integration

15. Fix all errors encountered.

## Product implementation phases

### Authentication and tenancy

Implement:

- email/password login
- secure password hashing
- JWT access tokens
- refresh-token rotation
- logout
- current-user endpoint
- tenant membership
- RBAC
- platform administrator support
- disabled-user checks
- audit logging

Roles:

- PLATFORM_ADMIN
- PARTNER_ADMIN
- ACTIVITY_MANAGER
- BOOKING_AGENT
- VIEWER

### Activity catalogue

Implement:

- categories
- destinations
- activities
- variants
- images
- inclusions
- exclusions
- meeting points
- pickup options
- duration
- timezone
- age limits
- accessibility
- cancellation rules
- draft/published/archived status
- tenant-unique slugs
- pagination
- filtering
- sorting

### Schedule and inventory

Implement:

- one-time departures
- recurring schedules
- blackout dates
- cut-off times
- capacity
- available capacity
- booking holds
- hold expiry
- confirmed seats
- cancellation release
- oversell prevention

### Pricing

Implement:

- adult, child and infant pricing
- per-person and per-unit pricing
- currencies
- taxes
- commissions
- discounts
- validity dates
- backend-only total calculation

### Booking workflow

Implement:

- HOLD
- CONFIRMED
- CANCELLED
- COMPLETED
- NO_SHOW
- customers
- passengers
- notes
- references
- idempotency
- audit history
- cancellation foundation
- vouchers

### Frontend

Implement:

- login
- protected layout
- dashboard
- activities
- activity form
- schedules
- pricing
- availability
- booking wizard
- booking details
- loading states
- empty states
- validation
- error states
- permission-aware navigation
- responsive UI

## Low-resource command order

1. Backend install
2. Backend Prisma generate
3. Backend migration
4. Backend seed
5. Backend type check
6. Backend targeted tests
7. Backend lint
8. Backend build
9. Frontend install
10. Frontend type check
11. Frontend lint
12. Frontend build
13. Start backend
14. Start frontend
15. Headless browser verification
16. Stop temporary processes

## Final report

Report:

- architecture implemented
- files created
- files modified
- migrations created
- seeded data
- commands run
- type-check results
- lint results
- test results
- build results
- browser workflows verified
- tenant-isolation evidence
- capacity-safety evidence
- remaining risks
- recommended next phase

Do not claim anything passed unless you actually ran and observed it.

Start by inspecting both applications and produce a short execution plan, then continue without waiting unless credentials, administrator access or destructive actions require my approval.
