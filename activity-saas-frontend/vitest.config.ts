import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Login shortcut tests use synthetic fixtures, never an operator's private .env.
// This configuration is loaded only by Vitest, not the production Vite build.
const demoFixtures = Object.fromEntries(['VENDOR', 'SUPER_ADMIN', 'ADMIN', 'AGENT'].flatMap((role) => [
  [`VITE_DEMO_${role}_EMAIL`, `${role.toLowerCase()}@fixtures.invalid`],
  [`VITE_DEMO_${role}_PASSWORD`, 'FixtureOnly@123'],
]));

export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', globals: true, env: demoFixtures } });
