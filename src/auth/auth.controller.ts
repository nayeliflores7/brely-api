import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Public, CurrentUser } from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto.js';
import { PasswordResetService } from './password-reset.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // Misma respuesta y mismo tiempo exista o no el correo: no se espera el envío
  @Public()
  @Post('forgot-password')
  @HttpCode(204)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    void this.passwordReset.request(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.reset(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @HttpCode(204)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}