import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { Observable, tap } from "rxjs";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { requestId?: string }>();
    const started = Date.now();
    return next.handle().pipe(tap(() => this.logger.log(`${request.method} ${request.originalUrl} ${Date.now() - started}ms requestId=${request.requestId ?? "unknown"}`)));
  }
}
