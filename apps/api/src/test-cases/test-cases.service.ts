import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  attachments,
  projectIntegrations,
  projects,
  sharedSteps,
  suites,
  testCaseComments,
  testCases,
  testCaseVersions,
  testSteps,
  users,
} from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { StorageService } from './storage.service';
import { toCsv } from './csv.util';
import {
  buildVikkiExcelExportBuffer,
  getCleanVikkiTemplateBuffer,
  parseVikkiOrGenericImport,
  type ExportableCaseItem,
} from './excel.util';
import { buildDiffSummary, computeSnapshotDiff } from './version-diff.util';
import {
  canManageProject,
  type AttachmentDto,
  type AutomationStatus,
  type BulkActionType,
  type FieldDiffDto,
  type PaginatedResponse,
  type Priority,
  type Severity,
  type TestCaseCommentDto,
  type TestCaseDetailDto,
  type TestCaseListItemDto,
  type TestCaseSnapshotDto,
  type TestCaseStatus,
  type TestCaseType,
  type TestCaseVersionDto,
  type TestStepDto,
  type TrashItemDto,
  type UserRole,
  type VersionAction,
  type VersionState,
} from '@tcms/shared';

export interface ListCasesFilter {
  suiteId?: string;
  includeSubSuites?: boolean;
  search?: string;
  priority?: Priority;
  severity?: Severity;
  type?: TestCaseType;
  automationStatus?: AutomationStatus;
  status?: TestCaseStatus;
  tag?: string;
  jiraKey?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'seqNumber' | 'title' | 'priority' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
}

export interface CreateCaseInput {
  suiteId?: string | null;
  title: string;
  description?: string;
  preconditions?: string;
  priority?: Priority;
  severity?: Severity;
  type?: TestCaseType;
  automationStatus?: AutomationStatus;
  status?: TestCaseStatus;
  tags?: string[];
  jiraIssueKeys?: string[];
  steps?: Array<{
    action: string;
    data?: string;
    expectedResult: string;
    sharedStepId?: string | null;
  }>;
}

export type UpdateCaseInput = Partial<CreateCaseInput>;

