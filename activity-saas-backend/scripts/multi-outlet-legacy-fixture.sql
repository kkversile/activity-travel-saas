-- Insert into the pre-outlet schema only, in the dedicated disposable server.
DO $$ BEGIN
  IF current_database() NOT IN ('voya_outlet_baseline', 'voya_outlet_deploy') OR current_user <> 'voya_local' OR inet_server_port() NOT IN (55439, 5432) THEN
    RAISE EXCEPTION 'Legacy fixture is restricted to the disposable outlet database';
  END IF;
END $$;
INSERT INTO "Tenant" ("id","slug","name","kind","updatedAt") VALUES ('11111111-1111-4111-a111-111111111111','migration-legacy-local','Legacy Adventures','VENDOR',now());
INSERT INTO "User" ("id","tenantId","email","fullName","passwordHash","role","organizationRole","updatedAt") VALUES ('11111111-1111-4111-a111-111111111112','11111111-1111-4111-a111-111111111111','legacy@migration.local','Legacy Operator','unusable-fixture-password','VENDOR','FINANCE',now());
INSERT INTO "Product" ("id","tenantId","productCode","updatedAt") VALUES ('11111111-1111-4111-a111-111111111113','11111111-1111-4111-a111-111111111111','PRESERVE-ME',now());
INSERT INTO "Booking" ("id","vendorTenantId","productId","bookingCode","channel","serviceDate","pax","amount","currency","status","customerName","updatedAt") VALUES ('11111111-1111-4111-a111-111111111114','11111111-1111-4111-a111-111111111111','11111111-1111-4111-a111-111111111113','LEGACY-PRESERVE','DIRECT',current_date,2,1234.56,'INR','CONFIRMED','Legacy Visitor',now());
INSERT INTO "FinancialEvent" ("id","eventKey","bookingId","vendorTenantId","type","status","currency","amount","vendorAmount","components","occurredAt") VALUES ('11111111-1111-4111-a111-111111111115','legacy-preserve-event','11111111-1111-4111-a111-111111111114','11111111-1111-4111-a111-111111111111','BOOKING_CONFIRMED','POSTED','INR',1234.56,1000.01,'{"immutableEconomics":true}',now());
INSERT INTO "Payout" ("id","tenantId","recordType","amount","currency","status","dueDate") VALUES ('11111111-1111-4111-a111-111111111116','11111111-1111-4111-a111-111111111111','LEGACY',1000.01,'INR','PAID',now());
