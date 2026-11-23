import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { passwordResetRequests, teamMembers, teams, users } from '../db/schema';
import { MailService } from '../mail/mail.service';
import type { AuthUser } from '../common/auth-user.interface';
import {
  canResetPasswordFor,
  creatableRolesFor,
  type PasswordResetRequestDto,
  type PasswordResetRequestStatus,
  type TeamDto,
  type UserDto,
  type UserRole,
  type UserTeamBadgeDto,
} from '@tcms/shared';

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly mailService: MailService,
  ) {}

  private toUserDto(
    u: typeof users.$inferSelect,
    userTeams?: UserTeamBadgeDto[],
  ): UserDto {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role as UserRole,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      teams: userTeams ?? [],
      createdAt: u.createdAt.toISOString(),
    };
  }

  private async getTeamsByUserIdMap(): Promise<Map<string, UserTeamBadgeDto[]>> {
    const rows = await this.dbService.db
      .select({
        userId: teamMembers.userId,
        teamId: teams.id,
        teamName: teams.name,
        teamColor: teams.color,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .orderBy(asc(teams.name));

    const map = new Map<string, UserTeamBadgeDto[]>();
    for (const r of rows) {
      const list = map.get(r.userId) ?? [];
      list.push({ id: r.teamId, name: r.teamName, color: r.teamColor });
      map.set(r.userId, list);
    }
    return map;
  }

  async listUsers(): Promise<UserDto[]> {
    const [rows, teamsByUser] = await Promise.all([
      this.dbService.db.select().from(users).orderBy(asc(users.fullName)),
      this.getTeamsByUserIdMap(),
    ]);

    return rows.map((u) => this.toUserDto(u, teamsByUser.get(u.id) ?? []));
  }

  async createUser(
    input: {
      email: string;
      fullName: string;
      password: string;
      role: UserRole;
      mustChangePassword?: boolean;
      teamIds?: string[];
    },
    actor?: AuthUser,
  ): Promise<UserDto> {
    if (actor) {
      const allowed = creatableRolesFor(actor.role);
      if (!allowed.includes(input.role)) {
        throw new ForbiddenException(
          `Vai trò ${actor.role} không được phép tạo tài khoản với quyền ${input.role}`,
        );
      }
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const [existing] = await this.dbService.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing) {
      throw new ConflictException('Email này đã tồn tại trong hệ thống');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const [created] = await this.dbService.db
      .insert(users)
      .values({
        email: normalizedEmail,
        fullName: input.fullName.trim(),
        passwordHash,
        role: input.role,
        isActive: true,
        mustChangePassword: input.mustChangePassword ?? false,
      })
      .returning();

    if (input.teamIds && input.teamIds.length > 0) {
      const uniqueTeamIds = Array.from(new Set(input.teamIds));
      const validTeams = await this.dbService.db
        .select({ id: teams.id })
        .from(teams)
        .where(inArray(teams.id, uniqueTeamIds));
      if (validTeams.length > 0) {
        await this.dbService.db
          .insert(teamMembers)
          .values(validTeams.map((t) => ({ teamId: t.id, userId: created.id })))
          .onConflictDoNothing();
      }
    }

    if (this.mailService.isEnabled()) {
      void this.mailService.sendWelcomeAccountEmail({
        to: created.email,
        fullName: created.fullName,
        initialPassword: input.password,
        role: created.role,
        mustChangePassword: created.mustChangePassword,
      });
    }

    const teamsByUser = await this.getTeamsByUserIdMap();
    return this.toUserDto(created, teamsByUser.get(created.id) ?? []);
  }

  async updateUser(
    id: string,
    input: {
      fullName?: string;
      role?: UserRole;
      isActive?: boolean;
      password?: string;
      mustChangePassword?: boolean;
    },
    actor?: AuthUser,
  ): Promise<UserDto> {
    const [existing] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (actor && actor.role !== 'ADMIN') {
      if (existing.role === 'ADMIN') {
        throw new ForbiddenException('Chỉ Admin mới có quyền chỉnh sửa tài khoản Admin');
      }
      if (input.role !== undefined && !creatableRolesFor(actor.role).includes(input.role)) {
        throw new ForbiddenException(`Bạn không có quyền gán vai trò ${input.role}`);
      }
    }

    const updateData: Partial<typeof users.$inferInsert> = {};
    if (input.fullName !== undefined) {
      const trimmed = input.fullName.trim();
      if (!trimmed) throw new BadRequestException('Họ tên không được để trống');
      updateData.fullName = trimmed;
    }
    if (input.role !== undefined) updateData.role = input.role;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.mustChangePassword !== undefined) {
      updateData.mustChangePassword = input.mustChangePassword;
    }
    if (input.password && input.password.length >= 6) {
      updateData.passwordHash = await bcrypt.hash(input.password, 10);
    }

    const [updated] = await this.dbService.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    return this.toUserDto(updated);
  }

  async resetUserPassword(
    targetUserId: string,
    adminUserId: string,
    newPassword: string,
    mustChangePassword = true,
    actorRole: UserRole = 'ADMIN',
  ): Promise<{ ok: boolean; user: UserDto }> {
    const [existing] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (!canResetPasswordFor(actorRole, existing.role)) {
      throw new ForbiddenException(
        actorRole === 'QA_LEAD'
          ? 'QA Lead chỉ được phép đặt lại mật khẩu cho QA Engineer'
          : 'Chỉ Admin mới có quyền đặt lại mật khẩu cho tài khoản Admin',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [updated] = await this.dbService.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword,
      })
      .where(eq(users.id, targetUserId))
      .returning();

    // Auto-complete any pending password reset requests for this user
    await this.dbService.db
      .update(passwordResetRequests)
      .set({
        status: 'COMPLETED',
        resolvedBy: adminUserId,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(passwordResetRequests.userId, targetUserId),
          eq(passwordResetRequests.status, 'PENDING'),
        ),
      );

    if (this.mailService.isEnabled()) {
      void this.mailService.sendTempPasswordToUser({
        to: updated.email,
        fullName: updated.fullName,
        tempPassword: newPassword,
        mustChangePassword,
      });
    }

    return { ok: true, user: this.toUserDto(updated) };
  }

  async listPasswordResetRequests(
    actorRole: UserRole = 'ADMIN',
  ): Promise<PasswordResetRequestDto[]> {
    const rows = await this.dbService.db
      .select()
      .from(passwordResetRequests)
      .orderBy(desc(passwordResetRequests.createdAt))
      .limit(50);

    if (rows.length === 0) return [];

    const allUsers = await this.dbService.db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const mapped: PasswordResetRequestDto[] = rows
      .map((r) => {
        const target = userMap.get(r.userId);
        const resolver = r.resolvedBy ? userMap.get(r.resolvedBy) : null;
        return {
          id: r.id,
          userId: r.userId,
          email: target?.email || r.email,
          fullName: target?.fullName || r.email,
          role: (target?.role as UserRole) || 'QA',
          note: r.note || '',
          status: r.status as PasswordResetRequestStatus,
          resolvedByName: resolver?.fullName ?? null,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        };
      })
      .filter((item) => canResetPasswordFor(actorRole, item.role));

    // Sort PENDING first, then newest first
    mapped.sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return mapped;
  }

  async dismissPasswordResetRequest(
    requestId: string,
    adminUserId: string,
    actorRole: UserRole = 'ADMIN',
  ): Promise<{ ok: boolean }> {
    const [existing] = await this.dbService.db
      .select()
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.id, requestId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Không tìm thấy yêu cầu đặt lại mật khẩu');
    }

    const [targetUser] = await this.dbService.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, existing.userId))
      .limit(1);

    if (targetUser && !canResetPasswordFor(actorRole, targetUser.role)) {
      throw new ForbiddenException('Bạn không có quyền xử lý yêu cầu đặt lại mật khẩu này');
    }

    await this.dbService.db
      .update(passwordResetRequests)
      .set({
        status: 'DISMISSED',
        resolvedBy: adminUserId,
        resolvedAt: new Date(),
      })
      .where(eq(passwordResetRequests.id, requestId));

    return { ok: true };
  }

  // =========================================================================
  // Teams / Workstreams Management
  // =========================================================================

  async listTeams(): Promise<TeamDto[]> {
    const db = this.dbService.db;
    const [teamRows, memberRows] = await Promise.all([
      db.select().from(teams).orderBy(asc(teams.name)),
      db
        .select({
          teamId: teamMembers.teamId,
          userId: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          isActive: users.isActive,
          addedAt: teamMembers.addedAt,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .orderBy(asc(users.fullName)),
    ]);

    const membersByTeam = new Map<string, TeamDto['members']>();
    for (const m of memberRows) {
      const list = membersByTeam.get(m.teamId) ?? [];
      list.push({
        userId: m.userId,
        email: m.email,
        fullName: m.fullName,
        role: m.role as UserRole,
        isActive: m.isActive,
        addedAt: m.addedAt.toISOString(),
      });
      membersByTeam.set(m.teamId, list);
    }

    return teamRows.map((t) => {
      const members = membersByTeam.get(t.id) ?? [];
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        color: t.color,
        memberCount: members.length,
        members,
        createdAt: t.createdAt.toISOString(),
      };
    });
  }

  async getTeamById(teamId: string): Promise<TeamDto> {
    const all = await this.listTeams();
    const found = all.find((t) => t.id === teamId);
    if (!found) {
      throw new NotFoundException('Không tìm thấy Team / Workstream');
    }
    return found;
  }

  async createTeam(input: {
    name: string;
    description?: string | null;
    color?: string;
    memberIds?: string[];
  }): Promise<TeamDto> {
    const db = this.dbService.db;
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Tên Team không được để trống');
    }

    const [dup] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.name, trimmedName))
      .limit(1);
    if (dup) {
      throw new ConflictException(`Team "${trimmedName}" đã tồn tại`);
    }

    const [created] = await db
      .insert(teams)
      .values({
        name: trimmedName,
        description: input.description?.trim() || null,
        color: input.color?.trim() || 'brand',
      })
      .returning();

    if (input.memberIds && input.memberIds.length > 0) {
      const uniqueIds = Array.from(new Set(input.memberIds));
      await db
        .insert(teamMembers)
        .values(uniqueIds.map((userId) => ({ teamId: created.id, userId })))
        .onConflictDoNothing();
    }

    return this.getTeamById(created.id);
  }

  async updateTeam(
    teamId: string,
    input: {
      name?: string;
      description?: string | null;
      color?: string;
      memberIds?: string[];
    },
  ): Promise<TeamDto> {
    const db = this.dbService.db;
    const [existing] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy Team / Workstream');
    }

    const updateData: Partial<typeof teams.$inferInsert> = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new BadRequestException('Tên Team không được để trống');
      if (trimmed !== existing.name) {
        const [dup] = await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.name, trimmed))
          .limit(1);
        if (dup && dup.id !== teamId) {
          throw new ConflictException(`Team "${trimmed}" đã tồn tại`);
        }
      }
      updateData.name = trimmed;
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }
    if (input.color !== undefined) {
      updateData.color = input.color.trim() || 'brand';
    }

    if (Object.keys(updateData).length > 0) {
      await db.update(teams).set(updateData).where(eq(teams.id, teamId));
    }

    if (input.memberIds !== undefined) {
      const uniqueIds = Array.from(new Set(input.memberIds));
      await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
      if (uniqueIds.length > 0) {
        await db
          .insert(teamMembers)
          .values(uniqueIds.map((userId) => ({ teamId, userId })))
          .onConflictDoNothing();
      }
    }

    return this.getTeamById(teamId);
  }

  async addTeamMembers(teamId: string, userIds: string[]): Promise<TeamDto> {
    const db = this.dbService.db;
    const [existing] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy Team / Workstream');
    }

    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length > 0) {
      await db
        .insert(teamMembers)
        .values(uniqueIds.map((userId) => ({ teamId, userId })))
        .onConflictDoNothing();
    }

    return this.getTeamById(teamId);
  }

  async removeTeamMember(teamId: string, userId: string): Promise<TeamDto> {
    await this.dbService.db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    return this.getTeamById(teamId);
  }

  async deleteTeam(teamId: string): Promise<{ deleted: boolean }> {
    await this.dbService.db.delete(teams).where(eq(teams.id, teamId));
    return { deleted: true };
  }
}
