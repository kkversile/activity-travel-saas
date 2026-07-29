import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AccessTokenGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { RolesGuard } from "./roles.guard";
import { TenantAccessGuard } from "./tenant.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard, TenantAccessGuard, RolesGuard],
  exports: [AuthService, AccessTokenGuard, TenantAccessGuard, RolesGuard]
})
export class AuthModule {}
