import { Module } from "@nestjs/common"; import { BlackoutDatesController } from "./blackout-dates.controller"; import { BlackoutDatesService } from "./blackout-dates.service";
@Module({ controllers: [BlackoutDatesController], providers: [BlackoutDatesService] }) export class BlackoutDatesModule {}
