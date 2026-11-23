import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  AUTOMATION_STATUSES,
  PRIORITIES,
  SEVERITIES,
  TEST_CASE_STATUSES,
  TEST_CASE_TYPES,
  type AutomationStatus,
  type Priority,
  type Severity,
  type TestCaseStatus,
  type TestCaseType,
} from '@tcms/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { TestCasesService } from './test-cases.service';

const StepSchema = z.object({
  action: z.string().max(4000).default(''),
  data: z.string().max(4000).optional().default(''),
  expectedResult: z.string().max(4000).default(''),
  sharedStepId: z.string().uuid().nullable().optional(),
});

const CommentSchema = z.object({
  content: z.string().min(1).max(3000),
});

const CreateCaseSchema = z.object({
  suiteId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  preconditions: z.string().max(10000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  type: z.enum(TEST_CASE_TYPES).optional(),
  automationStatus: z.enum(AUTOMATION_STATUSES).optional(),
  status: z.enum(TEST_CASE_STATUSES).optional(),
  tags: z.array(z.string().max(64)).max(30).optional(),
  jiraIssueKeys: z.array(z.string().max(64)).max(30).optional(),
  steps: z.array(StepSchema).max(200).optional(),
});

const UpdateCaseSchema = CreateCaseSchema.partial();

const BulkActionSchema = z.object({
  action: z.enum([
    'MOVE',
    'DELETE',
    'UPDATE_PRIORITY',
    'UPDATE_AUTOMATION',
    'UPDATE_STATUS',
    'CLONE',
  ]),
  caseIds: z.array(z.string().uuid()).min(1).max(500),
  suiteId: z.string().uuid().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  automationStatus: z.enum(AUTOMATION_STATUSES).optional(),
  status: z.enum(TEST_CASE_STATUSES).optional(),
});

const CopyCasesToProjectSchema = z.object({
  caseIds: z.array(z.string().uuid()).min(1).max(500),
  targetProjectId: z.string().uuid(),
  targetSuiteId: z.string().uuid().nullable().optional(),
});

@ApiTags('Test Cases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/cases')
export class TestCasesController {
  constructor(private readonly testCasesService: TestCasesService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Query('suiteId') suiteId?: string,
    @Query('includeSubSuites') includeSubSuites?: string,
    @Query('search') search?: string,
    @Query('priority') priority?: Priority,
    @Query('severity') severity?: Severity,
    @Query('type') type?: TestCaseType,
    @Query('automationStatus') automationStatus?: AutomationStatus,
    @Query('status') status?: TestCaseStatus,
    @Query('tag') tag?: string,
    @Query('jiraKey') jiraKey?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: 'seqNumber' | 'title' | 'priority' | 'updatedAt',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.testCasesService.listCases(projectId, user, {
      suiteId,
      includeSubSuites: includeSubSuites !== 'false',
      search,
      priority,
      severity,
      type,
      automationStatus,
      status,
      tag,
      jiraKey,
      page: page ? Number.parseInt(page, 10) : 1,
      pageSize: pageSize ? Number.parseInt(pageSize, 10) : 50,
      sortBy,
      sortDir,
    });
  }

  @Get('template')
  async downloadTemplate(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { fileName, buffer } = await this.testCasesService.downloadTemplateExcel(projectId, user);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Get('export')
  async exportFile(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('suiteId') suiteId?: string,
    @Query('search') search?: string,
    @Query('priority') priority?: Priority,
    @Query('automationStatus') automationStatus?: AutomationStatus,
  ) {
    const filter = { suiteId, search, priority, automationStatus };
    if (format === 'csv') {
      const { fileName, csv } = await this.testCasesService.exportCsv(projectId, user, filter);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csv);
      return;
    }

    const { fileName, buffer } = await this.testCasesService.exportExcel(projectId, user, filter);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async importFile(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('csv') csvText?: string,
  ) {
    if (file) {
      return this.testCasesService.importFile(
        projectId,
        user,
        file.buffer,
        file.originalname || 'import.xlsx',
      );
    }
    if (csvText) {
      return this.testCasesService.importFile(
        projectId,
        user,
        Buffer.from(csvText, 'utf-8'),
        'import.csv',
      );
    }
    throw new BadRequestException('Vui lòng chọn file Excel (.xlsx) hoặc CSV để import');
  }

  @Get('trash')
  async listTrash(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.testCasesService.listTrash(projectId, user);
  }

  @Post('bulk')
  async bulk(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = BulkActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.testCasesService.bulkAction(projectId, user, parsed.data);
  }

  @Post('copy-to-project')
  async copyToProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CopyCasesToProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.testCasesService.copyCasesToProject(projectId, user, parsed.data);
  }

  @Get(':caseId/versions')
  async listVersions(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.listCaseVersions(projectId, caseId, user);
  }

  @Post(':caseId/versions/:versionId/restore')
  async restoreVersion(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.restoreCaseVersion(projectId, caseId, versionId, user);
  }

  @Post(':caseId/restore-trash')
  async restoreFromTrash(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.restoreCaseFromTrash(projectId, caseId, user);
  }

  @Delete(':caseId/permanent')
  async permanentDelete(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.permanentlyDeleteCase(projectId, caseId, user);
  }

  @Get(':caseId/comments')
  async listComments(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.listComments(projectId, caseId, user);
  }

  @Post(':caseId/comments')
  async addComment(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CommentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.testCasesService.addComment(projectId, caseId, user, parsed.data.content);
  }

  @Delete(':caseId/comments/:commentId')
  async deleteComment(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.deleteComment(projectId, caseId, commentId, user);
  }

  @Get(':caseId')
  async getDetail(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.getCaseDetail(projectId, caseId, user);
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CreateCaseSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.testCasesService.createCase(projectId, user, parsed.data);
  }

  @Patch(':caseId')
  async update(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdateCaseSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.testCasesService.updateCase(projectId, caseId, user, parsed.data);
  }

  @Delete(':caseId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.testCasesService.deleteCase(projectId, caseId, user);
  }

  @Post(':caseId/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('projectId') projectId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Chưa chọn tệp đính kèm');
    }
    return this.testCasesService.uploadAttachment(projectId, caseId, user, file);
  }
}
