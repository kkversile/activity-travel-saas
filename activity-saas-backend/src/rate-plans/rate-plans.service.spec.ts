import { VariantStatus } from '@prisma/client';
import { RatePlansService } from './rate-plans.service';
import { CreateRatePlanDto } from './rate-plan.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('RatePlansService catalogue boundaries', () => {
  it('rejects new rate plans for archived variants', async () => {
    const prisma: any = { productVariant: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', status: VariantStatus.ARCHIVED, archivedAt: new Date() }) } };
    const service = new RatePlansService(prisma, { write: jest.fn() } as any);
    await expect(service.create({ sub: 'u1', tenantId: 't1', role: 'VENDOR' } as any, 'v1', {} as any)).rejects.toMatchObject({ status: 409 });
  });
  it('does not treat inactive variants as archived', async () => {
    const tx: any = { ratePlan: { create: jest.fn().mockResolvedValue({ id: 'rp1', ratePlanCode: 'RP1', status: 'ACTIVE', travellerRules: [], cancellationRules: [] }) } };
    const prisma: any = { productVariant: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', status: VariantStatus.INACTIVE, archivedAt: null }) }, $transaction: jest.fn((cb: any) => cb(tx)) };
    const service = new RatePlansService(prisma, { write: jest.fn() } as any);
    await expect(service.create({ sub: 'u1', tenantId: 't1', role: 'VENDOR' } as any, 'v1', { ratePlanCode: 'RP1', name: 'Basic', basePrice: 100, validFrom: '2026-01-01T00:00:00.000Z', validTo: '2026-12-31T00:00:00.000Z' } as any)).resolves.toMatchObject({ id: 'rp1' });
    const createData = tx.ratePlan.create.mock.calls[0][0].data;
    expect(createData).toMatchObject({ basePrice: 0, unitType: 'per_person', instantConfirmation: false, commercialVersions: { create: { sourcePayload: { createdWithCommercialCore: true } } } });
    expect(createData.commercialVersions.create).not.toHaveProperty('pricingUnit');
    expect(createData.commercialVersions.create).not.toHaveProperty('supplierBaseAmount');
    expect(createData.commercialVersions.create).not.toHaveProperty('bookingMode');
  });

  it('evaluates readiness only after the RatePlan transaction commits', async () => {
    let committed = false;
    const tx: any = { ratePlan: { create: jest.fn().mockResolvedValue({ id: 'rp1', ratePlanCode: 'RP1', status: 'ACTIVE', travellerRules: [], cancellationRules: [] }) } };
    const commercial = { readiness: jest.fn(() => { expect(committed).toBe(true); return Promise.resolve({ ready: false, reasonCodes: ['NO_ACTIVE_COMMERCIAL_VERSION'] }); }) };
    const prisma: any = { productVariant: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', status: VariantStatus.INACTIVE, archivedAt: null }) }, $transaction: jest.fn(async (cb: any) => { const result = await cb(tx); committed = true; return result; }) };
    const service = new RatePlansService(prisma, { write: jest.fn() } as any, commercial as any);
    await expect(service.create({ sub: 'u1', tenantId: 't1', role: 'VENDOR' } as any, 'v1', { ratePlanCode: 'RP1', name: 'Basic', validFrom: '2026-01-01T00:00:00.000Z', validTo: '2026-12-31T00:00:00.000Z' } as any)).resolves.toMatchObject({ commercialReadiness: { ready: false } });
    expect(commercial.readiness).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1' }), 'rp1');
  });

  it('rejects legacy commercial inputs at the normal RatePlan boundary', async () => {
    const errors = await validate(plainToInstance(CreateRatePlanDto, { ratePlanCode: 'RP1', name: 'Basic', validFrom: '2026-01-01T00:00:00.000Z', validTo: '2026-12-31T00:00:00.000Z', basePrice: 100, unitType: 'per_person', instantConfirmation: true, freehold: true, affiliates: ['legacy'] }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['basePrice', 'unitType', 'instantConfirmation', 'freehold', 'affiliates']));
  });
});
