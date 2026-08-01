import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { RolesGuard } from "../src/auth/roles.guard";
import { ROLES_KEY } from "../src/auth/roles.decorator";

function context(user: Record<string, unknown>, required: UserRole[], requestOverrides: Record<string, unknown> = {}) {
  const reflector = new Reflector();
  const handler = () => undefined;
  Reflect.defineMetadata(ROLES_KEY, required, handler);
  return { guard: new RolesGuard(reflector), execution: { getHandler: () => handler, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ user, path: "/api/v1/bookings", method: "GET", ...requestOverrides }) }) } } as const;
}

describe("RolesGuard custom-role enforcement", () => {
  it("allows a custom role only for declared access levels", () => {
    const { guard, execution } = context({ customRoleId: "custom-1", customRolePermissions: { roles: ["ACTIVITY_MANAGER"] } }, [UserRole.ACTIVITY_MANAGER]);
    expect(guard.canActivate(execution as never)).toBe(true);
  });

  it("does not fall back to the user's base enum role when a custom role denies access", () => {
    const { guard, execution } = context({ tenantRole: UserRole.PARTNER_ADMIN, customRoleId: "custom-1", customRolePermissions: { roles: ["VIEWER"] } }, [UserRole.PARTNER_ADMIN]);
    expect(() => guard.canActivate(execution as never)).toThrow(ForbiddenException);
  });

  it("enforces module action permissions for custom roles", () => {
    const { guard, execution } = context({ customRoleId: "custom-2", customRolePermissions: { bookings: ["view"] } }, [UserRole.BOOKING_AGENT]);
    expect(guard.canActivate(execution as never)).toBe(true);
    const denied = context({ customRoleId: "custom-3", customRolePermissions: { bookings: ["view"] } }, [UserRole.BOOKING_AGENT], { method: "POST" });
    expect(() => denied.guard.canActivate(denied.execution as never)).toThrow(ForbiddenException);
  });

  it("does not allow a custom role without read permission to use unannotated list routes", () => {
    const denied = context({ customRoleId: "custom-4", customRolePermissions: { roles: ["ACTIVITY_MANAGER"] } }, [], { method: "GET" });
    expect(() => denied.guard.canActivate(denied.execution as never)).toThrow(ForbiddenException);
  });

  it("does not let a global view permission escalate to create", () => {
    const denied = context({ customRoleId: "custom-5", customRolePermissions: { roles: ["ACTIVITY_MANAGER"], global: ["view"] } }, [UserRole.ACTIVITY_MANAGER], { method: "POST" });
    expect(() => denied.guard.canActivate(denied.execution as never)).toThrow(ForbiddenException);
  });
});
