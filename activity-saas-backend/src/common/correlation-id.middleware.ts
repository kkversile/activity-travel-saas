import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContextService } from './request-context.service';

export type CorrelatedRequest = Request & { correlationId: string };

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: CorrelatedRequest, response: Response, next: NextFunction) {
    const correlationId = request.header('x-correlation-id')?.slice(0, 128) || randomUUID();
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);
    this.context.run(correlationId, next);
  }
}
