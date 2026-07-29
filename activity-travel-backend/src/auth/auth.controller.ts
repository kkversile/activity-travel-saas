import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { LoginDto, RefreshDto } from "./dto";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto); }

  @Post("logout")
  logout(@Body() dto: RefreshDto) { return this.auth.logout(dto); }

  @UseGuards(AccessTokenGuard)
  @Get("me")
  me(@CurrentUser() user: { id: string }) { return this.auth.me(user.id); }
}
