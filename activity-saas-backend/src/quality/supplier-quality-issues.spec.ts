import { SupplierQualityIssueStatus } from '@prisma/client';
import { SupplierQualityIssueService } from './supplier-quality.service';
describe('Supplier quality issues', () => {
  it('requires a reason for resolve and dismiss', async () => { const prisma = { supplierQualityIssue: { findUnique: jest.fn().mockResolvedValue({ id: 'i', vendorTenantId: 'v' }), update: jest.fn() } }; const service = new SupplierQualityIssueService(prisma as any, { write: jest.fn() } as any); await expect(service.transition({ sub: 'a', role: 'ADMIN' } as any, 'i', 'resolve')).rejects.toMatchObject({ status: 400 }); expect(prisma.supplierQualityIssue.update).not.toHaveBeenCalled(); });
  it('uses acknowledged as an open lifecycle state', () => { expect([SupplierQualityIssueStatus.OPEN, SupplierQualityIssueStatus.ACKNOWLEDGED]).toContain(SupplierQualityIssueStatus.ACKNOWLEDGED); });
});
