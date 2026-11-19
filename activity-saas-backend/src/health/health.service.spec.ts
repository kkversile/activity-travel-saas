import { HealthService } from './health.service';

describe('HealthService readiness', () => {
  let prisma: any, storage: any, tx: any, service: HealthService;
  beforeEach(() => {
    tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(0), $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    prisma = { $transaction: jest.fn((action) => action(tx)) };
    storage = { checkReadiness: jest.fn().mockResolvedValue(undefined) };
    service = new HealthService(prisma, storage);
  });
  afterEach(() => jest.useRealTimers());
  it('checks the real database pool and storage with bounded database statements', async () => {
    expect(await service.readiness()).toMatchObject({ status: 'ok', checks: { database: 'up', storage: 'up' } });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 500, timeout: 1500 });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL statement_timeout = 1000');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(storage.checkReadiness).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it.each(['database', 'storage'] as const)('reports %s failure without leaking provider details', async (dependency) => {
    if (dependency === 'database') tx.$queryRaw.mockRejectedValue(new Error('postgresql://user:private@db/internal'));
    else storage.checkReadiness.mockRejectedValue(new Error('/private/uploads/secret-key'));
    const report = await service.readiness();
    expect(report.status).toBe('error'); expect(report.checks[dependency]).toBe('down');
    expect(JSON.stringify(report)).not.toMatch(/private|postgresql|secret-key/);
  });
  it('coalesces concurrent probes and caches successful results', async () => {
    const reports = await Promise.all(Array.from({ length: 30 }, () => service.readiness()));
    expect(reports.every((report) => report.status === 'ok')).toBe(true);
    await service.readiness(); expect(prisma.$transaction).toHaveBeenCalledTimes(1); expect(storage.checkReadiness).toHaveBeenCalledTimes(1);
  });
  it('rechecks a recovered dependency after the short failure cache expires', async () => {
    jest.useFakeTimers(); storage.checkReadiness.mockRejectedValueOnce(new Error('offline'));
    expect((await service.readiness()).status).toBe('error');
    await jest.advanceTimersByTimeAsync(2001);
    expect((await service.readiness()).status).toBe('ok');
  });
  it('bounds hung probes and does not launch duplicate outstanding operations', async () => {
    jest.useFakeTimers(); prisma.$transaction.mockImplementation(() => new Promise(() => undefined));
    const pending = service.readiness(); await jest.advanceTimersByTimeAsync(2501);
    expect(await pending).toMatchObject({ status: 'error', checks: { database: 'down', storage: 'up' } });
    await jest.advanceTimersByTimeAsync(2001);
    const again = service.readiness(); await jest.advanceTimersByTimeAsync(2501);
    expect((await again).checks.database).toBe('down'); expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
