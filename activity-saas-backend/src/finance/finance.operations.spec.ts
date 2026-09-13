import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  PaymentCollectionMode,
  PayoutRecordType,
  PayoutStatus,
  SettlementHoldScope,
  SettlementHoldStatus,
  UserRole,
} from "@prisma/client";
import { FinanceService } from "./finance.service";
import { FinanceConfigurationDto, SettlementHoldDto } from "./finance.dto";

const admin: any = {
  sub: "admin-1",
  email: "admin@example.com",
  role: UserRole.ADMIN,
  tenantId: null,
};
const txBase = () => ({
  $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  tenant: { findUnique: jest.fn().mockResolvedValue({ id: "vendor-1" }) },
  booking: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn(),
  },
  financialEvent: {
    create: jest
      .fn()
      .mockResolvedValue({ id: "event-1", vendorTenantId: "vendor-1" }),
  },
  financeConfiguration: {
    findUnique: jest
      .fn()
      .mockResolvedValue({
        id: "default",
        baseCurrency: "INR",
        paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED,
        version: 3,
      }),
  },
  vendorSettlementPolicy: {
    findUnique: jest
      .fn()
      .mockResolvedValue({
        id: "policy-1",
        vendorTenantId: "vendor-1",
        version: 4,
        active: false,
        reviewRequired: true,
      }),
    upsert: jest.fn(),
  },
  settlementHold: {
    create: jest
      .fn()
      .mockResolvedValue({
        id: "hold-1",
        vendorTenantId: "vendor-1",
        status: SettlementHoldStatus.ACTIVE,
      }),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
});

function make(tx: any, auditWrite = jest.fn().mockResolvedValue({})) {
  const prisma: any = { $transaction: jest.fn(async (work: any) => work(tx)) };
  return {
    service: new FinanceService(
      prisma,
      { write: auditWrite } as any,
      { enqueue: jest.fn() } as any,
    ),
    prisma,
    auditWrite,
  };
}

describe("Finance transactional operations", () => {
  it("rolls back the adjustment unit when its audit fails", async () => {
    const tx = txBase();
    const auditWrite = jest
      .fn()
      .mockRejectedValue(new Error("audit unavailable"));
    const { service, prisma } = make(tx, auditWrite);
    await expect(
      service.adjustment(admin, {
        vendorTenantId: "vendor-1",
        signedAmount: "10.00",
        reason: "manual credit",
        reference: "REF-1",
        currency: "INR",
      }),
    ).rejects.toThrow("audit unavailable");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.financialEvent.create).toHaveBeenCalledTimes(1);
    expect(auditWrite).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "VENDOR_ADJUSTMENT_CREATED" }),
    );
  });

  it("rolls back hold creation when its audit fails", async () => {
    const tx = txBase();
    const auditWrite = jest
      .fn()
      .mockRejectedValue(new Error("audit unavailable"));
    const { service, prisma } = make(tx, auditWrite);
    await expect(
      service.createHold(admin, {
        scope: SettlementHoldScope.VENDOR,
        vendorTenantId: "vendor-1",
        reason: "manual review",
      } as any),
    ).rejects.toThrow("audit unavailable");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.settlementHold.create).toHaveBeenCalledTimes(1);
    expect(auditWrite).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "SETTLEMENT_HOLD_CREATED" }),
    );
  });

  it("requires a hold reason after trimming whitespace", async () => {
    const errors = await validate(
      plainToInstance(SettlementHoldDto, {
        scope: SettlementHoldScope.VENDOR,
        vendorTenantId: "vendor-1",
        reason: "   ",
      }),
    );
    expect(errors.some((error) => error.property === "reason")).toBe(true);
    await expect(
      make(txBase()).service.createHold(admin, {
        scope: SettlementHoldScope.VENDOR,
        vendorTenantId: "vendor-1",
        reason: "   ",
      } as any),
    ).rejects.toThrow("SETTLEMENT_HOLD_REASON_REQUIRED");
  });

  it("releases a hold with one audit and does not audit a replay", async () => {
    const tx = txBase();
    const auditWrite = jest.fn().mockResolvedValue({});
    const { service } = make(tx, auditWrite);
    tx.settlementHold.findUnique
      .mockResolvedValueOnce({
        id: "hold-1",
        vendorTenantId: "vendor-1",
        status: SettlementHoldStatus.ACTIVE,
      })
      .mockResolvedValueOnce({
        id: "hold-1",
        vendorTenantId: "vendor-1",
        status: SettlementHoldStatus.RELEASED,
      });
    tx.settlementHold.update.mockResolvedValue({
      id: "hold-1",
      status: SettlementHoldStatus.RELEASED,
    });
    await service.releaseHold(admin, "hold-1", "review complete");
    await service.releaseHold(admin, "hold-1", "review complete");
    expect(tx.settlementHold.update).toHaveBeenCalledTimes(1);
    expect(auditWrite).toHaveBeenCalledTimes(1);
  });

  it("rejects stale configuration and policy versions", async () => {
    const configTx = txBase();
    const config = make(configTx);
    await expect(
      config.service.updateConfiguration(admin, {
        paymentCollectionMode: PaymentCollectionMode.VOYA_COLLECTS,
        baseCurrency: "INR",
        expectedVersion: 2,
      }),
    ).rejects.toThrow("FINANCE_CONFIGURATION_VERSION_MISMATCH");
    const policyTx = txBase();
    const policy = make(policyTx);
    await expect(
      policy.service.updatePolicy(admin, "vendor-1", {
        cycleMode: "MANUAL",
        eligibilityTrigger: "BOOKING_CONFIRMED",
        settlementDelayDays: 0,
        expectedVersion: 3,
      } as any),
    ).rejects.toThrow("SETTLEMENT_POLICY_VERSION_MISMATCH");
    expect(configTx.$queryRawUnsafe).toHaveBeenCalled();
    expect(policyTx.$queryRawUnsafe).toHaveBeenCalled();
  });

  it("requires config version and accepts supported evidence inputs", async () => {
    const configErrors = await validate(
      plainToInstance(FinanceConfigurationDto, {
        paymentCollectionMode: PaymentCollectionMode.EXTERNAL,
        baseCurrency: "INR",
      }),
    );
    expect(
      configErrors.some((error) => error.property === "expectedVersion"),
    ).toBe(true);
    expect(PayoutRecordType.CANONICAL).toBeDefined();
    expect(PayoutStatus.READY_TO_RELEASE).toBeDefined();
  });

  it("requires operator evidence and never creates a fake reference", async () => {
    const service = make(txBase()).service;
    await expect(
      service.recordRelease(admin, "payout-1", {
        externalReference: "   ",
      } as any),
    ).rejects.toThrow("PAYOUT_EXTERNAL_REFERENCE_REQUIRED");
    await expect(
      service.recordFailure(admin, "payout-1", { failureReason: "   " } as any),
    ).rejects.toThrow("PAYOUT_FAILURE_REASON_REQUIRED");
    await expect(
      service.reconcile(admin, "payout-1", {
        confirmedAmount: "10.00",
        reconciliationReference: "   ",
      } as any),
    ).rejects.toThrow("PAYOUT_RECONCILIATION_REFERENCE_REQUIRED");
  });
});
