import { Module } from "@nestjs/common"; import { AgentCommissionsController } from "./agent-commissions.controller"; import { AgentCommissionsService } from "./agent-commissions.service";
@Module({ controllers: [AgentCommissionsController], providers: [AgentCommissionsService] }) export class AgentCommissionsModule {}
