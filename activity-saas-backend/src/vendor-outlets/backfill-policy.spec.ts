import { assertLoopbackDatabaseUrl } from '../../scripts/local-database-policy';

describe('multi-outlet backfill database safety', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('accepts loopback database host %s', (host) => {
    expect(() => assertLoopbackDatabaseUrl(`postgresql://user:password@${host}:5432/voya`)).not.toThrow();
  });

  it('rejects remote hosts before Prisma connects', () => {
    expect(() => assertLoopbackDatabaseUrl('postgresql://user:password@db.example.com:5432/voya')).toThrow(/restricted to loopback/);
  });

  it('rejects missing and malformed database URLs', () => {
    expect(() => assertLoopbackDatabaseUrl(undefined)).toThrow(/not configured/);
    expect(() => assertLoopbackDatabaseUrl('not a url')).toThrow(/valid PostgreSQL URL/);
  });
});
