import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

type RequestContext = { correlationId: string; outletSelection?: unknown };

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(correlationId: string, callback: () => T, outletSelection?: unknown): T {
    return this.storage.run({ correlationId, outletSelection }, callback);
  }

  get outletSelection(): unknown { return this.storage.getStore()?.outletSelection; }

  get correlationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }
}
