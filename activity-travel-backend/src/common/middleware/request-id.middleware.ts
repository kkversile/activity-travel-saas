import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const requestId = request.header(REQUEST_ID_HEADER) || randomUUID();
  (request as Request & { requestId: string }).requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
