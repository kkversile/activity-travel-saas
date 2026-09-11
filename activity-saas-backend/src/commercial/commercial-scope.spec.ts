import { CommercialService } from './commercial.service';

const service = () => new CommercialService({} as any, {} as any, {} as any, {} as any);
describe('commercial scope integrity', () => {
  it('rejects a vendor scope carrying a product id', async () => await expect((service() as any).validateScope({ scopeType: 'VENDOR', vendorTenantId: 'v', productId: 'p' })).rejects.toThrow('Exactly one VENDOR scope id'));
  it('rejects GLOBAL with any target', async () => await expect((service() as any).validateScope({ scopeType: 'GLOBAL', agentTenantId: 'a' })).rejects.toThrow('GLOBAL rules cannot contain scope ids'));
  it('requires exactly one target for each non-global scope', async () => await expect((service() as any).validateScope({ scopeType: 'PRODUCT' })).rejects.toThrow('Exactly one PRODUCT scope id'));
  it('rejects a non-existent active agent group', async () => { const s = service(); (s as any).prisma.agentGroup = { findFirst: jest.fn().mockResolvedValue(null) }; await expect((s as any).validateScope({ scopeType: 'AGENT_GROUP', agentGroupId: 'g' })).rejects.toThrow('Active agent group not found'); });
  it('rejects a vendor tenant used as an agent scope', async () => { const s = service(); (s as any).prisma.tenant = { findUnique: jest.fn().mockResolvedValue({ kind: 'VENDOR' }) }; await expect((s as any).validateScope({ scopeType: 'AGENT', agentTenantId: 't' })).rejects.toThrow('travel-agent tenant'); });
  it('rejects a travel-agent tenant used as a vendor scope', async () => { const s = service(); (s as any).prisma.tenant = { findUnique: jest.fn().mockResolvedValue({ kind: 'TRAVEL_AGENT' }) }; await expect((s as any).validateScope({ scopeType: 'VENDOR', vendorTenantId: 't' })).rejects.toThrow('vendor tenant'); });
});
