import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

type RequestContext = { correlationId: string };

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(correlationId: string, callback: () => T): T {
    return this.storage.run({ correlationId }, callback);
  }

  get correlationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }
}
