import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { SlidingWindowRateLimiter, extractClientIp } from '../common/rate-limiter.util';
import { CiService } from './ci.service';

const CreateCiTokenSchema = z.object({
  name: z.string().min(2).max(120),
});

@ApiTags('CI/CD Automation')
@Controller()
export class CiController {
  private readonly ingestLimiter = new SlidingWindowRateLimiter();
  private readonly authFailLimiter = new SlidingWindowRateLimiter();

  constructor(private readonly ciService: CiService) {}

  @Get('projects/:projectId/ci-tokens')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async listTokens(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.ciService.listTokens(projectId, user);
  }

  @Post('projects/:projectId/ci-tokens')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async createToken(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CreateCiTokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.ciService.createToken(projectId, user, parsed.data.name);
  }

  @Delete('projects/:projectId/ci-tokens/:tokenId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async revokeToken(
    @Param('projectId') projectId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ciService.revokeToken(projectId, tokenId, user);
  }

  @Post('ci/ingest')
  async ingest(
    @Req() req: Request,
    @Headers('x-project-token') xProjectToken: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Query('title') title?: string,
    @Query('environment') environment?: string,
    @Query('appVersion') appVersion?: string,
    @Query('jiraIssueKey') jiraIssueKey?: string,
    @Query('format') format?: string,
  ) {
    const ip = extractClientIp(req);
    this.ingestLimiter.check(
      `ci:${ip}`,
      60,
      60_000,
      'Quá nhiều yêu cầu CI/CD từ địa chỉ IP này. Vui lòng thử lại sau 1 phút.',
    );

    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : undefined;
    const token = xProjectToken || bearer;
    try {
      return await this.ciService.ingestReport(token, body, {
        title,
        environment,
        appVersion,
        jiraIssueKey,
        format,
      });
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        this.authFailLimiter.check(
          `ci-fail:${ip}`,
          15,
          60_000,
          'Quá nhiều lần xác thực CI Token thất bại. Tạm khóa trong 1 phút.',
        );
      }
      throw err;
    }
  }
}
