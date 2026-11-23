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
import { SharedStepsService } from './shared-steps.service';

const SharedStepItemSchema = z.object({
  action: z.string().max(4000).default(''),
  data: z.string().max(4000).optional().default(''),
  expectedResult: z.string().max(4000).default(''),
});

const CreateSharedStepSchema = z.object({
  title: z.string().min(2).max(255),
  steps: z.array(SharedStepItemSchema).min(1).max(100),
});

const UpdateSharedStepSchema = CreateSharedStepSchema.partial();

@ApiTags('Shared Steps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/shared-steps')
export class SharedStepsController {
  constructor(private readonly sharedStepsService: SharedStepsService) {}

  @Get()
  async list(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.sharedStepsService.listSharedSteps(projectId, user);
  }

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = CreateSharedStepSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.sharedStepsService.createSharedStep(projectId, user, parsed.data);
  }

  @Patch(':sharedStepId')
  async update(
    @Param('projectId') projectId: string,
    @Param('sharedStepId') sharedStepId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdateSharedStepSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.sharedStepsService.updateSharedStep(projectId, sharedStepId, user, parsed.data);
  }

  @Delete(':sharedStepId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('sharedStepId') sharedStepId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sharedStepsService.deleteSharedStep(projectId, sharedStepId, user);
  }
}
