import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly limit = 10;
  private readonly windowMs = 60_000;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip || "unknown";
    const now = Date.now();
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) { this.attempts.set(key, { count: 1, resetAt: now + this.windowMs }); return true; }
    current.count += 1;
    if (current.count > this.limit) throw new HttpException("Too many login attempts; try again later", HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }
}
