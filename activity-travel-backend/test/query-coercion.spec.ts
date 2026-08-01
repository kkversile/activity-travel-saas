import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { ActivityQueryDto } from "../src/activities/dto/activity.dto";
import { ScheduleQueryDto } from "../src/modules/schedules/dto/schedule.dto";
import { VariantQueryDto } from "../src/modules/variants/dto/variant.dto";
import { VoucherQueryDto } from "../src/modules/vouchers/dto/voucher.dto";

describe("boolean query coercion", () => {
  it("preserves false for server-side filters", () => {
    expect(plainToInstance(VoucherQueryDto, { isActive: "false" }).isActive).toBe(false);
    expect(plainToInstance(VariantQueryDto, { active: "false" }).active).toBe(false);
    expect(plainToInstance(ActivityQueryDto, { hasActiveSchedule: "false" }).hasActiveSchedule).toBe(false);
    expect(plainToInstance(ScheduleQueryDto, { bookable: "false" }).bookable).toBe(false);
  });
});
