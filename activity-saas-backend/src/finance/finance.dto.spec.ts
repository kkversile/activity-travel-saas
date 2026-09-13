import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  FinanceConfigurationDto,
  SettlementBatchDto,
  SettlementPreviewDto,
  VendorSettlementPolicyDto,
} from "./finance.dto";
import { PaymentCollectionMode, SettlementCycleMode } from "@prisma/client";

describe("finance DTO contracts", () => {
  it("requires currency on preview", async () => {
    const errors = await validate(
      plainToInstance(SettlementPreviewDto, { vendorTenantId: "v" }),
    );
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });
  it("requires the preview fingerprint on create", async () => {
    const errors = await validate(
      plainToInstance(SettlementBatchDto, {
        vendorTenantId: "v",
        currency: "INR",
      }),
    );
    expect(
      errors.some((e) => e.property === "expectedPreviewFingerprint"),
    ).toBe(true);
  });
  it("accepts supported policy and collection enums but rejects MONTHLY", async () => {
    const supported = await validate(
      plainToInstance(VendorSettlementPolicyDto, {
        cycleMode: SettlementCycleMode.POST_SERVICE,
        eligibilityTrigger: "BOOKING_CONFIRMED",
        settlementDelayDays: 0,
      }),
    );
    expect(supported.some((e) => e.property === "cycleMode")).toBe(false);
    const unsupported = await validate(
      plainToInstance(VendorSettlementPolicyDto, {
        cycleMode: "MONTHLY",
        eligibilityTrigger: "BOOKING_CONFIRMED",
        settlementDelayDays: 0,
      }),
    );
    expect(unsupported.some((e) => e.property === "cycleMode")).toBe(true);
    for (const mode of Object.values(PaymentCollectionMode)) {
      const errors = await validate(
        plainToInstance(FinanceConfigurationDto, {
          paymentCollectionMode: mode,
          baseCurrency: "INR",
          expectedVersion: 1,
        }),
      );
      expect(errors.some((e) => e.property === "paymentCollectionMode")).toBe(
        false,
      );
    }
  });
});