@Injectable()
export class TestCasesService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
    private readonly storageService: StorageService,
  ) {}

  private normalizeStrings(values?: string[], uppercase = false): string[] {
    if (!values) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
      const v = uppercase ? raw.trim().toUpperCase() : raw.trim();
      if (v && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
    return out;
  }

  private async getDescendantSuiteIds(projectId: string, rootSuiteId: string): Promise<string[]> {
    const allSuites = await this.dbService.db
      .select({ id: suites.id, parentId: suites.parentId })
      .from(suites)
      .where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt)));

    const ids = new Set<string>([rootSuiteId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of allSuites) {
        if (s.parentId && ids.has(s.parentId) && !ids.has(s.id)) {
          ids.add(s.id);
          changed = true;
        }
      }
    }
    return Array.from(ids);
  }

  private async buildFilterConditions(
    projectId: string,
    projectCode: string,
    filter: ListCasesFilter,
  ): Promise<SQL[]> {
    const conditions: SQL[] = [eq(testCases.projectId, projectId), isNull(testCases.deletedAt)];

    if (filter.suiteId === 'uncategorized') {
      conditions.push(isNull(testCases.suiteId));
    } else if (filter.suiteId) {
      if (filter.includeSubSuites !== false) {
        const suiteIds = await this.getDescendantSuiteIds(projectId, filter.suiteId);
        conditions.push(inArray(testCases.suiteId, suiteIds));
      } else {
        conditions.push(eq(testCases.suiteId, filter.suiteId));
      }
    }

    if (filter.priority) conditions.push(eq(testCases.priority, filter.priority));
    if (filter.severity) conditions.push(eq(testCases.severity, filter.severity));
    if (filter.type) conditions.push(eq(testCases.type, filter.type));
    if (filter.automationStatus) {
      conditions.push(eq(testCases.automationStatus, filter.automationStatus));
    }
    if (filter.status) conditions.push(eq(testCases.status, filter.status));

    if (filter.tag && filter.tag.trim()) {
      const tagValue = JSON.stringify([filter.tag.trim()]);
      conditions.push(sql`${testCases.tags} @> ${tagValue}::jsonb`);
    }

    if (filter.jiraKey && filter.jiraKey.trim()) {
      const jiraPattern = `%${filter.jiraKey.trim().toUpperCase()}%`;
      conditions.push(sql`${testCases.jiraIssueKeys}::text ILIKE ${jiraPattern}`);
    }

    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim();
      const pattern = `%${q}%`;
      const codeMatch = q.match(new RegExp(`^(?:${projectCode}-)?(\\d+)$`, 'i'));
      if (codeMatch) {
        const seq = Number.parseInt(codeMatch[1], 10);
        conditions.push(
          or(
            eq(testCases.seqNumber, seq),
            ilike(testCases.title, pattern),
            sql`${testCases.jiraIssueKeys}::text ILIKE ${pattern}`,
          )!,
        );
      } else {
        conditions.push(
          or(
            ilike(testCases.title, pattern),
            ilike(testCases.description, pattern),
            sql`${testCases.tags}::text ILIKE ${pattern}`,
            sql`${testCases.jiraIssueKeys}::text ILIKE ${pattern}`,
          )!,
        );
      }
    }

    return conditions;
  }

  async listCases(
    projectId: string,
    user: AuthUser,
    filter: ListCasesFilter,
  ): Promise<PaginatedResponse<TestCaseListItemDto>> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const page = Math.max(1, filter.page || 1);
    const pageSize = Math.min(200, Math.max(1, filter.pageSize || 50));
    const offset = (page - 1) * pageSize;

    const conditions = await this.buildFilterConditions(projectId, project.code, filter);
    const whereExpr = and(...conditions);

    const sortDir = filter.sortDir === 'desc' ? 'desc' : 'asc';
    const orderExpr = (() => {
      switch (filter.sortBy) {
        case 'title':
          return sortDir === 'desc' ? desc(testCases.title) : asc(testCases.title);
        case 'updatedAt':
          return sortDir === 'desc' ? desc(testCases.updatedAt) : asc(testCases.updatedAt);
        case 'priority':
          return sortDir === 'desc'
            ? sql`CASE ${testCases.priority} WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END DESC`
            : sql`CASE ${testCases.priority} WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END ASC`;
        case 'seqNumber':
        default:
          return sortDir === 'desc' ? desc(testCases.seqNumber) : asc(testCases.seqNumber);
      }
    })();

    const [[totalRow], rows] = await Promise.all([
      db.select({ total: count() }).from(testCases).where(whereExpr),
      db
        .select({
          caseRow: testCases,
          suiteTitle: suites.title,
        })
        .from(testCases)
        .leftJoin(suites, eq(testCases.suiteId, suites.id))
        .where(whereExpr)
        .orderBy(orderExpr, asc(testCases.seqNumber))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalRow?.total ?? 0);
    const caseIds = rows.map((r) => r.caseRow.id);

    const stepCountMap = new Map<string, number>();
    const attachmentCountMap = new Map<string, number>();

    if (caseIds.length > 0) {
      const [stepCounts, attCounts] = await Promise.all([
        db
          .select({ caseId: testSteps.testCaseId, total: count() })
          .from(testSteps)
          .where(inArray(testSteps.testCaseId, caseIds))
          .groupBy(testSteps.testCaseId),
        db
          .select({ caseId: attachments.testCaseId, total: count() })
          .from(attachments)
          .where(inArray(attachments.testCaseId, caseIds))
          .groupBy(attachments.testCaseId),
      ]);
      for (const s of stepCounts) stepCountMap.set(s.caseId, Number(s.total));
      for (const a of attCounts) attachmentCountMap.set(a.caseId, Number(a.total));
    }

    const items: TestCaseListItemDto[] = rows.map(({ caseRow, suiteTitle }) => ({
      id: caseRow.id,
      projectId: caseRow.projectId,
      suiteId: caseRow.suiteId,
      suiteTitle: suiteTitle ?? null,
      seqNumber: caseRow.seqNumber,
      code: `${project.code}-${caseRow.seqNumber}`,
      currentVersion: caseRow.currentVersion ?? 1,
      title: caseRow.title,
      priority: caseRow.priority as Priority,
      severity: caseRow.severity as Severity,
      type: caseRow.type as TestCaseType,
      automationStatus: caseRow.automationStatus as AutomationStatus,
      status: caseRow.status as TestCaseStatus,
      tags: Array.isArray(caseRow.tags) ? caseRow.tags : [],
      jiraIssueKeys: Array.isArray(caseRow.jiraIssueKeys) ? caseRow.jiraIssueKeys : [],
      position: caseRow.position,
      stepCount: stepCountMap.get(caseRow.id) ?? 0,
      attachmentCount: attachmentCountMap.get(caseRow.id) ?? 0,
      updatedAt: caseRow.updatedAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getCaseDetail(
    projectId: string,
    caseId: string,
    user: AuthUser,
  ): Promise<TestCaseDetailDto> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const [row] = await db
      .select({
        caseRow: testCases,
        suiteTitle: suites.title,
      })
      .from(testCases)
      .leftJoin(suites, and(eq(testCases.suiteId, suites.id), isNull(suites.deletedAt)))
      .where(
        and(
          eq(testCases.id, caseId),
          eq(testCases.projectId, projectId),
          isNull(testCases.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Không tìm thấy Test Case');
    }

    const [stepRows, attachmentRows, userRows, sharedRows] = await Promise.all([
      db
        .select()
        .from(testSteps)
        .where(eq(testSteps.testCaseId, caseId))
        .orderBy(asc(testSteps.stepOrder)),
      db
        .select()
        .from(attachments)
        .where(eq(attachments.testCaseId, caseId))
        .orderBy(desc(attachments.createdAt)),
      db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(
          inArray(
            users.id,
            [row.caseRow.createdBy, row.caseRow.updatedBy].filter(Boolean) as string[],
          ),
        ),
      db.select().from(sharedSteps).where(eq(sharedSteps.projectId, projectId)),
    ]);

    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));
    const sharedMap = new Map(sharedRows.map((ss) => [ss.id, ss]));

    const stepsDto: TestStepDto[] = stepRows.map((s) => {
      const ss = s.sharedStepId ? sharedMap.get(s.sharedStepId) : undefined;
      return {
        id: s.id,
        stepOrder: s.stepOrder,
        action: ss ? ss.title : s.action,
        data: ss
          ? ss.steps.map((sub, i) => `${i + 1}. ${sub.action}`).join('\n')
          : s.data,
        expectedResult: ss
          ? ss.steps.map((sub, i) => `${i + 1}. ${sub.expectedResult}`).join('\n')
          : s.expectedResult,
        sharedStepId: s.sharedStepId ?? null,
        sharedStepTitle: ss?.title ?? null,
      };
    });

    const attachmentsDto: AttachmentDto[] = attachmentRows.map((a) => ({
      id: a.id,
      testCaseId: a.testCaseId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      url: `/api/attachments/${a.id}`,
      uploadedBy: a.uploadedBy,
      createdAt: a.createdAt.toISOString(),
    }));

    const c = row.caseRow;
    return {
      id: c.id,
      projectId: c.projectId,
      suiteId: c.suiteId,
      suiteTitle: row.suiteTitle ?? null,
      seqNumber: c.seqNumber,
      code: `${project.code}-${c.seqNumber}`,
      currentVersion: c.currentVersion ?? 1,
      title: c.title,
      description: c.description,
      preconditions: c.preconditions,
      priority: c.priority as Priority,
      severity: c.severity as Severity,
      type: c.type as TestCaseType,
      automationStatus: c.automationStatus as AutomationStatus,
      status: c.status as TestCaseStatus,
      tags: Array.isArray(c.tags) ? c.tags : [],
      jiraIssueKeys: Array.isArray(c.jiraIssueKeys) ? c.jiraIssueKeys : [],
      position: c.position,
      stepCount: stepsDto.length,
      attachmentCount: attachmentsDto.length,
      steps: stepsDto,
      attachments: attachmentsDto,
      createdByName: c.createdBy ? userMap.get(c.createdBy) ?? null : null,
      updatedByName: c.updatedBy ? userMap.get(c.updatedBy) ?? null : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  private async allocateSeqNumbers(projectId: string, amount: number): Promise<number> {
    const [updated] = await this.dbService.db
      .update(projects)
      .set({ caseCounter: sql`${projects.caseCounter} + ${amount}` })
      .where(eq(projects.id, projectId))
      .returning({ caseCounter: projects.caseCounter });

    return updated.caseCounter - amount + 1;
  }

  private detailToSnapshot(detail: TestCaseDetailDto): TestCaseSnapshotDto {
    return {
      title: detail.title,
      suiteId: detail.suiteId,
      suiteTitle: detail.suiteTitle ?? null,
      description: detail.description,
      preconditions: detail.preconditions,
      priority: detail.priority,
      severity: detail.severity,
      type: detail.type,
      automationStatus: detail.automationStatus,
      status: detail.status,
      tags: detail.tags,
      jiraIssueKeys: detail.jiraIssueKeys,
      steps: detail.steps.map((s, idx) => ({
        stepOrder: idx,
        action: s.action,
        data: s.data,
        expectedResult: s.expectedResult,
      })),
    };
  }

  private async recordVersion(params: {
    projectId: string;
    testCaseId: string | null;
    caseCode: string;
    versionNumber: number;
    action: VersionAction;
    versionState: VersionState;
    summary: string;
    changes: FieldDiffDto[];
    snapshot: TestCaseSnapshotDto;
    user: AuthUser;
    markPreviousOutdated?: boolean;
  }): Promise<void> {
    const db = this.dbService.db;
    if (params.markPreviousOutdated && params.testCaseId) {
      await db
        .update(testCaseVersions)
        .set({ versionState: 'OUTDATED' })
        .where(
          and(
            eq(testCaseVersions.testCaseId, params.testCaseId),
            eq(testCaseVersions.versionState, 'ACTIVE'),
          ),
        );
    }

    await db.insert(testCaseVersions).values({
      projectId: params.projectId,
      testCaseId: params.testCaseId,
      caseCode: params.caseCode,
      versionNumber: params.versionNumber,
      action: params.action,
      versionState: params.versionState,
      summary: params.summary,
      changes: params.changes,
      snapshot: params.snapshot,
      changedBy: params.user.id,
      changedByName: params.user.fullName,
    });
  }

  private mapVersionRow(row: typeof testCaseVersions.$inferSelect): TestCaseVersionDto {
    return {
      id: row.id,
      projectId: row.projectId,
      testCaseId: row.testCaseId,
      caseCode: row.caseCode,
      versionNumber: row.versionNumber,
      action: row.action as VersionAction,
      versionState: row.versionState as VersionState,
      summary: row.summary,
      changes: Array.isArray(row.changes) ? row.changes : [],
      snapshot: row.snapshot,
      changedBy: row.changedBy,
      changedByName: row.changedByName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createCase(
    projectId: string,
    user: AuthUser,
    input: CreateCaseInput,
  ): Promise<TestCaseDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    if (input.suiteId) {
      const [suite] = await db
        .select({ id: suites.id })
        .from(suites)
        .where(
          and(
            eq(suites.id, input.suiteId),
            eq(suites.projectId, projectId),
            isNull(suites.deletedAt),
          ),
        )
        .limit(1);
      if (!suite) {
        throw new BadRequestException('Suite không tồn tại trong dự án');
      }
    }

    const seqNumber = await this.allocateSeqNumbers(projectId, 1);

    const [created] = await db
      .insert(testCases)
      .values({
        projectId,
        suiteId: input.suiteId || null,
        seqNumber,
        currentVersion: 1,
        title: input.title.trim(),
        description: input.description ?? '',
        preconditions: input.preconditions ?? '',
        priority: input.priority ?? 'MEDIUM',
        severity: input.severity ?? 'NORMAL',
        type: input.type ?? 'FUNCTIONAL',
        automationStatus: input.automationStatus ?? 'MANUAL',
        status: input.status ?? 'ACTIVE',
        tags: this.normalizeStrings(input.tags, false),
        jiraIssueKeys: this.normalizeStrings(input.jiraIssueKeys, true),
        position: seqNumber,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();

    if (input.steps && input.steps.length > 0) {
      await db.insert(testSteps).values(
        input.steps.map((s, idx) => ({
          testCaseId: created.id,
          sharedStepId: s.sharedStepId || null,
          stepOrder: idx,
          action: s.action ?? '',
          data: s.data ?? '',
          expectedResult: s.expectedResult ?? '',
        })),
      );
    }

    const detail = await this.getCaseDetail(projectId, created.id, user);
    await this.recordVersion({
      projectId,
      testCaseId: created.id,
      caseCode: detail.code,
      versionNumber: 1,
      action: 'CREATED',
      versionState: 'ACTIVE',
      summary: 'Tạo mới Test Case (v1)',
      changes: [],
      snapshot: this.detailToSnapshot(detail),
      user,
    });
    return detail;
  }

  async updateCase(
    projectId: string,
    caseId: string,
    user: AuthUser,
    input: UpdateCaseInput,
  ): Promise<TestCaseDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const beforeDetail = await this.getCaseDetail(projectId, caseId, user);
    const beforeSnapshot = this.detailToSnapshot(beforeDetail);

    if (input.suiteId) {
      const [suite] = await db
        .select({ id: suites.id })
        .from(suites)
        .where(
          and(
            eq(suites.id, input.suiteId),
            eq(suites.projectId, projectId),
            isNull(suites.deletedAt),
          ),
        )
        .limit(1);
      if (!suite) {
        throw new BadRequestException('Suite không hợp lệ');
      }
    }

    const updateData: Partial<typeof testCases.$inferInsert> = {
      updatedBy: user.id,
      updatedAt: new Date(),
    };
    if (input.suiteId !== undefined) updateData.suiteId = input.suiteId;
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description;
    if (input.preconditions !== undefined) updateData.preconditions = input.preconditions;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.severity !== undefined) updateData.severity = input.severity;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.automationStatus !== undefined) updateData.automationStatus = input.automationStatus;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.tags !== undefined) updateData.tags = this.normalizeStrings(input.tags, false);
    if (input.jiraIssueKeys !== undefined) {
      updateData.jiraIssueKeys = this.normalizeStrings(input.jiraIssueKeys, true);
    }

    await db.update(testCases).set(updateData).where(eq(testCases.id, caseId));

    if (input.steps !== undefined) {
      await db.delete(testSteps).where(eq(testSteps.testCaseId, caseId));
      if (input.steps.length > 0) {
        await db.insert(testSteps).values(
          input.steps.map((s, idx) => ({
            testCaseId: caseId,
            sharedStepId: s.sharedStepId || null,
            stepOrder: idx,
            action: s.action ?? '',
            data: s.data ?? '',
            expectedResult: s.expectedResult ?? '',
          })),
        );
      }
    }

    const afterDetail = await this.getCaseDetail(projectId, caseId, user);
    const afterSnapshot = this.detailToSnapshot(afterDetail);
    const diffs = computeSnapshotDiff(beforeSnapshot, afterSnapshot);

    if (diffs.length > 0) {
      const nextVersion = (beforeDetail.currentVersion || 1) + 1;
      await db
        .update(testCases)
        .set({ currentVersion: nextVersion })
        .where(eq(testCases.id, caseId));
      await this.recordVersion({
        projectId,
        testCaseId: caseId,
        caseCode: afterDetail.code,
        versionNumber: nextVersion,
        action: 'UPDATED',
        versionState: 'ACTIVE',
        summary: buildDiffSummary(diffs, nextVersion),
        changes: diffs,
        snapshot: afterSnapshot,
        user,
        markPreviousOutdated: true,
      });
      afterDetail.currentVersion = nextVersion;
    }

    return afterDetail;
  }

  async deleteCase(projectId: string, caseId: string, user: AuthUser): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const beforeDetail = await this.getCaseDetail(projectId, caseId, user);
    const beforeSnapshot = this.detailToSnapshot(beforeDetail);

    await this.recordVersion({
      projectId,
      testCaseId: caseId,
      caseCode: beforeDetail.code,
      versionNumber: (beforeDetail.currentVersion || 1) + 1,
      action: 'DELETED',
      versionState: 'DELETED',
      summary: `Chuyển vào Thùng rác "${beforeDetail.title}"`,
      changes: [],
      snapshot: beforeSnapshot,
      user,
      markPreviousOutdated: true,
    });

    const now = new Date();
    await db
      .update(testCases)
      .set({ deletedAt: now, deletedBy: user.id, updatedAt: now })
      .where(and(eq(testCases.id, caseId), eq(testCases.projectId, projectId)));

    return { deleted: true };
  }

  async listCaseVersions(
    projectId: string,
    caseId: string,
    user: AuthUser,
  ): Promise<TestCaseVersionDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const rows = await this.dbService.db
      .select()
      .from(testCaseVersions)
      .where(
        and(
          eq(testCaseVersions.projectId, projectId),
          eq(testCaseVersions.testCaseId, caseId),
        ),
      )
      .orderBy(desc(testCaseVersions.versionNumber));

    return rows.map((r) => this.mapVersionRow(r));
  }

  async listVersionsByCaseCode(
    projectId: string,
    caseCode: string,
    user: AuthUser,
  ): Promise<TestCaseVersionDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const rows = await this.dbService.db
      .select()
      .from(testCaseVersions)
      .where(
        and(
          eq(testCaseVersions.projectId, projectId),
          eq(testCaseVersions.caseCode, caseCode.trim().toUpperCase()),
        ),
      )
      .orderBy(desc(testCaseVersions.versionNumber));

    return rows.map((r) => this.mapVersionRow(r));
  }

  async restoreCaseVersion(
    projectId: string,
    caseId: string,
    versionId: string,
    user: AuthUser,
  ): Promise<TestCaseDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [targetVer] = await db
      .select()
      .from(testCaseVersions)
      .where(
        and(
          eq(testCaseVersions.id, versionId),
          eq(testCaseVersions.projectId, projectId),
          eq(testCaseVersions.testCaseId, caseId),
        ),
      )
      .limit(1);

    if (!targetVer) {
      throw new NotFoundException('Không tìm thấy phiên bản Test Case');
    }

    const beforeDetail = await this.getCaseDetail(projectId, caseId, user);
    const beforeSnapshot = this.detailToSnapshot(beforeDetail);
    const snap = targetVer.snapshot;

    // Validate suiteId still exists (fallback to null if suite was deleted)
    let targetSuiteId: string | null = snap.suiteId ?? null;
    if (targetSuiteId) {
      const [suiteExists] = await db
        .select({ id: suites.id })
        .from(suites)
        .where(
          and(
            eq(suites.id, targetSuiteId),
            eq(suites.projectId, projectId),
            isNull(suites.deletedAt),
          ),
        )
        .limit(1);
      if (!suiteExists) targetSuiteId = null;
    }

    const nextVersion = (beforeDetail.currentVersion || 1) + 1;
    await db
      .update(testCases)
      .set({
        suiteId: targetSuiteId,
        title: snap.title,
        description: snap.description,
        preconditions: snap.preconditions,
        priority: snap.priority,
        severity: snap.severity,
        type: snap.type,
        automationStatus: snap.automationStatus,
        status: snap.status,
        tags: snap.tags ?? [],
        jiraIssueKeys: snap.jiraIssueKeys ?? [],
        currentVersion: nextVersion,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(testCases.id, caseId));

    await db.delete(testSteps).where(eq(testSteps.testCaseId, caseId));
    if (snap.steps && snap.steps.length > 0) {
      await db.insert(testSteps).values(
        snap.steps.map((s, idx) => ({
          testCaseId: caseId,
          stepOrder: idx,
          action: s.action ?? '',
          data: s.data ?? '',
          expectedResult: s.expectedResult ?? '',
        })),
      );
    }

    const afterDetail = await this.getCaseDetail(projectId, caseId, user);
    const afterSnapshot = this.detailToSnapshot(afterDetail);
    const diffs = computeSnapshotDiff(beforeSnapshot, afterSnapshot);

    await this.recordVersion({
      projectId,
      testCaseId: caseId,
      caseCode: afterDetail.code,
      versionNumber: nextVersion,
      action: 'RESTORED',
      versionState: 'ACTIVE',
      summary: `Khôi phục từ phiên bản v${targetVer.versionNumber} → v${nextVersion}`,
      changes: diffs,
      snapshot: afterSnapshot,
      user,
      markPreviousOutdated: true,
    });

    return afterDetail;
  }

  async listProjectHistory(
    projectId: string,
    user: AuthUser,
    filter: {
      search?: string;
      action?: VersionAction;
      versionState?: VersionState;
      page?: number;
      pageSize?: number;
    },
  ): Promise<PaginatedResponse<TestCaseVersionDto>> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const page = Math.max(1, filter.page || 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize || 30));
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [eq(testCaseVersions.projectId, projectId)];
    if (filter.action) {
      conditions.push(eq(testCaseVersions.action, filter.action));
    }
    if (filter.versionState) {
      conditions.push(eq(testCaseVersions.versionState, filter.versionState));
    }
    if (filter.search && filter.search.trim()) {
      const pattern = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(testCaseVersions.caseCode, pattern),
          ilike(testCaseVersions.summary, pattern),
          ilike(testCaseVersions.changedByName, pattern),
          sql`${testCaseVersions.snapshot}->>'title' ILIKE ${pattern}`,
        )!,
      );
    }

    const whereExpr = and(...conditions);
    const [[totalRow], rows] = await Promise.all([
      db.select({ total: count() }).from(testCaseVersions).where(whereExpr),
      db
        .select()
        .from(testCaseVersions)
        .where(whereExpr)
        .orderBy(desc(testCaseVersions.createdAt), desc(testCaseVersions.versionNumber))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.map((r) => this.mapVersionRow(r)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async bulkAction(
    projectId: string,
    user: AuthUser,
    input: {
      action: BulkActionType;
      caseIds: string[];
      suiteId?: string | null;
      priority?: Priority;
      automationStatus?: AutomationStatus;
      status?: TestCaseStatus;
    },
  ): Promise<{ affected: number }> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    if (input.caseIds.length === 0) {
      throw new BadRequestException('Chưa chọn test case nào');
    }

    const baseWhere = and(
      eq(testCases.projectId, projectId),
      isNull(testCases.deletedAt),
      inArray(testCases.id, input.caseIds),
    );

    if (input.action === 'DELETE') {
      const targetCases = await db.select().from(testCases).where(baseWhere);
      for (const tc of targetCases) {
        const detail = await this.getCaseDetail(projectId, tc.id, user);
        await this.recordVersion({
          projectId,
          testCaseId: tc.id,
          caseCode: detail.code,
          versionNumber: (detail.currentVersion || 1) + 1,
          action: 'DELETED',
          versionState: 'DELETED',
          summary: `Chuyển hàng loạt vào Thùng rác "${detail.title}"`,
          changes: [],
          snapshot: this.detailToSnapshot(detail),
          user,
          markPreviousOutdated: true,
        });
      }
      const now = new Date();
      const deleted = await db
        .update(testCases)
        .set({ deletedAt: now, deletedBy: user.id, updatedAt: now })
        .where(baseWhere)
        .returning({ id: testCases.id });
      return { affected: deleted.length };
    }

    if (
      input.action === 'MOVE' ||
      input.action === 'UPDATE_PRIORITY' ||
      input.action === 'UPDATE_AUTOMATION' ||
      input.action === 'UPDATE_STATUS'
    ) {
      if (input.action === 'MOVE' && input.suiteId) {
        const [suite] = await db
          .select({ id: suites.id })
          .from(suites)
          .where(
            and(
              eq(suites.id, input.suiteId),
              eq(suites.projectId, projectId),
              isNull(suites.deletedAt),
            ),
          )
          .limit(1);
        if (!suite) throw new BadRequestException('Suite đích không tồn tại');
      }
      if (input.action === 'UPDATE_PRIORITY' && !input.priority) {
        throw new BadRequestException('Thiếu giá trị Priority');
      }
      if (input.action === 'UPDATE_AUTOMATION' && !input.automationStatus) {
        throw new BadRequestException('Thiếu Automation Status');
      }
      if (input.action === 'UPDATE_STATUS' && !input.status) {
        throw new BadRequestException('Thiếu Status');
      }

      const targetCases = await db.select().from(testCases).where(baseWhere);
      let affected = 0;

      for (const tc of targetCases) {
        const beforeDetail = await this.getCaseDetail(projectId, tc.id, user);
        const beforeSnapshot = this.detailToSnapshot(beforeDetail);

        const updatePayload: Partial<typeof testCases.$inferInsert> = {
          updatedBy: user.id,
          updatedAt: new Date(),
        };
        if (input.action === 'MOVE') updatePayload.suiteId = input.suiteId ?? null;
        if (input.action === 'UPDATE_PRIORITY') updatePayload.priority = input.priority;
        if (input.action === 'UPDATE_AUTOMATION') {
          updatePayload.automationStatus = input.automationStatus;
        }
        if (input.action === 'UPDATE_STATUS') updatePayload.status = input.status;

        await db.update(testCases).set(updatePayload).where(eq(testCases.id, tc.id));

        const afterDetail = await this.getCaseDetail(projectId, tc.id, user);
        const afterSnapshot = this.detailToSnapshot(afterDetail);
        const diffs = computeSnapshotDiff(beforeSnapshot, afterSnapshot);

        if (diffs.length > 0) {
          const nextVer = (beforeDetail.currentVersion || 1) + 1;
          await db
            .update(testCases)
            .set({ currentVersion: nextVer })
            .where(eq(testCases.id, tc.id));
          await this.recordVersion({
            projectId,
            testCaseId: tc.id,
            caseCode: `${project.code}-${tc.seqNumber}`,
            versionNumber: nextVer,
            action: 'BULK_UPDATED',
            versionState: 'ACTIVE',
            summary: `[Hàng loạt] ${buildDiffSummary(diffs, nextVer)}`,
            changes: diffs,
            snapshot: afterSnapshot,
            user,
            markPreviousOutdated: true,
          });
        }
        affected++;
      }
      return { affected };
    }

    if (input.action === 'CLONE') {
      const sourceCases = await db.select().from(testCases).where(baseWhere);
      if (sourceCases.length === 0) return { affected: 0 };

      const sourceSteps = await db
        .select()
        .from(testSteps)
        .where(
          inArray(
            testSteps.testCaseId,
            sourceCases.map((c) => c.id),
          ),
        )
        .orderBy(asc(testSteps.stepOrder));

      const stepsByCase = new Map<string, typeof sourceSteps>();
      for (const s of sourceSteps) {
        const list = stepsByCase.get(s.testCaseId) ?? [];
        list.push(s);
        stepsByCase.set(s.testCaseId, list);
      }

      let nextSeq = await this.allocateSeqNumbers(projectId, sourceCases.length);
      for (const src of sourceCases) {
        const [cloned] = await db
          .insert(testCases)
          .values({
            projectId,
            suiteId: input.suiteId !== undefined ? input.suiteId : src.suiteId,
            seqNumber: nextSeq++,
            currentVersion: 1,
            title: `${src.title} (Copy)`,
            description: src.description,
            preconditions: src.preconditions,
            priority: src.priority,
            severity: src.severity,
            type: src.type,
            automationStatus: src.automationStatus,
            status: src.status,
            tags: src.tags,
            jiraIssueKeys: src.jiraIssueKeys,
            position: nextSeq,
            createdBy: user.id,
            updatedBy: user.id,
          })
          .returning();

        const steps = stepsByCase.get(src.id) ?? [];
        if (steps.length > 0) {
          await db.insert(testSteps).values(
            steps.map((s, idx) => ({
              testCaseId: cloned.id,
              sharedStepId: s.sharedStepId || null,
              stepOrder: idx,
              action: s.action,
              data: s.data,
              expectedResult: s.expectedResult,
            })),
          );
        }

        const clonedDetail = await this.getCaseDetail(projectId, cloned.id, user);
        await this.recordVersion({
          projectId,
          testCaseId: cloned.id,
          caseCode: clonedDetail.code,
          versionNumber: 1,
          action: 'CLONED',
          versionState: 'ACTIVE',
          summary: `Nhân bản từ ${project.code}-${src.seqNumber} (v1)`,
          changes: [],
          snapshot: this.detailToSnapshot(clonedDetail),
          user,
        });
      }
      return { affected: sourceCases.length };
    }

    throw new BadRequestException('Hành động không được hỗ trợ');
  }

  async copyCasesToProject(
    sourceProjectId: string,
    user: AuthUser,
    input: {
      caseIds: string[];
      targetProjectId: string;
      targetSuiteId?: string | null;
    },
  ): Promise<{
    copiedCount: number;
    targetProjectId: string;
    targetProjectName: string;
    targetProjectCode: string;
    createdCases: Array<{ id: string; code: string; title: string }>;
  }> {
    // 1. Verify read access on source project and edit access on target project
    await this.projectAccess.verifyAccess(sourceProjectId, user, 'view');
    await this.projectAccess.verifyAccess(input.targetProjectId, user, 'edit');

    const db = this.dbService.db;

    const [sourceProject] = await db
      .select({ id: projects.id, code: projects.code, name: projects.name })
      .from(projects)
      .where(eq(projects.id, sourceProjectId))
      .limit(1);
    if (!sourceProject) throw new NotFoundException('Không tìm thấy dự án nguồn');

    const [targetProject] = await db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        isArchived: projects.isArchived,
      })
      .from(projects)
      .where(eq(projects.id, input.targetProjectId))
      .limit(1);
    if (!targetProject) throw new NotFoundException('Không tìm thấy dự án đích');
    if (targetProject.isArchived) {
      throw new BadRequestException('Không thể nhân bản vào dự án đã lưu trữ (Archived)');
    }

    const targetSuiteId = input.targetSuiteId || null;
    if (targetSuiteId) {
      const [ts] = await db
        .select({ id: suites.id })
        .from(suites)
        .where(and(eq(suites.id, targetSuiteId), eq(suites.projectId, input.targetProjectId)))
        .limit(1);
      if (!ts) {
        throw new BadRequestException('Suite đích không tồn tại trong dự án đích');
      }
    }

    const uniqueIds = Array.from(new Set(input.caseIds));
    const sourceCases = await db
      .select()
      .from(testCases)
      .where(
        and(
          eq(testCases.projectId, sourceProjectId),
          inArray(testCases.id, uniqueIds),
          isNull(testCases.deletedAt),
        ),
      )
      .orderBy(asc(testCases.seqNumber));

    if (sourceCases.length === 0) {
      throw new NotFoundException('Không tìm thấy Test Case hợp lệ để nhân bản');
    }

    const isCrossProject = sourceProjectId !== input.targetProjectId;
    const allSteps = await db
      .select()
      .from(testSteps)
      .where(inArray(testSteps.testCaseId, sourceCases.map((c) => c.id)))
      .orderBy(asc(testSteps.stepOrder));

    const stepsByCase = new Map<string, (typeof allSteps)[number][]>();
    for (const s of allSteps) {
      const list = stepsByCase.get(s.testCaseId) ?? [];
      list.push(s);
      stepsByCase.set(s.testCaseId, list);
    }

    // If copying across projects, expand any referenced shared steps into plain concrete steps
    // so there are no broken cross-project shared_step_id references.
    const sharedStepMap = new Map<
      string,
      Array<{ action: string; data: string; expectedResult: string }>
    >();
    if (isCrossProject) {
      const sharedIds = Array.from(
        new Set(allSteps.map((s) => s.sharedStepId).filter((id): id is string => Boolean(id))),
      );
      if (sharedIds.length > 0) {
        const rows = await db
          .select({ id: sharedSteps.id, steps: sharedSteps.steps })
          .from(sharedSteps)
          .where(inArray(sharedSteps.id, sharedIds));
        for (const r of rows) {
          sharedStepMap.set(
            r.id,
            Array.isArray(r.steps)
              ? r.steps.map((st) => ({
                  action: st.action ?? '',
                  data: st.data ?? '',
                  expectedResult: st.expectedResult ?? '',
                }))
              : [],
          );
        }
      }
    }

    let nextSeq = await this.allocateSeqNumbers(input.targetProjectId, sourceCases.length);
    const createdCases: Array<{ id: string; code: string; title: string }> = [];

    for (const src of sourceCases) {
      const assignedSeq = nextSeq++;
      const title = isCrossProject ? src.title : `${src.title} (Copy)`;

      const [cloned] = await db
        .insert(testCases)
        .values({
          projectId: input.targetProjectId,
          suiteId: targetSuiteId,
          seqNumber: assignedSeq,
          currentVersion: 1,
          title,
          description: src.description,
          preconditions: src.preconditions,
          priority: src.priority,
          severity: src.severity,
          type: src.type,
          automationStatus: src.automationStatus,
          status: src.status,
          tags: src.tags ?? [],
          jiraIssueKeys: src.jiraIssueKeys ?? [],
          position: assignedSeq,
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning();

      const srcSteps = stepsByCase.get(src.id) ?? [];
      const insertSteps: Array<{
        testCaseId: string;
        sharedStepId: string | null;
        stepOrder: number;
        action: string;
        data: string;
        expectedResult: string;
      }> = [];

      let order = 0;
      for (const s of srcSteps) {
        if (isCrossProject && s.sharedStepId) {
          const expanded = sharedStepMap.get(s.sharedStepId);
          if (expanded && expanded.length > 0) {
            for (const sub of expanded) {
              insertSteps.push({
                testCaseId: cloned.id,
                sharedStepId: null,
                stepOrder: order++,
                action: sub.action,
                data: sub.data,
                expectedResult: sub.expectedResult,
              });
            }
          } else {
            insertSteps.push({
              testCaseId: cloned.id,
              sharedStepId: null,
              stepOrder: order++,
              action: s.action,
              data: s.data ?? '',
              expectedResult: s.expectedResult ?? '',
            });
          }
        } else {
          insertSteps.push({
            testCaseId: cloned.id,
            sharedStepId: s.sharedStepId || null,
            stepOrder: order++,
            action: s.action,
            data: s.data ?? '',
            expectedResult: s.expectedResult ?? '',
          });
        }
      }

      if (insertSteps.length > 0) {
        await db.insert(testSteps).values(insertSteps);
      }

      const clonedDetail = await this.getCaseDetail(input.targetProjectId, cloned.id, user);
      await this.recordVersion({
        projectId: input.targetProjectId,
        testCaseId: cloned.id,
        caseCode: clonedDetail.code,
        versionNumber: 1,
        action: 'CLONED',
        versionState: 'ACTIVE',
        summary: isCrossProject
          ? `Nhân bản từ dự án ${sourceProject.code} (${sourceProject.code}-${src.seqNumber})`
          : `Nhân bản từ ${sourceProject.code}-${src.seqNumber} (v1)`,
        changes: [],
        snapshot: this.detailToSnapshot(clonedDetail),
        user,
      });

      createdCases.push({
        id: cloned.id,
        code: clonedDetail.code,
        title: cloned.title,
      });
    }

    return {
      copiedCount: createdCases.length,
      targetProjectId: targetProject.id,
      targetProjectName: targetProject.name,
      targetProjectCode: targetProject.code,
      createdCases,
    };
  }

  async uploadAttachment(
    projectId: string,
    caseId: string,
    user: AuthUser,
    file: Express.Multer.File,
  ): Promise<AttachmentDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [tc] = await db
      .select({ id: testCases.id })
      .from(testCases)
      .where(
        and(
          eq(testCases.id, caseId),
          eq(testCases.projectId, projectId),
          isNull(testCases.deletedAt),
        ),
      )
      .limit(1);

    if (!tc) throw new NotFoundException('Không tìm thấy Test Case');

    const safeMimeType = this.storageService.validateUploadFile(file.originalname, file.mimetype);
    const storageKey = this.storageService.saveBuffer(file.originalname, file.buffer);
    const [created] = await db
      .insert(attachments)
      .values({
        testCaseId: caseId,
        fileName: file.originalname,
        mimeType: safeMimeType,
        fileSize: file.size,
        storageKey,
        uploadedBy: user.id,
      })
      .returning();

    return {
      id: created.id,
      testCaseId: created.testCaseId,
      fileName: created.fileName,
      mimeType: created.mimeType,
      fileSize: created.fileSize,
      url: `/api/attachments/${created.id}`,
      uploadedBy: created.uploadedBy,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async getAttachmentForDownload(attachmentId: string, user: AuthUser) {
    const db = this.dbService.db;
    const [row] = await db
      .select({
        attachment: attachments,
        projectId: testCases.projectId,
      })
      .from(attachments)
      .innerJoin(testCases, eq(attachments.testCaseId, testCases.id))
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!row) throw new NotFoundException('Không tìm thấy tệp đính kèm');
    await this.projectAccess.verifyAccess(row.projectId, user, 'view');

    const filePath = this.storageService.getFilePath(row.attachment.storageKey);
    if (!filePath) throw new NotFoundException('Tệp không tồn tại trên ổ đĩa');

    return { attachment: row.attachment, filePath };
  }

  async deleteAttachment(attachmentId: string, user: AuthUser): Promise<{ deleted: boolean }> {
    const db = this.dbService.db;
    const [row] = await db
      .select({
        attachment: attachments,
        projectId: testCases.projectId,
      })
      .from(attachments)
      .innerJoin(testCases, eq(attachments.testCaseId, testCases.id))
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!row) throw new NotFoundException('Không tìm thấy tệp đính kèm');
    await this.projectAccess.verifyAccess(row.projectId, user, 'edit');

    await db.delete(attachments).where(eq(attachments.id, attachmentId));
    this.storageService.deleteFile(row.attachment.storageKey);
    return { deleted: true };
  }

  async downloadTemplateExcel(
    projectId: string,
    user: AuthUser,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const buffer = await getCleanVikkiTemplateBuffer();

    return {
      fileName: `Vikki-Template-Test-Execution.xlsx`,
      buffer,
    };
  }

  async exportExcel(
    projectId: string,
    user: AuthUser,
    filter: ListCasesFilter,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const conditions = await this.buildFilterConditions(projectId, project.code, filter);
    const [allSuites, caseRows, [jira], sharedStepRows] = await Promise.all([
      db.select().from(suites).where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt))),
      db
        .select()
        .from(testCases)
        .where(and(...conditions))
        .orderBy(asc(testCases.suiteId), asc(testCases.seqNumber)),
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
      db.select().from(sharedSteps).where(eq(sharedSteps.projectId, projectId)),
    ]);

    const suiteMap = new Map(allSuites.map((s) => [s.id, s]));
    const getSuitePathArr = (suiteId: string | null): string[] => {
      if (!suiteId) return [];
      const parts: string[] = [];
      let cur: string | null = suiteId;
      let guard = 0;
      while (cur && suiteMap.has(cur) && guard < 20) {
        const s: typeof suites.$inferSelect = suiteMap.get(cur)!;
        parts.unshift(s.title);
        cur = s.parentId;
        guard++;
      }
      return parts;
    };

    const caseIds = caseRows.map((c) => c.id);
    const creatorIds = Array.from(
      new Set(caseRows.map((c) => c.createdBy).filter(Boolean) as string[]),
    );

    const [stepRows, userRows] = await Promise.all([
      caseIds.length > 0
        ? db
            .select()
            .from(testSteps)
            .where(inArray(testSteps.testCaseId, caseIds))
            .orderBy(asc(testSteps.stepOrder))
        : Promise.resolve([]),
      creatorIds.length > 0
        ? db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, creatorIds))
        : Promise.resolve([]),
    ]);

    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));
    const stepsByCase = this.expandStepsByCase(stepRows, sharedStepRows);

    const exportItems: ExportableCaseItem[] = caseRows.map((c) => ({
      code: `${project.code}-${c.seqNumber}`,
      suitePath: getSuitePathArr(c.suiteId),
      title: c.title,
      steps: (stepsByCase.get(c.id) ?? []).map((s) => ({
        action: s.action,
        data: s.data,
        expectedResult: s.expectedResult,
      })),
      preconditions: c.preconditions,
      description: c.description,
      priority: c.priority as Priority,
      severity: c.severity as Severity,
      type: c.type as TestCaseType,
      automationStatus: c.automationStatus as AutomationStatus,
      status: c.status as TestCaseStatus,
      tags: Array.isArray(c.tags) ? c.tags : [],
      jiraIssueKeys: Array.isArray(c.jiraIssueKeys) ? c.jiraIssueKeys : [],
      createdByName: c.createdBy ? userMap.get(c.createdBy) ?? '' : '',
    }));

    // Sort by suitePath so identical suites group together cleanly
    exportItems.sort((a, b) => a.suitePath.join(' / ').localeCompare(b.suitePath.join(' / ')));

    const selectedSuiteName =
      filter.suiteId && filter.suiteId !== 'uncategorized'
        ? suiteMap.get(filter.suiteId)?.title
        : undefined;

    const docLink =
      jira?.config?.baseUrl && jira?.config?.projectKey
        ? `${jira.config.baseUrl.replace(/\/+$/, '')}/projects/${jira.config.projectKey}`
        : undefined;

    const buffer = await buildVikkiExcelExportBuffer({
      projectCode: project.code,
      projectName: project.name,
      projectDescription: project.description,
      featureName: selectedSuiteName,
      docLink,
      cases: exportItems,
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    return {
      fileName: `Vikki-${project.code}-Test-Execution-${dateStr}.xlsx`,
      buffer,
    };
  }

  async exportCsv(projectId: string, user: AuthUser, filter: ListCasesFilter): Promise<{
    fileName: string;
    csv: string;
  }> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const conditions = await this.buildFilterConditions(projectId, project.code, filter);
    const [allSuites, caseRows, sharedStepRows] = await Promise.all([
      db.select().from(suites).where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt))),
      db
        .select()
        .from(testCases)
        .where(and(...conditions))
        .orderBy(asc(testCases.seqNumber)),
      db.select().from(sharedSteps).where(eq(sharedSteps.projectId, projectId)),
    ]);

    const suiteMap = new Map(allSuites.map((s) => [s.id, s]));
    const getSuitePath = (suiteId: string | null): string => {
      if (!suiteId) return '';
      const parts: string[] = [];
      let cur: string | null = suiteId;
      let guard = 0;
      while (cur && suiteMap.has(cur) && guard < 20) {
        const s: typeof suites.$inferSelect = suiteMap.get(cur)!;
        parts.unshift(s.title);
        cur = s.parentId;
        guard++;
      }
      return parts.join(' / ');
    };

    const caseIds = caseRows.map((c) => c.id);
    const stepRows =
      caseIds.length > 0
        ? await db
            .select()
            .from(testSteps)
            .where(inArray(testSteps.testCaseId, caseIds))
            .orderBy(asc(testSteps.stepOrder))
        : [];
    const stepsByCase = this.expandStepsByCase(stepRows, sharedStepRows);

    const headers = [
      'Code',
      'Suite',
      'Title',
      'Priority',
      'Severity',
      'Type',
      'Automation',
      'Status',
      'Tags',
      'Jira Keys',
      'Preconditions',
      'Description',
      'Steps',
    ];

    const rows = caseRows.map((c) => {
      const steps = stepsByCase.get(c.id) ?? [];
      const stepsStr = steps
        .map(
          (s, idx) =>
            `${idx + 1}. ${s.action}${s.data ? ` [Data: ${s.data}]` : ''} => ${s.expectedResult}`,
        )
        .join('\n');

      return [
        `${project.code}-${c.seqNumber}`,
        getSuitePath(c.suiteId),
        c.title,
        c.priority,
        c.severity,
        c.type,
        c.automationStatus,
        c.status,
        (c.tags || []).join(', '),
        (c.jiraIssueKeys || []).join(', '),
        c.preconditions,
        c.description,
        stepsStr,
      ];
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    return {
      fileName: `${project.code.toLowerCase()}-test-cases-${dateStr}.csv`,
      csv: toCsv(headers, rows),
    };
  }

  /** Expands linked Shared Steps inline for Excel / CSV export rows. */
  private expandStepsByCase(
    stepRows: Array<typeof testSteps.$inferSelect>,
    sharedStepRows: Array<typeof sharedSteps.$inferSelect>,
  ): Map<string, Array<{ action: string; data: string; expectedResult: string }>> {
    const sharedStepMap = new Map(sharedStepRows.map((ss) => [ss.id, ss]));
    const stepsByCase = new Map<
      string,
      Array<{ action: string; data: string; expectedResult: string }>
    >();
    for (const s of stepRows) {
      const list = stepsByCase.get(s.testCaseId) ?? [];
      if (s.sharedStepId && sharedStepMap.has(s.sharedStepId)) {
        const ss = sharedStepMap.get(s.sharedStepId)!;
        for (const sub of ss.steps) {
          list.push({ action: sub.action, data: sub.data, expectedResult: sub.expectedResult });
        }
      } else {
        list.push({ action: s.action, data: s.data, expectedResult: s.expectedResult });
      }
      stepsByCase.set(s.testCaseId, list);
    }
    return stepsByCase;
  }

  async importFile(
    projectId: string,
    user: AuthUser,
    buffer: Buffer,
    fileName: string,
  ): Promise<{ imported: number; createdSuites: number; skipped: number }> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const { cases: parsedCases, skipped } = await parseVikkiOrGenericImport(buffer, fileName);
    if (parsedCases.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy dòng Test Case hợp lệ. Hãy dùng đúng file mẫu Vikki (.xlsx) hoặc CSV có cột "Testcase ID" / "Tên testcase".',
      );
    }

    // Load existing suites to match or auto-create suite paths ("Feature / Functional")
    const existingSuites = await db
      .select()
      .from(suites)
      .where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt)));

    const suiteKeyToId = new Map<string, string>();
    for (const s of existingSuites) {
      suiteKeyToId.set(`${s.parentId || 'ROOT'}::${s.title.toLowerCase()}`, s.id);
    }

    let createdSuites = 0;
    const ensureSuitePath = async (segments: string[]): Promise<string | null> => {
      const cleanSegments = segments.map((p) => p.trim()).filter(Boolean);
      if (cleanSegments.length === 0) return null;
      let parentId: string | null = null;
      for (const segment of cleanSegments) {
        const key = `${parentId || 'ROOT'}::${segment.toLowerCase()}`;
        let foundId: string | undefined = suiteKeyToId.get(key);
        if (!foundId) {
          const [created]: Array<typeof suites.$inferSelect> = await db
            .insert(suites)
            .values({
              projectId,
              parentId,
              title: segment.slice(0, 255),
              position: suiteKeyToId.size,
            })
            .returning();
          foundId = created.id;
          suiteKeyToId.set(key, foundId);
          createdSuites += 1;
        }
        parentId = foundId;
      }
      return parentId;
    };

    let nextSeq = await this.allocateSeqNumbers(projectId, parsedCases.length);

    for (const item of parsedCases) {
      const suiteId = await ensureSuitePath(item.suiteSegments);
      const [created] = await db
        .insert(testCases)
        .values({
          projectId,
          suiteId,
          seqNumber: nextSeq++,
          title: item.title.slice(0, 500),
          description: item.description,
          preconditions: item.preconditions,
          priority: item.priority,
          severity: item.severity,
          type: item.type,
          automationStatus: item.automationStatus,
          status: item.status,
          tags: this.normalizeStrings(item.tags, false),
          jiraIssueKeys: this.normalizeStrings(item.jiraIssueKeys, true),
          position: nextSeq,
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning();

      if (item.steps.length > 0) {
        await db.insert(testSteps).values(
          item.steps.map((s, idx) => ({
            testCaseId: created.id,
            stepOrder: idx,
            action: s.action,
            data: s.data,
            expectedResult: s.expectedResult,
          })),
        );
      }

      await this.recordVersion({
        projectId,
        testCaseId: created.id,
        caseCode: `${project.code}-${created.seqNumber}`,
        versionNumber: 1,
        action: 'IMPORTED',
        versionState: 'ACTIVE',
        summary: `Import từ file "${fileName}" (v1)`,
        changes: [],
        snapshot: {
          title: created.title,
          suiteId: created.suiteId,
          suiteTitle: item.suiteSegments[item.suiteSegments.length - 1] ?? null,
          description: created.description,
          preconditions: created.preconditions,
          priority: created.priority as Priority,
          severity: created.severity as Severity,
          type: created.type as TestCaseType,
          automationStatus: created.automationStatus as AutomationStatus,
          status: created.status as TestCaseStatus,
          tags: Array.isArray(created.tags) ? created.tags : [],
          jiraIssueKeys: Array.isArray(created.jiraIssueKeys) ? created.jiraIssueKeys : [],
          steps: item.steps.map((s, idx) => ({
            stepOrder: idx,
            action: s.action,
            data: s.data,
            expectedResult: s.expectedResult,
          })),
        },
        user,
      });
    }

    return { imported: parsedCases.length, createdSuites, skipped };
  }

  // ==================== TRASH & SOFT-DELETE RESTORE ====================

  async listTrash(projectId: string, user: AuthUser): Promise<TrashItemDto[]> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [deletedCases, deletedSuites] = await Promise.all([
      db
        .select()
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNotNull(testCases.deletedAt)))
        .orderBy(desc(testCases.deletedAt)),
      db
        .select()
        .from(suites)
        .where(and(eq(suites.projectId, projectId), isNotNull(suites.deletedAt)))
        .orderBy(desc(suites.deletedAt)),
    ]);

    const userIds = Array.from(
      new Set([
        ...deletedCases.map((c) => c.deletedBy).filter(Boolean),
        ...deletedSuites.map((s) => s.deletedBy).filter(Boolean),
      ] as string[]),
    );
    const suiteIds = Array.from(
      new Set(deletedCases.map((c) => c.suiteId).filter(Boolean) as string[]),
    );
    const caseIds = deletedCases.map((c) => c.id);

    const [userRows, suiteRows, stepCounts] = await Promise.all([
      userIds.length > 0
        ? db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, userIds))
        : Promise.resolve([]),
      suiteIds.length > 0
        ? db
            .select({ id: suites.id, title: suites.title })
            .from(suites)
            .where(inArray(suites.id, suiteIds))
        : Promise.resolve([]),
      caseIds.length > 0
        ? db
            .select({ caseId: testSteps.testCaseId, total: count() })
            .from(testSteps)
            .where(inArray(testSteps.testCaseId, caseIds))
            .groupBy(testSteps.testCaseId)
        : Promise.resolve([]),
    ]);

    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));
    const suiteMap = new Map(suiteRows.map((s) => [s.id, s.title]));
    const stepMap = new Map(stepCounts.map((s) => [s.caseId, Number(s.total)]));

    const items: TrashItemDto[] = [
      ...deletedSuites.map((s) => ({
        kind: 'SUITE' as const,
        id: s.id,
        title: s.title,
        deletedByName: s.deletedBy ? userMap.get(s.deletedBy) ?? null : null,
        deletedAt: s.deletedAt!.toISOString(),
      })),
      ...deletedCases.map((c) => ({
        kind: 'CASE' as const,
        id: c.id,
        code: `${project.code}-${c.seqNumber}`,
        title: c.title,
        suiteTitle: c.suiteId ? suiteMap.get(c.suiteId) ?? null : null,
        stepCount: stepMap.get(c.id) ?? 0,
        deletedByName: c.deletedBy ? userMap.get(c.deletedBy) ?? null : null,
        deletedAt: c.deletedAt!.toISOString(),
      })),
    ];

    items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    return items;
  }

  async restoreCaseFromTrash(
    projectId: string,
    caseId: string,
    user: AuthUser,
  ): Promise<TestCaseDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [tc] = await db
      .select()
      .from(testCases)
      .where(
        and(
          eq(testCases.id, caseId),
          eq(testCases.projectId, projectId),
          isNotNull(testCases.deletedAt),
        ),
      )
      .limit(1);

    if (!tc) throw new NotFoundException('Không tìm thấy Test Case trong thùng rác');

    let nextSuiteId = tc.suiteId;
    if (nextSuiteId) {
      const [parentSuite] = await db
        .select({ id: suites.id, deletedAt: suites.deletedAt })
        .from(suites)
        .where(eq(suites.id, nextSuiteId))
        .limit(1);
      if (!parentSuite || parentSuite.deletedAt) {
        nextSuiteId = null;
      }
    }

    const nextVer = (tc.currentVersion || 1) + 1;
    await db
      .update(testCases)
      .set({
        deletedAt: null,
        deletedBy: null,
        suiteId: nextSuiteId,
        currentVersion: nextVer,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(testCases.id, caseId));

    const detail = await this.getCaseDetail(projectId, caseId, user);
    await this.recordVersion({
      projectId,
      testCaseId: caseId,
      caseCode: detail.code,
      versionNumber: nextVer,
      action: 'RESTORED',
      versionState: 'ACTIVE',
      summary: `Khôi phục từ Thùng rác (v${nextVer})`,
      changes: [],
      snapshot: this.detailToSnapshot(detail),
      user,
      markPreviousOutdated: true,
    });
    return detail;
  }

  async permanentlyDeleteCase(
    projectId: string,
    caseId: string,
    user: AuthUser,
  ): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;

    const attRows = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(eq(attachments.testCaseId, caseId));

    await db
      .delete(testCases)
      .where(and(eq(testCases.id, caseId), eq(testCases.projectId, projectId)));

    for (const att of attRows) {
      this.storageService.deleteFile(att.storageKey);
    }
    return { deleted: true };
  }

  // ==================== REVIEW COMMENTS ====================

  async listComments(
    projectId: string,
    caseId: string,
    user: AuthUser,
  ): Promise<TestCaseCommentDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const rows = await db
      .select()
      .from(testCaseComments)
      .where(
        and(eq(testCaseComments.projectId, projectId), eq(testCaseComments.testCaseId, caseId)),
      )
      .orderBy(asc(testCaseComments.createdAt));

    if (rows.length === 0) return [];
    const authorIds = Array.from(
      new Set(rows.map((r) => r.authorId).filter(Boolean) as string[]),
    );
    const authorRows =
      authorIds.length > 0
        ? await db
            .select({ id: users.id, fullName: users.fullName, role: users.role })
            .from(users)
            .where(inArray(users.id, authorIds))
        : [];
    const authorMap = new Map(authorRows.map((u) => [u.id, u]));

    return rows.map((r) => {
      const a = r.authorId ? authorMap.get(r.authorId) : undefined;
      return {
        id: r.id,
        testCaseId: r.testCaseId,
        content: r.content,
        authorId: r.authorId,
        authorName: a?.fullName || 'Thành viên',
        authorRole: (a?.role as UserRole) ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async addComment(
    projectId: string,
    caseId: string,
    user: AuthUser,
    content: string,
  ): Promise<TestCaseCommentDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const clean = content.trim();
    if (!clean) throw new BadRequestException('Nội dung bình luận không được để trống');

    const [tc] = await db
      .select({ id: testCases.id })
      .from(testCases)
      .where(
        and(
          eq(testCases.id, caseId),
          eq(testCases.projectId, projectId),
          isNull(testCases.deletedAt),
        ),
      )
      .limit(1);
    if (!tc) throw new NotFoundException('Không tìm thấy Test Case');

    const [created] = await db
      .insert(testCaseComments)
      .values({
        projectId,
        testCaseId: caseId,
        authorId: user.id,
        content: clean,
      })
      .returning();

    return {
      id: created.id,
      testCaseId: created.testCaseId,
      content: created.content,
      authorId: created.authorId,
      authorName: user.fullName,
      authorRole: user.role,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async deleteComment(
    projectId: string,
    caseId: string,
    commentId: string,
    user: AuthUser,
  ): Promise<{ deleted: boolean }> {
    const { effectiveRole } = await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(testCaseComments)
      .where(
        and(
          eq(testCaseComments.id, commentId),
          eq(testCaseComments.testCaseId, caseId),
          eq(testCaseComments.projectId, projectId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy bình luận');

    if (existing.authorId !== user.id && !canManageProject(effectiveRole)) {
      throw new ForbiddenException('Bạn không có quyền xóa bình luận của người khác');
    }

    await db.delete(testCaseComments).where(eq(testCaseComments.id, commentId));
    return { deleted: true };
  }
}
