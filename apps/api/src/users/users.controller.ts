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
import { USER_ROLES } from '@tcms/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles, type AuthUser } from '../common/auth-user.interface';
import { UsersService } from './users.service';

const CreateUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(255),
  password: z.string().min(6).max(128),
  role: z.enum(USER_ROLES),
  mustChangePassword: z.boolean().optional(),
  teamIds: z.array(z.string().uuid()).optional(),
});

const UpdateUserSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(128).optional(),
  mustChangePassword: z.boolean().optional(),
});

const ResetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, 'Mật khẩu mới tối thiểu 6 ký tự')
    .max(128, 'Mật khẩu mới tối đa 128 ký tự'),
  mustChangePassword: z.boolean().optional(),
});

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    return this.usersService.listUsers();
  }

  @Get('password-reset-requests')
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async listPasswordResetRequests(@CurrentUser() actor: AuthUser) {
    return this.usersService.listPasswordResetRequests(actor.role);
  }

  @Patch('password-reset-requests/:requestId/dismiss')
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async dismissPasswordResetRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.dismissPasswordResetRequest(requestId, actor.id, actor.role);
  }

  @Post()
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.usersService.createUser(parsed.data, actor);
  }

  @Post(':id/reset-password')
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async resetPassword(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = ResetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      const firstErr = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      throw new BadRequestException(firstErr || 'Mật khẩu mới không hợp lệ');
    }
    return this.usersService.resetUserPassword(
      id,
      actor.id,
      parsed.data.newPassword,
      parsed.data.mustChangePassword ?? true,
      actor.role,
    );
  }

  @Patch(':id')
  @Roles('ADMIN', 'QA_MANAGER')
  async update(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.usersService.updateUser(id, parsed.data, actor);
  }
}

const CreateTeamSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).nullable().optional(),
  color: z.string().max(32).optional(),
  memberIds: z.array(z.string().uuid()).max(500).optional(),
});

const UpdateTeamSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  color: z.string().max(32).optional(),
  memberIds: z.array(z.string().uuid()).max(500).optional(),
});

const AddTeamMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
});

@ApiTags('Teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    return this.usersService.listTeams();
  }

  @Post()
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async create(@Body() body: unknown) {
    const parsed = CreateTeamSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.usersService.createTeam(parsed.data);
  }

  @Patch(':id')
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateTeamSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.usersService.updateTeam(id, parsed.data);
  }

  @Post(':id/members')
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async addMembers(@Param('id') id: string, @Body() body: unknown) {
    const parsed = AddTeamMembersSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.usersService.addTeamMembers(id, parsed.data.userIds);
  }

  @Delete(':id/members/:userId')
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.usersService.removeTeamMember(id, userId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'QA_MANAGER', 'QA_LEAD')
  async remove(@Param('id') id: string) {
    return this.usersService.deleteTeam(id);
  }
}
