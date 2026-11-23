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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  PRIORITIES,
  type DefectSeverity,
  type DefectStatus,
  type Priority,
} from '@tcms/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { DefectsService } from './defects.service';

const CreateDefectSchema = z.object({
  title: z.string().min(2).max(500),
  description: z.string().max(10000).optional(),
  stepsToReproduce: z.string().max(10000).optional(),
  actualResult: z.string().max(10000).optional(),
  expectedResult: z.string().max(10000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  severity: z.enum(DEFECT_SEVERITIES).optional(),
  runId: z.string().uuid().nullable().optional(),
  runResultId: z.string().uuid().nullable().optional(),
  caseCode: z.string().max(32).nullable().optional(),
  jiraIssueKey: z.string().max(64).nullable().optional(),
  pushToJira: z.boolean().optional(),
});

const UpdateDefectSchema = z.object({
  title: z.string().min(2).max(500).optional(),
  description: z.string().max(10000).optional(),
  stepsToReproduce: z.string().max(10000).optional(),
  actualResult: z.string().max(10000).optional(),
  expectedResult: z.string().max(10000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  severity: z.enum(DEFECT_SEVERITIES).optional(),
  status: z.enum(DEFECT_STATUSES).optional(),
  jiraIssueKey: z.string().max(64).nullable().optional(),
});

@ApiTags('Defects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/defects')
export class DefectsController {
  constructor(private readonly defectsService: DefectsService) {}

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Query('status') status?: DefectStatus,
    @Query('severity') severity?: DefectSeverity,
    @Query('priority') priority?: Priority,
    @Query('runId') runId?: string,
  ) {
    return this.defectsService.listDefects(projectId, user, { status, severity, priority, runId });
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CreateDefectSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.defectsService.createDefect(projectId, user, parsed.data);
  }

  @Patch(':defectId')
  async update(
    @Param('projectId') projectId: string,
    @Param('defectId') defectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdateDefectSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.defectsService.updateDefect(projectId, defectId, user, parsed.data);
  }

  @Post(':defectId/evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadEvidence(
    @Param('projectId') projectId: string,
    @Param('defectId') defectId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn tệp bằng chứng');
    return this.defectsService.uploadEvidence(projectId, defectId, user, file);
  }

  @Delete(':defectId/evidence/:evidenceId')
  async deleteEvidence(
    @Param('projectId') projectId: string,
    @Param('defectId') defectId: string,
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.defectsService.deleteEvidence(projectId, defectId, evidenceId, user);
  }

  @Delete(':defectId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('defectId') defectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.defectsService.deleteDefect(projectId, defectId, user);
  }
}
