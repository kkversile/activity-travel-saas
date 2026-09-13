import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { PrismaService } from './prisma/prisma.service';
import { createSwaggerDemoUiScript } from './common/swagger-demo-ui';

const swaggerDemoStorageKey = 'voya_swagger_demo_context';

function swaggerDemoReplacements(context: Record<string, string>) {
  return {
    'replace-with-product-id': context.productId,
    'replace-with-published-or-rejected-revision-id': context.revisionId,
    'replace-with-variant-id': context.variantId,
    'replace-with-rate-plan-id': context.ratePlanId,
    'replace-with-commercial-version-id': context.commercialVersionId,
    'replace-with-schedule-template-id': context.scheduleId,
    'replace-with-slot-template-id': context.slotId,
    'replace-with-service-session-id': context.sessionId,
    'replace-with-resource-id': context.resourceId,
    'replace-with-resource-requirement-id': context.requirementId,
    'replace-with-schedule-exception-id': context.exceptionId,
    'replace-with-media-id': context.mediaId,
    'replace-with-booking-id': context.bookingId,
    'replace-with-rule-id': context.ruleId,
    'replace-with-rule-version-id': context.ruleVersionId,
    'replace-with-agent-group-id': context.groupId,
    'replace-with-agent-tenant-id': context.agentTenantId,
    'replace-with-tenant-id': context.tenantId,
    'replace-with-document-version-id': context.documentVersionId,
    'replace-with-file-asset-id': context.fileAssetId,
  };
}

function replaceSwaggerDemoValues(value: any, replacements: Record<string, string | undefined>): any {
  if (typeof value === 'string') return replacements[value] || value;
  if (Array.isArray(value)) return value.map((item) => replaceSwaggerDemoValues(item, replacements));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceSwaggerDemoValues(item, replacements)]));
  return value;
}

