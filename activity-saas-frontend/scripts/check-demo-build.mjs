import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoBuildEnvironment } from './build-demo.mjs';

const fixture = ['VITE_API_BASE_URL=/voya/api', ...['VENDOR', 'SUPER_ADMIN', 'ADMIN', 'AGENT'].flatMap((role) => [
  `VITE_DEMO_${role}_EMAIL=${role.toLowerCase()}@fixtures.invalid`,
  `VITE_DEMO_${role}_PASSWORD="FixtureOnly#123"`,
])].join('\n');

test('loads all role shortcuts explicitly and parses quoted passwords', () => {
  const env = demoBuildEnvironment(`${fixture}\nJWT_SECRET=must-not-load`, { PATH: 'retained', VITE_DEMO_VENDOR_EMAIL: 'stale@fixtures.invalid' });
  assert.equal(env.VITE_DEMO_VENDOR_EMAIL, 'vendor@fixtures.invalid');
  assert.equal(env.VITE_DEMO_AGENT_PASSWORD, 'FixtureOnly#123');
  assert.equal(env.PATH, 'retained');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.JWT_SECRET, undefined);
});

test('fails before building when deployment credentials were omitted', () => {
  assert.throws(() => demoBuildEnvironment('VITE_API_BASE_URL=/voya/api', {}), /VITE_DEMO_VENDOR_EMAIL/);
  assert.throws(() => demoBuildEnvironment(fixture.replace('VITE_DEMO_AGENT_PASSWORD="FixtureOnly#123"', 'VITE_DEMO_AGENT_PASSWORD=  '), { VITE_DEMO_AGENT_PASSWORD: 'inherited' }), /VITE_DEMO_AGENT_PASSWORD/);
});
