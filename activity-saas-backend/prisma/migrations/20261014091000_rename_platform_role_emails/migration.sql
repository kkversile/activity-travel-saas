-- Align demo login emails with the renamed platform roles.
UPDATE "User" SET "email" = 'superadmin@voya.demo' WHERE "email" = 'admin@voya.demo' AND "role" = 'SUPER_ADMIN';
UPDATE "User" SET "email" = 'admin@voya.demo' WHERE "email" = 'subadmin@voya.demo' AND "role" = 'ADMIN';
