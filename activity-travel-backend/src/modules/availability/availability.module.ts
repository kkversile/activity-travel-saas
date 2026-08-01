import { Module } from "@nestjs/common";
import { SchedulesModule } from "../schedules/schedules.module";
import { AvailabilityController } from "./availability.controller";

@Module({ imports: [SchedulesModule], controllers: [AvailabilityController] })
export class AvailabilityModule {}
