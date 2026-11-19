import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

type Check = 'up' | 'down';
type HealthReport = { status: 'ok' | 'error'; service: string; timestamp: string; checks: { database: Check; storage: Check } };

@Injectable()
export class HealthService {
  private cached?: { expires: number; report: HealthReport };
  private running?: Promise<HealthReport>;
  private attempts = new Map<string, Promise<void>>();
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  readiness(): Promise<HealthReport> {
    if (this.cached && this.cached.expires > Date.now()) return Promise.resolve(this.cached.report);
    if (this.running) return this.running;
    this.running = this.inspect().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async inspect(): Promise<HealthReport> {
    const [database, storage] = await Promise.all([
      this.check('database', () => this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 1000');
        await tx.$queryRaw`(SELECT 1 FROM "User" LIMIT 1) UNION ALL (SELECT 1 FROM "VendorOutlet" LIMIT 1)`;
      }, { maxWait: 500, timeout: 1500 })),
      this.check('storage', (signal) => this.storage.checkReadiness(signal)),
    ]);
    const status = database === 'up' && storage === 'up' ? 'ok' : 'error';
    const report: HealthReport = { status, service: 'voya-api', timestamp: new Date().toISOString(), checks: { database, storage } };
    this.cached = { expires: Date.now() + (status === 'ok' ? 10000 : 2000), report };
    return report;
  }

  private async check(name: string, action: (signal: AbortSignal) => Promise<void>): Promise<Check> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A dependency that ignores cancellation still gets only one outstanding
    // attempt. Concurrent public probes cannot fill the database pool/disk.
    let attempt = this.attempts.get(name);
    if (!attempt) {
      attempt = Promise.resolve().then(() => action(controller.signal));
      this.attempts.set(name, attempt);
      const current = attempt;
      void attempt.finally(() => { if (this.attempts.get(name) === current) this.attempts.delete(name); }).catch(() => undefined);
    }
    try {
      await Promise.race([attempt, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Readiness timeout')); }, 2500);
      })]);
      return 'up';
    } catch {
      // Never expose connection strings, keys, filesystem paths or provider errors.
      return 'down';
    } finally { if (timer) clearTimeout(timer); }
  }
}
