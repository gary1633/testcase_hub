import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth-user.interface';
import { TestPlansService } from './test-plans.service';

const CreatePlanSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().max(2000).nullable().optional(),
  caseIds: z.array(z.string().uuid()).min(1),
});

const UpdatePlanSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  caseIds: z.array(z.string().uuid()).min(1).optional(),
});

@ApiTags('Test Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/plans')
export class TestPlansController {
  constructor(private readonly plansService: TestPlansService) {}

  @Get()
  async list(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.plansService.listPlans(projectId, user);
  }

  @Get(':planId')
  async get(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.plansService.getPlan(projectId, planId, user);
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CreatePlanSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.plansService.createPlan(projectId, user, parsed.data);
  }

  @Patch(':planId')
  async update(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdatePlanSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.plansService.updatePlan(projectId, planId, user, parsed.data);
  }

  @Delete(':planId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.plansService.deletePlan(projectId, planId, user);
  }
}
