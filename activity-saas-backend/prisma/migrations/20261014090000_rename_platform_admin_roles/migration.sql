-- Rename platform roles to match the user-facing terminology.
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';
ALTER TYPE "UserRole" RENAME VALUE 'SUB_ADMIN' TO 'ADMIN';
