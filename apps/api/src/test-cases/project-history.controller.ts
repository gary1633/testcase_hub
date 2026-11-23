import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { VersionAction, VersionState } from '@tcms/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { TestCasesService } from './test-cases.service';

@ApiTags('Project History')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/history')
export class ProjectHistoryController {
  constructor(private readonly testCasesService: TestCasesService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('action') action?: VersionAction,
    @Query('versionState') versionState?: VersionState,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.testCasesService.listProjectHistory(projectId, user, {
      search,
      action,
      versionState,
      page: page ? Number.parseInt(page, 10) : 1,
      pageSize: pageSize ? Number.parseInt(pageSize, 10) : 30,
    });
  }

  @Get('by-code/:caseCode')
  async listByCode(
    @Param('projectId') projectId: string,
    @Param('caseCode') caseCode: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.listVersionsByCaseCode(projectId, caseCode, user);
  }
}
