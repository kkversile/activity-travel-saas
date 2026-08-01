import { Catch, ArgumentsHost, HttpException, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { REQUEST_ID_HEADER } from "../middleware/request-id.middleware";

@Catch()
export class HttpExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? response.getHeader(REQUEST_ID_HEADER) ?? "unknown";
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : "Internal server error";
    const message = typeof exceptionResponse === "string" ? exceptionResponse : (exceptionResponse as { message?: unknown }).message ?? exceptionResponse;
    if (status >= 500) this.logger.error(`${request.method} ${request.url} ${status} requestId=${requestId}`, exception instanceof Error ? exception.stack : undefined);
    else this.logger.warn(`${request.method} ${request.url} ${status} requestId=${requestId}`);
    response.status(status).json({ statusCode: status, message, requestId, path: request.url, timestamp: new Date().toISOString() });
  }
}
