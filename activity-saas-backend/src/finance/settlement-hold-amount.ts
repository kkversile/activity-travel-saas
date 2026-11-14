import { Prisma, SettlementHoldScope } from "@prisma/client";
const decimal = (value: any) => new Prisma.Decimal(String(value === null || value === undefined || value === "" ? 0 : value));

export function settlementHeldAmount(batch: any, holds: any[]) {
    return (batch.lines || []).reduce((total: Prisma.Decimal, line: any) => {
      const payable = decimal(line.netVendorPayable ?? decimal(line.vendorPayableBase).plus(line.adjustmentAmount));
      if (!payable.gt(0)) return total;
      const vendorHoldsLine = holds.some((hold) =>
        hold.vendorTenantId === batch.vendorTenantId && (
          hold.scope === SettlementHoldScope.VENDOR ||
          (hold.scope === SettlementHoldScope.BOOKING && hold.bookingId && hold.bookingId === line.bookingId)
        ),
      );
      if (vendorHoldsLine) return total.plus(payable);

      const heldEventIds = new Set(holds
        .filter((hold) => hold.vendorTenantId === batch.vendorTenantId && hold.scope === SettlementHoldScope.FINANCIAL_EVENT)
        .map((hold) => hold.financialEventId));
      const heldEvents = new Set<string>();
      const eventHold = (line.allocations || []).reduce((sum: Prisma.Decimal, allocation: any) => {
        if (!heldEventIds.has(allocation.financialEventId) || heldEvents.has(allocation.financialEventId)) return sum;
        heldEvents.add(allocation.financialEventId);
        const event = allocation.financialEvent;
        const eventPayable = decimal(event?.vendorAmount ?? event?.amount ?? 0);
        return eventPayable.gt(0) ? sum.plus(eventPayable) : sum;
      }, new Prisma.Decimal(0));
      return total.plus(Prisma.Decimal.min(payable, eventHold));
    }, new Prisma.Decimal(0));
  }
