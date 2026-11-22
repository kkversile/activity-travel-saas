import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const roles = ['VENDOR', 'SUPER_ADMIN', 'ADMIN', 'AGENT'];

// Demo credentials are deliberately public in this build. Never use client accounts.
export function demoBuildEnvironment(contents, inherited = process.env) {
  const configured = parseEnv(contents);
  const required = ['VITE_API_BASE_URL', ...roles.flatMap((role) => [
    `VITE_DEMO_${role}_EMAIL`, `VITE_DEMO_${role}_PASSWORD`,
  ])];
  const missing = required.filter((key) => !configured[key]?.trim());
  if (missing.length) throw new Error(`Demo build configuration is incomplete: ${missing.join(', ')}`);
  return { ...inherited, ...Object.fromEntries(Object.entries(configured).filter(([key]) => key.startsWith('VITE_'))), NODE_ENV: 'production' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const envFile = process.argv[2];
  if (!envFile) throw new Error('Usage: npm run build:demo -- <private-demo-env-file> [output-directory]');
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const env = demoBuildEnvironment(readFileSync(envFile, 'utf8'));
  for (const args of [
    ['node_modules/typescript/bin/tsc', '-b'],
    ['node_modules/vite/bin/vite.js', 'build', '--base=/voya/', ...(process.argv[3] ? ['--outDir', path.resolve(process.argv[3])] : [])],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
