export function assertLoopbackDatabaseUrl(raw: string | undefined) {
  if (!raw) throw new Error('DATABASE_URL is not configured');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
  // The WHATWG URL implementation preserves brackets around IPv6 literals in
  // hostname, depending on Node version. Normalize before allowlist matching.
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('Multi-outlet backfill is restricted to loopback databases; refusing to connect to a remote host.');
  }
  return url;
}
