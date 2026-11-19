import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from '../app.controller';
import { HealthService } from './health.service';

describe('Public health HTTP contract', () => {
  let app: INestApplication;
  const readiness = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AppController], providers: [{ provide: HealthService, useValue: { readiness } }] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
  });
  beforeEach(() => readiness.mockReset());
  afterAll(() => app.close());
  it('preserves the root health response and adds an explicit readiness alias', async () => {
    readiness.mockResolvedValue({ status: 'ok', service: 'voya-api', timestamp: new Date().toISOString(), checks: { database: 'up', storage: 'up' } });
    for (const path of ['/api/health', '/api/health/ready']) {
      const response = await request(app.getHttpServer()).get(path).expect(200);
      expect(response.body).toMatchObject({ status: 'ok', service: 'voya-api', checks: { database: 'up', storage: 'up' } });
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
  it('returns HTTP 503 when a dependency is unavailable', async () => {
    readiness.mockResolvedValue({ status: 'error', service: 'voya-api', checks: { database: 'down', storage: 'up' } });
    await request(app.getHttpServer()).get('/api/health').expect(503).expect('Cache-Control', 'no-store').expect(({ body }) => expect(body.checks.database).toBe('down'));
  });
  it('keeps liveness independent from database/storage outages', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200).expect(({ body }) => expect(body.status).toBe('ok'));
    expect(readiness).not.toHaveBeenCalled();
  });
});
