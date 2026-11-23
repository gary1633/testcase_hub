import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PROJECT_ROLES, WEBHOOK_PROVIDERS } from '@tcms/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles, type AuthUser } from '../common/auth-user.interface';
import { WebhookService } from '../webhook/webhook.service';
import { ProjectsService } from './projects.service';

const CreateProjectSchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  isArchived: z.boolean().optional(),
});

const UpsertMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(PROJECT_ROLES).optional(),
});

const BulkAddMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
});

const AddTeamToProjectSchema = z.object({
  teamId: z.string().uuid(),
});

const ToggleFavoriteSchema = z
  .object({
    isFavorite: z.boolean().optional(),
  })
  .optional();

const SaveJiraSchema = z.object({
  baseUrl: z.string().max(500),
  email: z.string().max(255),
  apiToken: z.string().max(500).optional(),
  projectKey: z.string().max(32),
  defaultIssueType: z.string().max(64).default('Bug'),
  isEnabled: z.boolean(),
});

const SaveWebhookSchema = z.object({
  provider: z.enum(WEBHOOK_PROVIDERS).default('SLACK'),
  webhookUrl: z.string().max(1000).optional(),
  isEnabled: z.boolean(),
  notifyOnRunCompleted: z.boolean().default(true),
  notifyOnHighDefect: z.boolean().default(true),
});

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly webhookService: WebhookService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.projectsService.listProjects(user, includeArchived === 'true');
  }

  @Post()
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.projectsService.createProject(user, parsed.data);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.getProject(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdateProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.projectsService.updateProject(id, user, parsed.data);
  }

  @Delete(':id')
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.deleteProject(id, user);
  }

  @Post(':id/favorite')
  async toggleFavorite(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body?: unknown,
  ) {
    const parsed = ToggleFavoriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Tham số yêu thích không hợp lệ');
    }
    return this.projectsService.toggleFavorite(id, user, parsed.data?.isFavorite);
  }

  @Get(':id/stats')
  async stats(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.getProjectStats(id, user);
  }

  @Get(':id/stats/rtm')
  async rtm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.getProjectRtm(id, user);
  }

  @Get(':id/members')
  async listMembers(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.listMembers(id, user);
  }

  @Post(':id/members')
  async upsertMember(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpsertMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.projectsService.upsertMember(id, user, parsed.data);
  }

  @Post(':id/members/bulk')
  async addMembersBulk(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = BulkAddMembersSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.projectsService.addMembersBulk(id, user, parsed.data.userIds);
  }

  @Post(':id/members/team')
  async addTeamToProject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = AddTeamToProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.projectsService.addTeamToProject(id, user, parsed.data.teamId);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') memberUserId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.removeMember(id, memberUserId, user);
  }

  @Get(':id/integrations/jira')
  async getJira(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.getJiraConfig(id, user);
  }

  @Put(':id/integrations/jira')
  async saveJira(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = SaveJiraSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.projectsService.saveJiraConfig(id, user, parsed.data);
  }

  @Post(':id/integrations/jira/test')
  async testJira(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.testJiraConnection(id, user);
  }

  @Get(':id/integrations/webhook')
  async getWebhook(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.webhookService.getConfig(id, user);
  }

  @Put(':id/integrations/webhook')
  async saveWebhook(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = SaveWebhookSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.webhookService.saveConfig(id, user, parsed.data);
  }

  @Post(':id/integrations/webhook/test')
  async testWebhook(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.webhookService.sendTestMessage(id, user);
  }
}
