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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { SuitesService } from './suites.service';

const CreateSuiteSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const UpdateSuiteSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
  orderedSiblingIds: z.array(z.string().uuid()).optional(),
});

const ReorderSuitesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

const CopySuiteToProjectSchema = z.object({
  targetProjectId: z.string().uuid(),
  targetParentSuiteId: z.string().uuid().nullable().optional(),
  includeSubSuites: z.boolean().optional().default(true),
  includeCases: z.boolean().optional().default(true),
});

@ApiTags('Suites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/suites')
export class SuitesController {
  constructor(private readonly suitesService: SuitesService) {}

  @Get()
  async list(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.suitesService.listSuites(projectId, user);
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CreateSuiteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.suitesService.createSuite(projectId, user, parsed.data);
  }

  @Post('reorder')
  async reorder(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = ReorderSuitesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.suitesService.reorderSuites(projectId, user, parsed.data.orderedIds);
  }

  @Patch(':suiteId')
  async update(
    @Param('projectId') projectId: string,
    @Param('suiteId') suiteId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdateSuiteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.suitesService.updateSuite(projectId, suiteId, user, parsed.data);
  }

  @Delete(':suiteId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('suiteId') suiteId: string,
    @Query('deleteCases') deleteCases: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suitesService.deleteSuite(
      projectId,
      suiteId,
      user,
      deleteCases === 'true',
    );
  }

  @Post(':suiteId/restore')
  async restore(
    @Param('projectId') projectId: string,
    @Param('suiteId') suiteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suitesService.restoreSuite(projectId, suiteId, user);
  }

  @Delete(':suiteId/permanent')
  async permanentDelete(
    @Param('projectId') projectId: string,
    @Param('suiteId') suiteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suitesService.permanentlyDeleteSuite(projectId, suiteId, user);
  }

  @Post(':suiteId/copy-to-project')
  async copyToProject(
    @Param('projectId') projectId: string,
    @Param('suiteId') suiteId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CopySuiteToProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.suitesService.copySuiteToProject(projectId, suiteId, user, parsed.data);
  }
}
