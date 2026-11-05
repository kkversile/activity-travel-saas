import { AuditService } from './audit.service';

describe('AuditService public event identifiers', () => {
  it('creates an EVT identifier atomically with each audit event', async () => {
    const event = { id: '7f3c0000-1111-2222-3333-abcdefabcdef' };
    const client: any = {
      auditLog: { create: jest.fn().mockResolvedValue(event) },
      publicIdentifier: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new AuditService({ correlationId: 'corr-1' } as any);

    await expect(service.write(client, { action: 'TEST_ACTION', entityType: 'Product' })).resolves.toBe(event);
    expect(client.publicIdentifier.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { entityType_entityId: { entityType: 'AUDIT_EVENT', entityId: event.id } },
      create: expect.objectContaining({ entityType: 'AUDIT_EVENT', entityId: event.id, publicCode: `EVT-${event.id.toUpperCase()}` }),
    }));
  });
});
