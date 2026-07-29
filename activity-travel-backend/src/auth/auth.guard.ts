import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";
import { verifyAccessToken } from "./crypto";
import type { RequestContextUser } from "./auth.types";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestContextUser }>();
    const header = request.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const payload = token ? verifyAccessToken(token, this.config.getOrThrow<string>("JWT_SECRET")) : null;
    if (!payload || typeof payload.sub !== "string") throw new UnauthorizedException("Valid access token required");
    request.user = {
      id: payload.sub,
      email: String(payload.email ?? ""),
      displayName: String(payload.displayName ?? ""),
      role: payload.role as RequestContextUser["role"]
    };
    return true;
  }
}
