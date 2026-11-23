import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  defects,
  projectFavorites,
  projectIntegrations,
  projectMembers,
  projects,
  suites,
  teamMembers,
  teams,
  testCases,
  testRunResults,
  testRuns,
  users,
  type JiraIntegrationRawConfig,
} from '../db/schema';
import { computeRunStats } from '../test-runs/test-runs.service';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { assertSafeOutboundUrl, validateSafeExternalUrl } from '../common/url-security.util';
import {
  AUTOMATION_STATUSES,
  PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_CASE_TYPES,
  canViewAllProjects,
  type AutomationStatus,
  type ExecutionStatus,
  type JiraIntegrationConfigDto,
  type Priority,
  type ProjectMemberDto,
  type ProjectRole,
  type ProjectRtmDto,
  type ProjectStatsDto,
  type ProjectSummaryDto,
  type RtmCaseEntryDto,
  type RtmReadinessStatus,
  type RtmRequirementDto,
  type TestCaseStatus,
  type TestCaseType,
  type UserRole,
  type UserTeamBadgeDto,
} from '@tcms/shared';

function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 6) return '••••••';
  return `${secret.slice(0, 3)}••••••••${secret.slice(-3)}`;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async listProjects(user: AuthUser, includeArchived = false): Promise<ProjectSummaryDto[]> {
    const db = this.dbService.db;

    let projectRows: Array<typeof projects.$inferSelect>;
    const roleByProject = new Map<string, UserRole | ProjectRole>();

    if (canViewAllProjects(user.role)) {
      projectRows = includeArchived
        ? await db.select().from(projects).orderBy(asc(projects.isArchived), asc(projects.name))
        : await db
            .select()
            .from(projects)
            .where(eq(projects.isArchived, false))
            .orderBy(asc(projects.name));
      for (const p of projectRows) {
        roleByProject.set(p.id, user.role);
      }
    } else {
      const canSeeOwnArchived = includeArchived && user.role === 'QA_LEAD';
      const memberships = await db
        .select({
          project: projects,
          role: projectMembers.role,
        })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(
          canSeeOwnArchived
            ? eq(projectMembers.userId, user.id)
            : and(
                eq(projectMembers.userId, user.id),
                eq(projects.isArchived, false),
              ),
        )
        .orderBy(asc(projects.isArchived), asc(projects.name));

      projectRows = memberships.map((m) => m.project);
      for (const m of memberships) {
        roleByProject.set(m.project.id, user.role);
      }
    }

    if (projectRows.length === 0) return [];
    const projectIds = projectRows.map((p) => p.id);

    const [caseAggs, suiteAggs, memberAggs, jiraRows, favoriteRows] = await Promise.all([
      db
        .select({
          projectId: testCases.projectId,
          totalCases: count(),
          automatedCases: sql<number>`COALESCE(SUM(CASE WHEN ${testCases.automationStatus} = 'AUTOMATED' THEN 1 ELSE 0 END), 0)::int`,
        })
        .from(testCases)
        .where(and(inArray(testCases.projectId, projectIds), isNull(testCases.deletedAt)))
        .groupBy(testCases.projectId),
      db
        .select({
          projectId: suites.projectId,
          suiteCount: count(),
        })
        .from(suites)
        .where(and(inArray(suites.projectId, projectIds), isNull(suites.deletedAt)))
        .groupBy(suites.projectId),
      db
        .select({
          projectId: projectMembers.projectId,
          memberCount: count(),
        })
        .from(projectMembers)
        .where(inArray(projectMembers.projectId, projectIds))
        .groupBy(projectMembers.projectId),
      db
        .select()
        .from(projectIntegrations)
        .where(
          and(
            inArray(projectIntegrations.projectId, projectIds),
            eq(projectIntegrations.provider, 'jira'),
          ),
        ),
      db
        .select({ projectId: projectFavorites.projectId })
        .from(projectFavorites)
        .where(
          and(
            eq(projectFavorites.userId, user.id),
            inArray(projectFavorites.projectId, projectIds),
          ),
        ),
    ]);

    const caseMap = new Map(caseAggs.map((r) => [r.projectId, r]));
    const suiteMap = new Map(suiteAggs.map((r) => [r.projectId, r.suiteCount]));
    const memberMap = new Map(memberAggs.map((r) => [r.projectId, r.memberCount]));
    const jiraMap = new Map(jiraRows.map((r) => [r.projectId, r]));
    const favoriteSet = new Set(favoriteRows.map((r) => r.projectId));

    const summaries: ProjectSummaryDto[] = projectRows.map((p) => {
      const c = caseMap.get(p.id);
      const jira = jiraMap.get(p.id);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        caseCounter: p.caseCounter,
        isArchived: p.isArchived,
        isFavorite: favoriteSet.has(p.id),
        createdAt: p.createdAt.toISOString(),
        myRole: roleByProject.get(p.id),
        stats: {
          totalCases: Number(c?.totalCases ?? 0),
          automatedCases: Number(c?.automatedCases ?? 0),
          suiteCount: Number(suiteMap.get(p.id) ?? 0),
          memberCount: Number(memberMap.get(p.id) ?? 0),
        },
        jiraEnabled: jira?.isEnabled ?? false,
        jiraBaseUrl: jira?.config?.baseUrl || null,
      };
    });

    // Pin favorites to top (keeping active projects before archived, then alphabetical)
    summaries.sort((a, b) => {
      if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
      const favA = a.isFavorite ? 1 : 0;
      const favB = b.isFavorite ? 1 : 0;
      if (favA !== favB) return favB - favA;
      return a.name.localeCompare(b.name, 'vi');
    });

    return summaries;
  }

  async getProject(projectId: string, user: AuthUser): Promise<ProjectSummaryDto> {
    const { project, effectiveRole } = await this.projectAccess.verifyAccess(
      projectId,
      user,
      'view',
    );
    const db = this.dbService.db;

    const [[caseAgg], [suiteAgg], [memberAgg], [jira], [fav]] = await Promise.all([
      db
        .select({
          totalCases: count(),
          automatedCases: sql<number>`COALESCE(SUM(CASE WHEN ${testCases.automationStatus} = 'AUTOMATED' THEN 1 ELSE 0 END), 0)::int`,
        })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt))),
      db
        .select({ suiteCount: count() })
        .from(suites)
        .where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt))),
      db
        .select({ memberCount: count() })
        .from(projectMembers)
        .where(eq(projectMembers.projectId, projectId)),
      db
        .select()
        .from(projectIntegrations)
        .where(
          and(
            eq(projectIntegrations.projectId, projectId),
            eq(projectIntegrations.provider, 'jira'),
          ),
        )
        .limit(1),
      db
        .select({ projectId: projectFavorites.projectId })
        .from(projectFavorites)
        .where(
          and(
            eq(projectFavorites.projectId, projectId),
            eq(projectFavorites.userId, user.id),
          ),
        )
        .limit(1),
    ]);

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      caseCounter: project.caseCounter,
      isArchived: project.isArchived,
      isFavorite: Boolean(fav),
      createdAt: project.createdAt.toISOString(),
      myRole: effectiveRole,
      stats: {
        totalCases: Number(caseAgg?.totalCases ?? 0),
        automatedCases: Number(caseAgg?.automatedCases ?? 0),
        suiteCount: Number(suiteAgg?.suiteCount ?? 0),
        memberCount: Number(memberAgg?.memberCount ?? 0),
      },
      jiraEnabled: jira?.isEnabled ?? false,
      jiraBaseUrl: jira?.config?.baseUrl || null,
    };
  }

  async toggleFavorite(
    projectId: string,
    user: AuthUser,
    desired?: boolean,
  ): Promise<{ projectId: string; isFavorite: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const [existing] = await db
      .select({ projectId: projectFavorites.projectId })
      .from(projectFavorites)
      .where(
        and(
          eq(projectFavorites.projectId, projectId),
          eq(projectFavorites.userId, user.id),
        ),
      )
      .limit(1);

    const nextFavorite = desired !== undefined ? desired : !existing;

    if (nextFavorite) {
      await db
        .insert(projectFavorites)
        .values({ projectId, userId: user.id })
        .onConflictDoNothing();
    } else if (existing) {
      await db
        .delete(projectFavorites)
        .where(
          and(
            eq(projectFavorites.projectId, projectId),
            eq(projectFavorites.userId, user.id),
          ),
        );
    }

    return { projectId, isFavorite: nextFavorite };
  }

  async createProject(
    user: AuthUser,
    input: { code: string; name: string; description?: string },
  ): Promise<ProjectSummaryDto> {
    const normalizedCode = input.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalizedCode.length < 2 || normalizedCode.length > 10) {
      throw new BadRequestException('Mã dự án phải từ 2-10 ký tự chữ/số in hoa (VD: WEB, MOB)');
    }

    const db = this.dbService.db;
    const [existing] = await db
      .select({ id: projects.id, isArchived: projects.isArchived })
      .from(projects)
      .where(eq(projects.code, normalizedCode))
      .limit(1);

    if (existing) {
      if (existing.isArchived) {
        throw new ConflictException(
          `Mã dự án "${normalizedCode}" thuộc một dự án đang lưu trữ (Archived). Hãy nhờ Admin khôi phục hoặc chọn mã dự án khác.`,
        );
      }
      throw new ConflictException(
        `Mã dự án "${normalizedCode}" đã tồn tại trong hệ thống. Nếu bạn không thấy dự án này, hãy liên hệ Admin để được thêm vào thành viên dự án.`,
      );
    }

    const [created] = await db
      .insert(projects)
      .values({
        code: normalizedCode,
        name: input.name.trim(),
        description: input.description?.trim() || null,
      })
      .returning();

    await db.insert(projectMembers).values({
      projectId: created.id,
      userId: user.id,
      role: 'QA_LEAD',
    });

    return this.getProject(created.id, user);
  }

  async updateProject(
    projectId: string,
    user: AuthUser,
    input: { name?: string; description?: string | null; isArchived?: boolean },
  ): Promise<ProjectSummaryDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const updateData: Partial<typeof projects.$inferInsert> = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim() || null;
    if (input.isArchived !== undefined) updateData.isArchived = input.isArchived;

    await this.dbService.db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, projectId));

    return this.getProject(projectId, user);
  }

  async deleteProject(projectId: string, user: AuthUser): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    await this.dbService.db.delete(projects).where(eq(projects.id, projectId));
    return { deleted: true };
  }

  async listMembers(projectId: string, user: AuthUser): Promise<ProjectMemberDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const [rows, teamRows] = await Promise.all([
      this.dbService.db
        .select({
          userId: projectMembers.userId,
          projectRole: projectMembers.role,
          addedAt: projectMembers.addedAt,
          email: users.email,
          fullName: users.fullName,
          globalRole: users.role,
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .where(eq(projectMembers.projectId, projectId))
        .orderBy(asc(users.fullName)),
      this.dbService.db
        .select({
          userId: teamMembers.userId,
          teamId: teams.id,
          teamName: teams.name,
          teamColor: teams.color,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .orderBy(asc(teams.name)),
    ]);

    const teamsByUser = new Map<string, UserTeamBadgeDto[]>();
    for (const tr of teamRows) {
      const list = teamsByUser.get(tr.userId) ?? [];
      list.push({ id: tr.teamId, name: tr.teamName, color: tr.teamColor });
      teamsByUser.set(tr.userId, list);
    }

    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      fullName: r.fullName,
      globalRole: r.globalRole as UserRole,
      projectRole: r.projectRole as ProjectRole,
      teams: teamsByUser.get(r.userId) ?? [],
      addedAt: r.addedAt.toISOString(),
    }));
  }

  async upsertMember(
    projectId: string,
    user: AuthUser,
    input: { userId: string; role?: ProjectRole },
  ): Promise<ProjectMemberDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;

    const [targetUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    if (!targetUser) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    const [existing] = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, input.userId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new BadRequestException(
        'Thành viên đã thuộc dự án. Vai trò được quản lý cố định theo tài khoản tại mục Quản lý Thành viên (/users).',
      );
    }

    const fixedRole: ProjectRole =
      targetUser.role === 'ADMIN' ||
      targetUser.role === 'QA_MANAGER' ||
      targetUser.role === 'QA_LEAD'
        ? 'QA_LEAD'
        : targetUser.role === 'PM'
          ? 'PM'
          : targetUser.role === 'PO'
            ? 'PO'
            : 'QA';

    await db.insert(projectMembers).values({
      projectId,
      userId: input.userId,
      role: fixedRole,
    });

    return this.listMembers(projectId, user);
  }

  async addMembersBulk(
    projectId: string,
    user: AuthUser,
    userIds: string[],
  ): Promise<{ added: number; members: ProjectMemberDto[] }> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;
    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length === 0) {
      return { added: 0, members: await this.listMembers(projectId, user) };
    }

    const [targetUsers, existingRows] = await Promise.all([
      db
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(inArray(users.id, uniqueIds)),
      db
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            inArray(projectMembers.userId, uniqueIds),
          ),
        ),
    ]);

    const existingSet = new Set(existingRows.map((r) => r.userId));
    const toInsert = targetUsers
      .filter((u) => u.isActive && !existingSet.has(u.id))
      .map((u) => {
        const fixedRole: ProjectRole =
          u.role === 'ADMIN' || u.role === 'QA_MANAGER' || u.role === 'QA_LEAD'
            ? 'QA_LEAD'
            : u.role === 'PM'
              ? 'PM'
              : u.role === 'PO'
                ? 'PO'
                : 'QA';
        return {
          projectId,
          userId: u.id,
          role: fixedRole,
        };
      });

    if (toInsert.length > 0) {
      await db.insert(projectMembers).values(toInsert);
    }

    return {
      added: toInsert.length,
      members: await this.listMembers(projectId, user),
    };
  }

  async addTeamToProject(
    projectId: string,
    user: AuthUser,
    teamId: string,
  ): Promise<{ added: number; teamName: string; members: ProjectMemberDto[] }> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;

    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!team) {
      throw new NotFoundException('Không tìm thấy Team / Workstream');
    }

    const memberRows = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    const userIds = memberRows.map((m) => m.userId);
    const bulkRes = await this.addMembersBulk(projectId, user, userIds);
    return {
      added: bulkRes.added,
      teamName: team.name,
      members: bulkRes.members,
    };
  }

  async removeMember(
    projectId: string,
    memberUserId: string,
    user: AuthUser,
  ): Promise<ProjectMemberDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;

    if (memberUserId === user.id) {
      throw new BadRequestException('Không thể tự xóa chính mình khỏi dự án');
    }

    const [targetUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, memberUserId))
      .limit(1);

    if (targetUser?.role === 'ADMIN' || targetUser?.role === 'QA_MANAGER') {
      throw new ForbiddenException(
        'Không thể xóa tài khoản Admin hoặc QA Manager khỏi dự án (họ có quyền truy cập toàn bộ dự án)',
      );
    }

    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, memberUserId),
        ),
      );
    return this.listMembers(projectId, user);
  }

  async getJiraConfig(projectId: string, user: AuthUser): Promise<JiraIntegrationConfigDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const [row] = await this.dbService.db
      .select()
      .from(projectIntegrations)
      .where(
        and(
          eq(projectIntegrations.projectId, projectId),
          eq(projectIntegrations.provider, 'jira'),
        ),
      )
      .limit(1);

    if (!row) {
      return {
        baseUrl: '',
        email: '',
        apiTokenMasked: '',
        hasApiToken: false,
        projectKey: '',
        defaultIssueType: 'Bug',
        isEnabled: false,
      };
    }

    return {
      baseUrl: row.config.baseUrl || '',
      email: row.config.email || '',
      apiTokenMasked: maskSecret(row.config.apiToken || ''),
      hasApiToken: Boolean(row.config.apiToken),
      projectKey: row.config.projectKey || '',
      defaultIssueType: row.config.defaultIssueType || 'Bug',
      isEnabled: row.isEnabled,
    };
  }

  async saveJiraConfig(
    projectId: string,
    user: AuthUser,
    input: {
      baseUrl: string;
      email: string;
      apiToken?: string;
      projectKey: string;
      defaultIssueType: string;
      isEnabled: boolean;
    },
  ): Promise<JiraIntegrationConfigDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(projectIntegrations)
      .where(
        and(
          eq(projectIntegrations.projectId, projectId),
          eq(projectIntegrations.provider, 'jira'),
        ),
      )
      .limit(1);

    const rawBaseUrl = input.baseUrl.trim();
    if (input.isEnabled && !rawBaseUrl) {
      throw new BadRequestException('Vui lòng nhập Jira Base URL hợp lệ khi kích hoạt Jira');
    }
    const normalizedBaseUrl = rawBaseUrl
      ? validateSafeExternalUrl(rawBaseUrl, 'Jira Base URL')
      : '';
    const apiToken =
      input.apiToken !== undefined && input.apiToken.trim() !== ''
        ? input.apiToken.trim()
        : existing?.config?.apiToken || '';

    const config: JiraIntegrationRawConfig = {
      baseUrl: normalizedBaseUrl,
      email: input.email.trim(),
      apiToken,
      projectKey: input.projectKey.trim().toUpperCase(),
      defaultIssueType: input.defaultIssueType.trim() || 'Bug',
    };

    if (existing) {
      await db
        .update(projectIntegrations)
        .set({
          config,
          isEnabled: input.isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(projectIntegrations.id, existing.id));
    } else {
      await db.insert(projectIntegrations).values({
        projectId,
        provider: 'jira',
        config,
        isEnabled: input.isEnabled,
      });
    }

    return this.getJiraConfig(projectId, user);
  }

  async testJiraConnection(
    projectId: string,
    user: AuthUser,
  ): Promise<{ ok: boolean; message: string; accountName?: string }> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const [row] = await this.dbService.db
      .select()
      .from(projectIntegrations)
      .where(
        and(
          eq(projectIntegrations.projectId, projectId),
          eq(projectIntegrations.provider, 'jira'),
        ),
      )
      .limit(1);

    if (!row || !row.config.baseUrl || !row.config.email || !row.config.apiToken) {
      return {
        ok: false,
        message: 'Vui lòng nhập đầy đủ Jira Base URL, Email và API Token rồi lưu lại trước khi kiểm tra.',
      };
    }

    const safeBaseUrl = await assertSafeOutboundUrl(row.config.baseUrl, 'Jira Base URL');
    const url = `${safeBaseUrl}/rest/api/3/myself`;
    const basicAuth = Buffer.from(`${row.config.email}:${row.config.apiToken}`).toString('base64');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          ok: false,
          message: `Jira phản hồi mã lỗi HTTP ${response.status}. Kiểm tra lại Email / API Token hoặc quyền truy cập.`,
        };
      }

      const data = (await response.json()) as { displayName?: string };
      return {
        ok: true,
        message: `Kết nối Jira thành công! Tài khoản: ${data.displayName || row.config.email}`,
        accountName: data.displayName,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      return {
        ok: false,
        message: `Không thể kết nối tới ${row.config.baseUrl}: ${reason}`,
      };
    }
  }

  async getProjectStats(projectId: string, user: AuthUser): Promise<ProjectStatsDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const [
      [totalCaseRow],
      [totalSuiteRow],
      [jiraLinkedRow],
      priorityRows,
      autoRows,
      typeRows,
      statusRows,
      suiteDistRows,
    ] = await Promise.all([
      db
        .select({ total: count() })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt))),
      db
        .select({ total: count() })
        .from(suites)
        .where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt))),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
        })
        .from(testCases)
        .where(
          and(
            eq(testCases.projectId, projectId),
            isNull(testCases.deletedAt),
            sql`jsonb_array_length(${testCases.jiraIssueKeys}) > 0`,
          ),
        ),
      db
        .select({ key: testCases.priority, total: count() })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt)))
        .groupBy(testCases.priority),
      db
        .select({ key: testCases.automationStatus, total: count() })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt)))
        .groupBy(testCases.automationStatus),
      db
        .select({ key: testCases.type, total: count() })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt)))
        .groupBy(testCases.type),
      db
        .select({ key: testCases.status, total: count() })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt)))
        .groupBy(testCases.status),
      db
        .select({
          suiteId: testCases.suiteId,
          title: suites.title,
          total: count(),
        })
        .from(testCases)
        .leftJoin(suites, and(eq(testCases.suiteId, suites.id), isNull(suites.deletedAt)))
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt)))
        .groupBy(testCases.suiteId, suites.title)
        .orderBy(desc(count()))
        .limit(8),
    ]);

    const byPriority = Object.fromEntries(PRIORITIES.map((k) => [k, 0])) as Record<Priority, number>;
    for (const r of priorityRows) {
      if (r.key in byPriority) byPriority[r.key as Priority] = Number(r.total);
    }

    const byAutomation = Object.fromEntries(AUTOMATION_STATUSES.map((k) => [k, 0])) as Record<
      AutomationStatus,
      number
    >;
    for (const r of autoRows) {
      if (r.key in byAutomation) byAutomation[r.key as AutomationStatus] = Number(r.total);
    }

    const byType = Object.fromEntries(TEST_CASE_TYPES.map((k) => [k, 0])) as Record<
      TestCaseType,
      number
    >;
    for (const r of typeRows) {
      if (r.key in byType) byType[r.key as TestCaseType] = Number(r.total);
    }

    const byStatus = Object.fromEntries(TEST_CASE_STATUSES.map((k) => [k, 0])) as Record<
      TestCaseStatus,
      number
    >;
    for (const r of statusRows) {
      if (r.key in byStatus) byStatus[r.key as TestCaseStatus] = Number(r.total);
    }

    const [recentRunRows, [openDefRow]] = await Promise.all([
      db
        .select()
        .from(testRuns)
        .where(eq(testRuns.projectId, projectId))
        .orderBy(desc(testRuns.startedAt))
        .limit(5),
      db
        .select({ total: count() })
        .from(defects)
        .where(and(eq(defects.projectId, projectId), inArray(defects.status, ['OPEN', 'IN_PROGRESS']))),
    ]);

    const recentRunIds = recentRunRows.map((r) => r.id);
    const [resRows, defAggs] =
      recentRunIds.length > 0
        ? await Promise.all([
            db
              .select({ runId: testRunResults.runId, status: testRunResults.status })
              .from(testRunResults)
              .where(inArray(testRunResults.runId, recentRunIds)),
            db
              .select({ runId: defects.runId, total: count() })
              .from(defects)
              .where(inArray(defects.runId, recentRunIds))
              .groupBy(defects.runId),
          ])
        : [[], []];

    const resByRun = new Map<string, string[]>();
    for (const r of resRows) {
      const arr = resByRun.get(r.runId) ?? [];
      arr.push(r.status);
      resByRun.set(r.runId, arr);
    }
    const defByRun = new Map(defAggs.filter((d) => d.runId).map((d) => [d.runId!, Number(d.total)]));

    return {
      totalCases: Number(totalCaseRow?.total ?? 0),
      totalSuites: Number(totalSuiteRow?.total ?? 0),
      linkedJiraCases: Number(jiraLinkedRow?.total ?? 0),
      byPriority,
      byAutomation,
      byType,
      byStatus,
      topSuites: suiteDistRows.map((r) => ({
        suiteId: r.suiteId,
        title: r.title || 'Chưa phân loại (No Suite)',
        count: Number(r.total),
      })),
      openDefectsCount: Number(openDefRow?.total ?? 0),
      recentRuns: recentRunRows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        planId: r.planId,
        title: r.title,
        description: r.description,
        environment: r.environment,
        appVersion: r.appVersion,
        plannedDate: r.plannedDate,
        jiraIssueKey: r.jiraIssueKey,
        status: r.status as any,
        stats: computeRunStats(resByRun.get(r.id) ?? []),
        defectCount: defByRun.get(r.id) ?? 0,
        createdByName: null,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        lastJiraSyncedAt: r.lastJiraSyncedAt ? r.lastJiraSyncedAt.toISOString() : null,
      })),
    };
  }

  async getProjectRtm(projectId: string, user: AuthUser): Promise<ProjectRtmDto> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const [jiraIntegrationRows, caseRows, runResultRows, openDefectRows] = await Promise.all([
      db
        .select({ config: projectIntegrations.config, isEnabled: projectIntegrations.isEnabled })
        .from(projectIntegrations)
        .where(
          and(
            eq(projectIntegrations.projectId, projectId),
            eq(projectIntegrations.provider, 'jira'),
          ),
        )
        .limit(1),
      db
        .select({
          id: testCases.id,
          seqNumber: testCases.seqNumber,
          title: testCases.title,
          priority: testCases.priority,
          automationStatus: testCases.automationStatus,
          jiraIssueKeys: testCases.jiraIssueKeys,
        })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt)))
        .orderBy(asc(testCases.seqNumber)),
      db
        .select({
          testCaseId: testRunResults.testCaseId,
          caseCode: testRunResults.caseCode,
          status: testRunResults.status,
          executedAt: testRunResults.executedAt,
          runId: testRuns.id,
          runTitle: testRuns.title,
          runStartedAt: testRuns.startedAt,
        })
        .from(testRunResults)
        .innerJoin(testRuns, eq(testRunResults.runId, testRuns.id))
        .where(eq(testRuns.projectId, projectId))
        .orderBy(desc(testRunResults.executedAt), desc(testRuns.startedAt)),
      db
        .select({
          id: defects.id,
          caseCode: defects.caseCode,
          jiraIssueKey: defects.jiraIssueKey,
        })
        .from(defects)
        .where(
          and(
            eq(defects.projectId, projectId),
            inArray(defects.status, ['OPEN', 'IN_PROGRESS']),
          ),
        ),
    ]);

    const jiraBaseUrl =
      jiraIntegrationRows[0]?.isEnabled && jiraIntegrationRows[0]?.config?.baseUrl
        ? jiraIntegrationRows[0].config.baseUrl
        : null;

    // Latest execution result per testCaseId (fallback by caseCode)
    const latestByCaseId = new Map<
      string,
      { status: ExecutionStatus; runId: string; runTitle: string }
    >();
    const latestByCaseCode = new Map<
      string,
      { status: ExecutionStatus; runId: string; runTitle: string }
    >();
    for (const r of runResultRows) {
      const entry = {
        status: r.status as ExecutionStatus,
        runId: r.runId,
        runTitle: r.runTitle,
      };
      if (r.testCaseId && !latestByCaseId.has(r.testCaseId)) {
        latestByCaseId.set(r.testCaseId, entry);
      }
      if (r.caseCode && !latestByCaseCode.has(r.caseCode)) {
        latestByCaseCode.set(r.caseCode, entry);
      }
    }

    // Open defect counts by caseCode
    const openDefectsByCaseCode = new Map<string, number>();
    for (const d of openDefectRows) {
      if (d.caseCode) {
        openDefectsByCaseCode.set(d.caseCode, (openDefectsByCaseCode.get(d.caseCode) ?? 0) + 1);
      }
    }

    const reqMap = new Map<string, RtmCaseEntryDto[]>();
    let casesWithoutRequirement = 0;

    for (const c of caseRows) {
      const keys = Array.isArray(c.jiraIssueKeys)
        ? Array.from(new Set(c.jiraIssueKeys.map((k) => k.trim().toUpperCase()).filter(Boolean)))
        : [];
      if (keys.length === 0) {
        casesWithoutRequirement++;
        continue;
      }

      const code = `${project.code}-${c.seqNumber}`;
      const latest = latestByCaseId.get(c.id) ?? latestByCaseCode.get(code);
      const caseEntry: RtmCaseEntryDto = {
        id: c.id,
        code,
        title: c.title,
        priority: c.priority as Priority,
        automationStatus: c.automationStatus as AutomationStatus,
        latestRunId: latest?.runId ?? null,
        latestRunTitle: latest?.runTitle ?? null,
        latestStatus: latest?.status ?? 'NOT_EXECUTED',
        openDefectCount: openDefectsByCaseCode.get(code) ?? 0,
      };

      for (const jiraKey of keys) {
        const list = reqMap.get(jiraKey) ?? [];
        list.push(caseEntry);
        reqMap.set(jiraKey, list);
      }
    }

    const items: RtmRequirementDto[] = Array.from(reqMap.entries())
      .map(([jiraKey, cases]) => {
        let passed = 0;
        let failed = 0;
        let blocked = 0;
        let skipped = 0;
        let untested = 0;
        let openDefects = 0;

        for (const c of cases) {
          openDefects += c.openDefectCount;
          if (c.latestStatus === 'PASSED') passed++;
          else if (c.latestStatus === 'FAILED') failed++;
          else if (c.latestStatus === 'BLOCKED') blocked++;
          else if (c.latestStatus === 'NOT_TEST') skipped++;
          else untested++;
        }

        const totalCases = cases.length;
        const passRate = totalCases > 0 ? Math.round((passed / totalCases) * 100) : 0;

        let readiness: RtmReadinessStatus = 'IN_PROGRESS';
        if (failed > 0 || blocked > 0 || openDefects > 0) {
          readiness = 'AT_RISK';
        } else if (passed === 0 && skipped === 0) {
          readiness = 'NOT_RUN';
        } else if (untested === 0 && passed > 0) {
          readiness = 'READY';
        }

        return {
          jiraKey,
          totalCases,
          passed,
          failed,
          blocked,
          skipped,
          untested,
          openDefects,
          passRate,
          readiness,
          cases,
        };
      })
      .sort((a, b) => {
        const weight: Record<RtmReadinessStatus, number> = {
          AT_RISK: 0,
          IN_PROGRESS: 1,
          NOT_RUN: 2,
          READY: 3,
        };
        if (weight[a.readiness] !== weight[b.readiness]) {
          return weight[a.readiness] - weight[b.readiness];
        }
        return a.jiraKey.localeCompare(b.jiraKey);
      });

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      jiraBaseUrl,
      totalRequirements: items.length,
      readyCount: items.filter((i) => i.readiness === 'READY').length,
      atRiskCount: items.filter((i) => i.readiness === 'AT_RISK').length,
      inProgressCount: items.filter((i) => i.readiness === 'IN_PROGRESS').length,
      notRunCount: items.filter((i) => i.readiness === 'NOT_RUN').length,
      casesWithoutRequirement,
      items,
    };
  }
}
