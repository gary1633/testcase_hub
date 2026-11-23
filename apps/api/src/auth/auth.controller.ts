import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import {
  AuthService,
  getGoogleClientId,
  isGoogleAuthEnabled,
} from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { SlidingWindowRateLimiter, extractClientIp } from '../common/rate-limiter.util';
import { resolveSeedMode } from '../db/seed-data';
import { isSmtpConfigured } from '../mail/mail.service';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const GoogleLoginSchema = z.object({
  credential: z.string().min(20).max(8192),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  newPassword: z
    .string()
    .min(6, 'Mật khẩu mới tối thiểu 6 ký tự')
    .max(128, 'Mật khẩu mới tối đa 128 ký tự'),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  note: z.string().max(300).optional(),
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly loginLimiter = new SlidingWindowRateLimiter();
  private readonly forgotLimiter = new SlidingWindowRateLimiter();

  constructor(private readonly authService: AuthService) {}

  private getClientIp(req: Request): string {
    return extractClientIp(req);
  }

  @Get('public-config')
  getPublicConfig() {
    const googleClientId = getGoogleClientId(process.env);
    return {
      demoMode: resolveSeedMode() === 'demo',
      googleAuthEnabled: isGoogleAuthEnabled(process.env),
      googleClientId,
      smtpEnabled: isSmtpConfigured(process.env),
    };
  }

  @Post('google')
  async loginWithGoogle(@Req() req: Request, @Body() body: unknown) {
    const parsed = GoogleLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Google credential không hợp lệ');
    }
    const key = `google:${this.getClientIp(req)}`;
    this.loginLimiter.check(
      key,
      20,
      60_000,
      'Bạn đã thử đăng nhập Google quá nhiều lần. Vui lòng đợi 1 phút rồi thử lại.',
    );
    return this.authService.loginWithGoogle(parsed.data.credential);
  }

  @Post('login')
  async login(@Req() req: Request, @Body() body: unknown) {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Email và mật khẩu không hợp lệ');
    }
    const key = `${this.getClientIp(req)}:${parsed.data.email.trim().toLowerCase()}`;
    this.loginLimiter.check(
      key,
      15,
      60_000,
      'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi 1 phút rồi thử lại.',
    );
    return this.authService.login(parsed.data.email, parsed.data.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.id);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      const firstErr = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      throw new BadRequestException(firstErr || 'Thông tin mật khẩu không hợp lệ');
    }
    return this.authService.changePassword(
      user.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
  }

  @Post('forgot-password')
  async forgotPassword(@Req() req: Request, @Body() body: unknown) {
    const parsed = ForgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Vui lòng nhập địa chỉ email hợp lệ');
    }
    const key = `${this.getClientIp(req)}:${parsed.data.email.trim().toLowerCase()}`;
    this.forgotLimiter.check(
      key,
      5,
      5 * 60_000,
      'Bạn đã gửi yêu cầu quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.',
    );
    return this.authService.requestPasswordReset(parsed.data.email, parsed.data.note);
  }
}
