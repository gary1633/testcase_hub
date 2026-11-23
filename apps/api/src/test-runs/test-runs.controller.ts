import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  DEFECT_SEVERITIES,
  EXECUTION_STATUSES,
  PRIORITIES,
  TEST_RUN_STATUSES,
} from '@tcms/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { TestRunsService } from './test-runs.service';

const CreateRunSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().max(2000).nullable().optional(),
  environment: z.string().max(64).optional(),
  appVersion: z.string().max(64).optional(),
  plannedDate: z.string().max(32).nullable().optional(),
  jiraIssueKey: z.string().max(64).nullable().optional(),
  planId: z.string().uuid().nullable().optional(),
  caseIds: z.array(z.string().uuid()).optional(),
  defaultAssigneeId: z.string().uuid().nullable().optional(),
});

const UpdateRunSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  environment: z.string().max(64).optional(),
  appVersion: z.string().max(64).optional(),
  plannedDate: z.string().max(32).nullable().optional(),
  jiraIssueKey: z.string().max(64).nullable().optional(),
  status: z.enum(TEST_RUN_STATUSES).optional(),
});

const UpdateResultSchema = z.object({
  status: z.enum(EXECUTION_STATUSES).optional(),
  actualResult: z.string().max(10000).optional(),
  comment: z.string().max(5000).optional(),
  stepResults: z
    .array(
      z.object({
        stepOrder: z.number().int().min(0),
        status: z.enum(['UNSET', 'PASSED', 'FAILED', 'BLOCKED']),
        actualResult: z.string().max(2000).optional(),
      }),
    )
    .optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  plannedDate: z.string().max(32).nullable().optional(),
  jiraBugKeys: z.array(z.string().max(64)).max(20).optional(),
});

const CreateResultDefectSchema = z.object({
  title: z.string().min(2).max(500),
  description: z.string().max(10000).optional(),
  stepsToReproduce: z.string().max(10000).optional(),
  actualResult: z.string().max(10000).optional(),
  expectedResult: z.string().max(10000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  severity: z.enum(DEFECT_SEVERITIES).optional(),
  jiraIssueKey: z.string().max(64).nullable().optional(),
  pushToJira: z.boolean().optional(),
});

const SyncJiraSchema = z.object({
  jiraIssueKey: z.string().max(64).optional(),
});

const BulkAssignSchema = z.object({
  resultIds: z.array(z.string().uuid()).min(1).max(500),
  assigneeId: z.string().uuid().nullable(),
});

const RerunSchema = z.object({
  statuses: z.array(z.enum(EXECUTION_STATUSES)).min(1).optional(),
  title: z.string().min(2).max(255).optional(),
  environment: z.string().max(64).optional(),
  appVersion: z.string().max(64).optional(),
  jiraIssueKey: z.string().max(64).nullable().optional(),
});

@ApiTags('Test Runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/runs')
export class TestRunsController {
  constructor(private readonly runsService: TestRunsService) {}

  @Get()
  async list(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.runsService.listRuns(projectId, user);
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CreateRunSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.runsService.createRun(projectId, user, parsed.data);
  }

  @Get(':runId')
  async getDetail(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.runsService.getRunDetail(projectId, runId, user);
  }

  @Patch(':runId')
  async update(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdateRunSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.runsService.updateRun(projectId, runId, user, parsed.data);
  }

  @Delete(':runId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.runsService.deleteRun(projectId, runId, user);
  }

  @Get(':runId/export')
  async exportVikkiExcel(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { fileName, buffer } = await this.runsService.exportRunVikkiExcel(
      projectId,
      runId,
      user,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post(':runId/rerun')
  async rerun(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = RerunSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.runsService.rerunFromRun(projectId, runId, user, parsed.data);
  }

  @Post(':runId/bulk-assign')
  async bulkAssign(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = BulkAssignSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.runsService.bulkAssignResults(
      projectId,
      runId,
      user,
      parsed.data.resultIds,
      parsed.data.assigneeId,
    );
  }

  @Post(':runId/sync-jira')
  async syncJira(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = SyncJiraSchema.safeParse(body ?? {});
    const overrideKey = parsed.success ? parsed.data.jiraIssueKey : undefined;
    return this.runsService.syncRunToJira(projectId, runId, user, overrideKey);
  }

  @Get(':runId/history')
  async listRunHistory(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.runsService.listRunHistory(projectId, runId, user);
  }

  @Get(':runId/results/:resultId/history')
  async listResultHistory(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Param('resultId') resultId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.runsService.listResultHistory(projectId, runId, resultId, user);
  }

  @Patch(':runId/results/:resultId')
  async updateResult(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Param('resultId') resultId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdateResultSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.runsService.updateRunResult(projectId, runId, resultId, user, parsed.data);
  }

  @Post(':runId/results/:resultId/evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadEvidence(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Param('resultId') resultId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn tệp bằng chứng');
    return this.runsService.uploadEvidence(projectId, runId, resultId, user, file);
  }

  @Delete(':runId/results/:resultId/evidence/:evidenceId')
  async deleteEvidence(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Param('resultId') resultId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.runsService.deleteEvidence(projectId, runId, resultId, evidenceId, user);
  }

  @Post(':runId/results/:resultId/defect')
  async createDefect(
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Param('resultId') resultId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CreateResultDefectSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.runsService.createDefectFromResult(projectId, runId, resultId, user, parsed.data);
  }
}
