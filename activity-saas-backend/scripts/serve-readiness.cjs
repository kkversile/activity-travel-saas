// Local review server. Never reads the repository .env database URL.
const path = require('node:path');
const bookingFixture = process.argv.includes('--booking-fixture');
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: `postgresql://voya_local@127.0.0.1:55439/${bookingFixture ? 'voya_readiness_clean_20261119' : 'voya_outlet_baseline'}?schema=public`,
  JWT_SECRET: bookingFixture ? 'readiness-isolated-development-secret-20261119' : 'local-outlet-isolation-verification-secret-20261117', SECRET_ENCRYPTION_KEY: (bookingFixture ? '45' : '12').repeat(32),
  STORAGE_DRIVER: 'local', STORAGE_ROOT: path.join(require('node:os').tmpdir(), bookingFixture ? 'voya-readiness-storage-20261119' : 'voya-readiness-multi-outlet-storage-20261119'),
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '', EMAIL_OTP_WEBHOOK_URL: '', AI_ACTIVITY_ENABLED: 'false', DISABLE_SCHEDULED_WORKERS: 'true',
});
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { SchedulerRegistry } = require('@nestjs/schedule');
const { AppModule } = require('../dist/app.module');
const { RequestContextService } = require('../dist/common/request-context.service');
const { CorrelationIdMiddleware } = require('../dist/common/correlation-id.middleware');
(async () => {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  const middleware = new CorrelationIdMiddleware(app.get(RequestContextService));
  app.use((req, res, next) => middleware.use(req, res, next));
  app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  for (const name of app.get(SchedulerRegistry).getCronJobs().keys()) app.get(SchedulerRegistry).deleteCronJob(name);
  await app.listen(4007, '127.0.0.1');
  console.log('Isolated ' + (bookingFixture ? 'booking' : 'multi-outlet') + ' review API on 127.0.0.1:4007; no live connections or external workers.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
