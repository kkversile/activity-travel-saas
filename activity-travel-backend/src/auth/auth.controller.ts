import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AccessTokenGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { LoginDto, RefreshDto } from "./dto";
import { AuthService } from "./auth.service";
import { LoginRateLimitGuard } from "./login-rate-limit.guard";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @UseGuards(LoginRateLimitGuard)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user };
  }

  @Post("refresh")
  async refresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh({ refreshToken: dto.refreshToken ?? this.readRefreshCookie(request) });
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user };
  }

  @Post("logout")
  logout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.clearCookie("activity_refresh", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/v1/auth" });
    return this.auth.logout({ refreshToken: dto.refreshToken ?? this.readRefreshCookie(request) });
  }

  @UseGuards(AccessTokenGuard)
  @Get("me")
  me(@CurrentUser() user: { id: string }) { return this.auth.me(user.id); }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie("activity_refresh", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/v1/auth", maxAge: 30 * 24 * 60 * 60 * 1000 });
  }

  private readRefreshCookie(request: Request): string {
    const cookieHeader = request.header("cookie") ?? "";
    return cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("activity_refresh="))?.slice("activity_refresh=".length) ?? "";
  }
}
