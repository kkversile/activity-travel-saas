import { UserRole } from '@prisma/client';
import { AuditService } from './audit.service';
import { RequestContextService } from '../common/request-context.service';

describe('AuditService request correlation', () => {
  it('stores the request correlation ID without storing authorization data', async () => {
    const context = new RequestContextService();
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const service = new AuditService(context);
    await context.run('corr-123', () => service.write({ auditLog: { create } } as any, { actor: { sub: 'u1', email: 'a@x', role: UserRole.ADMIN, tenantId: null }, action: 'TEST', entityType: 'Test', metadata: { safe: true } }));
    expect(create.mock.calls[0][0].data.correlationId).toBe('corr-123');
    expect(JSON.stringify(create.mock.calls[0][0].data)).not.toContain('authorization');
  });
});
