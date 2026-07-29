import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext
} from "@nestjs/common";
import type { Request } from "express";

export interface TenantContextValue {
  tenantId: string;
  userId?: string;
  role?: string;
}

export const TenantContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContextValue => {
    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = (request as Request & { tenantId?: string }).tenantId;

    if (!tenantId) {
        throw new BadRequestException("Authenticated tenant context is required");
    }

    return {
      tenantId,
      userId: (request as Request & { user?: { id?: string } }).user?.id,
      role: (request as Request & { user?: { tenantRole?: string } }).user?.tenantRole
    };
  }
);