async function hydrateSwaggerDocument(document: any, app: any) {
  const context: Record<string, string> = {};
  try {
    const prisma = app.get(PrismaService) as PrismaService;
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'blue-mountain-adventures' }, select: { id: true } });
    if (!tenant) return document;
    context.tenantId = tenant.id;

    const product = await prisma.product.findFirst({
      where: { tenantId: tenant.id, currentRevisionId: { not: null }, variants: { some: { archivedAt: null, ratePlans: { some: { status: 'ACTIVE' } }, schedules: { some: { status: 'ACTIVE' } } } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        currentRevision: { include: { media: { where: { archivedAt: null }, orderBy: { rank: 'asc' }, take: 1 } } },
        variants: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, include: { ratePlans: { where: { status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' } }, schedules: { where: { status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' }, include: { slotTemplates: { where: { archivedAt: null }, orderBy: { rank: 'asc' } } } } } },
      },
    });
    const variant = product?.variants.find((item) => item.schedules.length && item.ratePlans.length) || product?.variants[0];
    const schedule = variant?.schedules[0];
    const ratePlan = variant?.ratePlans[0];
    if (product) context.productId = product.id;
    if (product?.currentRevisionId) context.revisionId = product.currentRevisionId;
    if (variant) context.variantId = variant.id;
    if (schedule) context.scheduleId = schedule.id;
    if (schedule?.slotTemplates[0]) context.slotId = schedule.slotTemplates[0].id;
    if (ratePlan) context.ratePlanId = ratePlan.id;

    const [commercialVersion, session, resource, booking, documentVersion, privateFile, requirement, exception, agentTenant, rule, ruleVersion, group, anyMedia] = await Promise.all([
      ratePlan ? prisma.ratePlanCommercialVersion.findFirst({ where: { ratePlanId: ratePlan.id }, orderBy: { versionNumber: 'desc' }, select: { id: true } }) : null,
      schedule ? prisma.serviceSession.findFirst({ where: { scheduleTemplateId: schedule.id }, orderBy: { serviceDate: 'asc' }, select: { id: true } }) : null,
      prisma.resource.findFirst({ where: { tenantId: tenant.id, active: true, archivedAt: null }, orderBy: { updatedAt: 'desc' }, select: { id: true } }),
      prisma.booking.findFirst({ where: { vendorTenantId: tenant.id }, orderBy: { updatedAt: 'desc' }, select: { id: true } }),
      prisma.vendorDocumentVersion.findFirst({ where: { vendorDocument: { tenantId: tenant.id } }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
      prisma.fileAsset.findFirst({ where: { tenantId: tenant.id, visibility: 'PRIVATE' }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
      prisma.scheduleResourceRequirement.findFirst({ where: { archivedAt: null, scheduleTemplate: { variant: { product: { tenantId: tenant.id } } } }, orderBy: { updatedAt: 'desc' }, select: { id: true } }),
      prisma.scheduleException.findFirst({ where: { scheduleTemplate: { variant: { product: { tenantId: tenant.id } } } }, orderBy: { updatedAt: 'desc' }, select: { id: true } }),
      prisma.tenant.findFirst({ where: { kind: 'TRAVEL_AGENT' }, select: { id: true } }),
      prisma.commercialRule.findFirst({ where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, select: { id: true } }),
      prisma.commercialRuleVersion.findFirst({ where: { rule: { archivedAt: null } }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
      prisma.agentGroup.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' }, select: { id: true } }),
      prisma.productMedia.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, fileAssetId: true } }),
    ]);
    if (commercialVersion) context.commercialVersionId = commercialVersion.id;
    if (session) context.sessionId = session.id;
    if (resource) context.resourceId = resource.id;
    if (booking) context.bookingId = booking.id;
    if (documentVersion) context.documentVersionId = documentVersion.id;
    if (privateFile) context.privateFileAssetId = privateFile.id;
    if (requirement) context.requirementId = requirement.id;
    if (exception) context.exceptionId = exception.id;
    if (agentTenant) context.agentTenantId = agentTenant.id;
    if (rule) context.ruleId = rule.id;
    if (ruleVersion) context.ruleVersionId = ruleVersion.id;
    if (group) context.groupId = group.id;
    const media = product?.currentRevision?.media[0] || anyMedia;
    if (media?.id) context.mediaId = media.id;
    if (media?.fileAssetId) context.fileAssetId = media.fileAssetId;
  } catch {
    // Swagger remains available with its safe placeholders if demo data is unavailable.
  }

  const hydrated = replaceSwaggerDemoValues(document, swaggerDemoReplacements(context));
  for (const [path, item] of Object.entries(hydrated.paths || {})) {
    for (const operation of Object.values(item as Record<string, any>)) {
      if (!operation || typeof operation !== 'object') continue;
      for (const parameter of operation.parameters || []) {
        if (parameter.in !== 'path') continue;
        const name = parameter.name;
        let key = name;
        if (name === 'key') { parameter.example = 'gstin'; continue; }
        if (name === 'versionId') key = 'documentVersionId';
        if (name === 'id' && path.includes('/files/public/')) key = 'fileAssetId';
        else if (name === 'id' && path.includes('/files/')) key = 'privateFileAssetId';
        if (name === 'id') {
          if (path.includes('product-revisions')) key = 'revisionId';
          else if (path.includes('products/')) key = 'productId';
          else if (path.includes('variants/')) key = 'variantId';
          else if (path.includes('rate-plan-commercial-versions')) key = 'commercialVersionId';
          else if (path.includes('rate-plans/')) key = 'ratePlanId';
          else if (path.includes('schedule-slots')) key = 'slotId';
          else if (path.includes('schedule-exceptions')) key = 'exceptionId';
          else if (path.includes('schedule-resource-requirements')) key = 'requirementId';
          else if (path.includes('schedules/')) key = 'scheduleId';
          else if (path.includes('resources/')) key = 'resourceId';
          else if (path.includes('bookings/')) key = 'bookingId';
          else if (path.includes('commercial-rules/')) key = 'ruleId';
          else if (path.includes('commercial-rule-versions/')) key = 'ruleVersionId';
          else if (path.includes('agent-groups/')) key = 'groupId';
        }
        if (context[key]) parameter.example = context[key];
      }
    }
  }
  return hydrated;
}

function swaggerRequestInterceptor(request: any) {
  const token = window.localStorage.getItem('voya_swagger_access_token');
  const storageKey = 'voya_swagger_demo_context';
  let context: Record<string, string> = {};
  try { context = JSON.parse(window.localStorage.getItem(storageKey) || '{}'); } catch { context = {}; }
  const replacements: Record<string, string | undefined> = {
    'replace-with-product-id': context.productId,
    'replace-with-published-or-rejected-revision-id': context.revisionId,
    'replace-with-variant-id': context.variantId,
    'replace-with-rate-plan-id': context.ratePlanId,
    'replace-with-commercial-version-id': context.commercialVersionId,
    'replace-with-schedule-template-id': context.scheduleId,
    'replace-with-slot-template-id': context.slotId,
    'replace-with-service-session-id': context.sessionId,
    'replace-with-resource-id': context.resourceId,
    'replace-with-resource-requirement-id': context.requirementId,
    'replace-with-schedule-exception-id': context.exceptionId,
    'replace-with-media-id': context.mediaId,
    'replace-with-booking-id': context.bookingId,
    'replace-with-rule-id': context.ruleId,
    'replace-with-rule-version-id': context.ruleVersionId,
    'replace-with-agent-group-id': context.groupId,
    'replace-with-agent-tenant-id': context.agentTenantId,
    'replace-with-tenant-id': context.tenantId,
    'replace-with-document-version-id': context.documentVersionId,
    'replace-with-file-asset-id': context.fileAssetId,
  };
  const replace = (value: any): any => {
    if (typeof value === 'string') return replacements[value] || value;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  if (typeof request.url === 'string') {
    request.url = replace(request.url);
    const replacePathSegment = (pattern: RegExp, value: string | undefined) => {
      if (value) request.url = request.url.replace(pattern, `$1${value}`);
    };
    replacePathSegment(/(\/api\/products\/)[^/?]+/, context.productId);
    replacePathSegment(/(\/api\/product-revisions\/)[^/?]+/, context.revisionId);
    replacePathSegment(/(\/api\/variants\/)[^/?]+/, context.variantId);
    replacePathSegment(/(\/api\/rate-plans\/)[^/?]+/, context.ratePlanId);
    replacePathSegment(/(\/api\/rate-plan-commercial-versions\/)[^/?]+/, context.commercialVersionId);
    replacePathSegment(/(\/api\/schedules\/)[^/?]+/, context.scheduleId);
    replacePathSegment(/(\/rate-plans\/)[^/?]+/, context.ratePlanId);
    replacePathSegment(/(\/api\/schedule-slots\/)[^/?]+/, context.slotId);
    replacePathSegment(/(\/api\/schedule-exceptions\/)[^/?]+/, context.exceptionId);
    replacePathSegment(/(\/api\/schedule-resource-requirements\/)[^/?]+/, context.requirementId);
    replacePathSegment(/(\/api\/resources\/)[^/?]+/, context.resourceId);
    replacePathSegment(/(\/api\/sessions\/)[^/?]+/, context.sessionId);
    replacePathSegment(/(\/resources\/)[^/?]+/, context.resourceId);
    replacePathSegment(/(\/api\/bookings\/)[^/?]+/, context.bookingId);
    replacePathSegment(/(\/api\/admin\/commercial-rules\/)[^/?]+/, context.ruleId);
    replacePathSegment(/(\/api\/admin\/commercial-rule-versions\/)[^/?]+/, context.ruleVersionId);
    replacePathSegment(/(\/api\/admin\/agent-groups\/)[^/?]+/, context.groupId);
    replacePathSegment(/(\/api\/admin\/vendors\/)[^/?]+/, context.tenantId);
    replacePathSegment(/(\/versions\/)[^/?]+/, context.documentVersionId);
    replacePathSegment(/(\/api\/files\/public\/)[^/?]+/, context.fileAssetId);
  }
  if (typeof request.body === 'string' && request.headers?.['Content-Type']?.includes('application/json')) {
    try { request.body = JSON.stringify(replace(JSON.parse(request.body))); } catch { /* Keep non-JSON bodies unchanged. */ }
  }
  const isAuthRequest = typeof request.url === 'string' && /\/api\/auth\/(login|register)(?:\?|$)/.test(request.url);
  if (token && !isAuthRequest) {
    request.headers = { ...(request.headers ?? {}), Authorization: request.headers?.Authorization ?? `Bearer ${token}` };
  }
  return request;
}

function swaggerResponseInterceptor(response: any) {
  const storageKey = 'voya_swagger_demo_context';
  let context: Record<string, string> = {};
  try { context = JSON.parse(window.localStorage.getItem(storageKey) || '{}'); } catch { context = {}; }
  const isLoginResponse = typeof response?.url === 'string' && response.url.includes('/api/auth/login');
  if (isLoginResponse && response.status >= 200 && response.status < 300) {
    try {
      const raw = response.data ?? response.body;
      const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const token = payload?.accessToken;
      if (token) window.localStorage.setItem('voya_swagger_access_token', token);
    } catch {
      // Leave the response untouched if Swagger returns a non-JSON body.
    }
  }
  try {
    const raw = response?.data ?? response?.body;
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const url = String(response?.url || '');
    const remember = (key: string, value: any) => { if (typeof value === 'string' && value) context[key] = value; };
    const first = (value: any) => Array.isArray(value) ? value[0] : value;
    if (url.endsWith('/api/products')) { const item = first(payload); remember('productId', item?.id); remember('revisionId', item?.currentRevisionId || item?.revisions?.[0]?.id); }
    if (/\/api\/products\/[^/]+\/revisions$/.test(url)) remember('revisionId', payload?.id);
    if (/\/api\/products\/[^/]+\/variants$/.test(url)) remember('variantId', payload?.id || first(payload)?.id);
    if (/\/api\/variants\/[^/]+\/rate-plans$/.test(url)) remember('ratePlanId', payload?.id || first(payload)?.id);
    if (/\/api\/variants\/[^/]+\/schedules$/.test(url)) remember('scheduleId', payload?.id || first(payload)?.id);
    if (/\/api\/schedules\/[^/]+\/slots$/.test(url)) remember('slotId', payload?.id);
    if (/\/api\/product-revisions\/[^/]+\/media$/.test(url)) remember('mediaId', payload?.id);
    if (/\/api\/rate-plans\/[^/]+\/commercial\/versions$/.test(url)) remember('commercialVersionId', payload?.id);
    if (/\/api\/admin\/commercial-rules$/.test(url)) remember('ruleId', payload?.id);
    if (/\/api\/admin\/commercial-rules\/[^/]+\/versions$/.test(url)) remember('ruleVersionId', payload?.id);
    if (/\/api\/admin\/agent-groups$/.test(url)) remember('groupId', payload?.id);
    if (/\/api\/schedules\/[^/]+\/exceptions$/.test(url)) remember('exceptionId', payload?.id);
    if (/\/api\/schedules\/[^/]+\/resource-requirements$/.test(url)) remember('requirementId', payload?.id);
    if (/\/api\/resources$/.test(url)) remember('resourceId', payload?.id || first(payload)?.id);
    if (/\/api\/bookings$/.test(url)) remember('bookingId', payload?.id || first(payload)?.id);
    if (/\/api\/sessions\/[^/]+\/resources$/.test(url) && payload?.resourceId) remember('resourceId', payload.resourceId);
    if (/\/api\/vendor\/documents\//.test(url)) remember('documentVersionId', payload?.id);
    if (/\/api\/files\//.test(url)) remember('fileAssetId', payload?.fileId || payload?.id);
    window.localStorage.setItem(storageKey, JSON.stringify(context));
  } catch {
    // Leave the response untouched if Swagger returns a non-JSON body.
  }
  return response;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false, bodyParser: false });
  const config: ConfigService = app.get(ConfigService);


  app.setGlobalPrefix('api');
  app.use(helmet());
  const correlation = app.get(CorrelationIdMiddleware);
  app.use(correlation.use.bind(correlation));
  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS', 'http://localhost:3007').split(',').map((v) => v.trim()),
    credentials: false,
  });
  app.use(json({ limit: '2mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const port = Number(config.get('PORT', 4007));
  const swaggerServerUrl = config.get<string>('SWAGGER_SERVER_URL') || `http://localhost:${port}`;
  const swaggerServerDescription = config.get<string>('SWAGGER_SERVER_DESCRIPTION') || 'Configured API';
  const swaggerDemoEnabled = config.get<string>('SWAGGER_DEMO_ACCOUNTS_ENABLED', 'true') !== 'false';
  const swaggerDemoPassword = config.get<string>('SWAGGER_DEMO_PASSWORD') || config.get<string>('DEMO_PASSWORD') || '';
  const swaggerDemoAccounts = swaggerDemoEnabled ? [
    { key: 'vendor', label: 'Vendor', role: 'VENDOR', email: config.get<string>('SWAGGER_DEMO_VENDOR_EMAIL', 'vendor@voya.demo'), password: swaggerDemoPassword },
    { key: 'agent', label: 'Travel Agent', role: 'TRAVEL_AGENT', email: config.get<string>('SWAGGER_DEMO_AGENT_EMAIL', 'agent@voya.demo'), password: swaggerDemoPassword },
    { key: 'admin', label: 'Admin', role: 'ADMIN', email: config.get<string>('SWAGGER_DEMO_ADMIN_EMAIL', 'admin@voya.demo'), password: swaggerDemoPassword },
    ...(config.get<string>('SWAGGER_DEMO_SUB_ADMIN_EMAIL') ? [{ key: 'sub-admin', label: 'Sub-admin', role: 'SUB_ADMIN', email: config.get<string>('SWAGGER_DEMO_SUB_ADMIN_EMAIL', ''), password: swaggerDemoPassword }] : []),
  ] : [];
  const swagger = new DocumentBuilder()
    .setTitle('Voya Vendor API')
    .setDescription('Vendor/supply-side product catalogue, commercial pricing, canonical inventory and booking API. Try it out is enabled, live demo IDs are hydrated from the database, IDs returned by create/list calls are remembered for subsequent requests, and the VOYA demo login panel can prefill or execute authentication for each configured persona.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addServer(swaggerServerUrl, swaggerServerDescription)
    .build();
  const swaggerDocument = await hydrateSwaggerDocument(SwaggerModule.createDocument(app, swagger), app);
  app.getHttpAdapter().get('/api/docs/demo-login.js', (_request: unknown, response: any) => {
    response.type('application/javascript').send(createSwaggerDemoUiScript(swaggerServerUrl, swaggerDemoAccounts));
  });
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    customSiteTitle: 'Voya Vendor API Swagger',
    customJs: '/api/docs/demo-login.js?v=2',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      requestInterceptor: swaggerRequestInterceptor,
      responseInterceptor: swaggerResponseInterceptor,
    },
  });

  await app.listen(port, '0.0.0.0');
}
bootstrap();
