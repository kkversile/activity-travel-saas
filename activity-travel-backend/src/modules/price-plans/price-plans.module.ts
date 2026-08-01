import { Module } from "@nestjs/common";
import { PricePlansController } from "./price-plans.controller";
import { PricePlansService } from "./price-plans.service";
@Module({ controllers: [PricePlansController], providers: [PricePlansService] }) export class PricePlansModule {}
