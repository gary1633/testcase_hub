import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  defects,
  projectIntegrations,
  sharedSteps,
  suites,
  testCases,
  testPlanCases,
  testPlans,
  testRunResultHistory,
  testRunResults,
  testRuns,
  testSteps,
  users,
} from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { StorageService } from '../test-cases/storage.service';
import { JiraService } from '../jira/jira.service';
import { DefectsService } from '../defects/defects.service';
import { WebhookService } from '../webhook/webhook.service';
import {
  buildVikkiRunExecutionExportBuffer,
  type ExportableRunDefectItem,
  type ExportableRunResultItem,
} from '../test-cases/excel.util';
import type {
  AutomationStatus,
  DefectDto,
  DefectSeverity,
  ExecutionStatus,
  Priority,
  RunEvidenceDto,
  RunHistoryEventType,
  Severity,
  StepExecutionResultDto,
  TestCaseStatus,
  TestCaseType,
  TestRunDetailDto,
  TestRunResultDto,
  TestRunResultHistoryDto,
  TestRunSource,
  TestRunStatsDto,
  TestRunStatus,
  TestRunSummaryDto,
} from '@tcms/shared';

function formatDdMmYyyy(d?: Date | null): string {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function computeRunStats(statuses: string[]): TestRunStatsDto {
  const total = statuses.length;
  let passed = 0;
  let failed = 0;
  let blocked = 0;
  let notTest = 0;
  let notExecuted = 0;

  for (const s of statuses) {
    if (s === 'PASSED') passed++;
    else if (s === 'FAILED') failed++;
    else if (s === 'BLOCKED') blocked++;
    else if (s === 'NOT_TEST') notTest++;
    else notExecuted++;
  }

  const executed = passed + failed + blocked;
  const passRate = executed > 0 ? Math.round((passed / executed) * 100) : 0;

  return { total, passed, failed, blocked, notTest, notExecuted, passRate };
}

@Injectable()
export class TestRunsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
    private readonly storageService: StorageService,
    private readonly jiraService: JiraService,
    private readonly defectsService: DefectsService,
    private readonly webhookService: WebhookService,
  ) {}

  async listRuns(projectId: string, user: AuthUser): Promise<TestRunSummaryDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const runs = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.projectId, projectId))
      .orderBy(desc(testRuns.startedAt));

    if (runs.length === 0) return [];
    const runIds = runs.map((r) => r.id);
    const planIds = Array.from(new Set(runs.map((r) => r.planId).filter(Boolean) as string[]));
    const creatorIds = Array.from(
      new Set(runs.map((r) => r.createdBy).filter(Boolean) as string[]),
    );

    const [resultStatuses, defectAggs, planRows, userRows] = await Promise.all([
      db
        .select({ runId: testRunResults.runId, status: testRunResults.status })
        .from(testRunResults)
        .where(inArray(testRunResults.runId, runIds)),
      db
        .select({ runId: defects.runId, total: count() })
        .from(defects)
        .where(inArray(defects.runId, runIds))
        .groupBy(defects.runId),
      planIds.length > 0
        ? db
            .select({ id: testPlans.id, title: testPlans.title })
            .from(testPlans)
            .where(inArray(testPlans.id, planIds))
        : Promise.resolve([]),
      creatorIds.length > 0
        ? db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, creatorIds))
        : Promise.resolve([]),
    ]);

    const statusesByRun = new Map<string, string[]>();
    for (const r of resultStatuses) {
      const list = statusesByRun.get(r.runId) ?? [];
      list.push(r.status);
      statusesByRun.set(r.runId, list);
    }

    const defectMap = new Map(
      defectAggs.filter((d) => d.runId).map((d) => [d.runId!, Number(d.total)]),
    );
    const planMap = new Map(planRows.map((p) => [p.id, p.title]));
    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

    return runs.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      planId: r.planId,
      planTitle: r.planId ? planMap.get(r.planId) ?? null : null,
      parentRunId: r.parentRunId ?? null,
      source: (r.source as TestRunSource) || 'MANUAL',
      title: r.title,
      description: r.description,
      environment: r.environment,
      appVersion: r.appVersion,
      plannedDate: r.plannedDate,
      jiraIssueKey: r.jiraIssueKey,
      status: r.status as TestRunStatus,
      stats: computeRunStats(statusesByRun.get(r.id) ?? []),
      defectCount: defectMap.get(r.id) ?? 0,
      createdByName: r.createdBy ? userMap.get(r.createdBy) ?? null : null,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      lastJiraSyncedAt: r.lastJiraSyncedAt ? r.lastJiraSyncedAt.toISOString() : null,
    }));
  }

  async getRunDetail(
    projectId: string,
    runId: string,
    user: AuthUser,
  ): Promise<TestRunDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const [run] = await db
      .select()
      .from(testRuns)
      .where(and(eq(testRuns.id, runId), eq(testRuns.projectId, projectId)))
      .limit(1);
    if (!run) throw new NotFoundException('Không tìm thấy Test Run');

    const [results, [defectAgg], planRow, jiraRow] = await Promise.all([
      db
        .select()
        .from(testRunResults)
        .where(eq(testRunResults.runId, runId))
        .orderBy(asc(testRunResults.position)),
      db.select({ total: count() }).from(defects).where(eq(defects.runId, runId)),
      run.planId
        ? db
            .select({ title: testPlans.title })
            .from(testPlans)
            .where(eq(testPlans.id, run.planId))
            .limit(1)
            .then((r) => r[0])
        : Promise.resolve(undefined),
      db
        .select()
        .from(projectIntegrations)
        .where(
          and(
            eq(projectIntegrations.projectId, projectId),
            eq(projectIntegrations.provider, 'jira'),
          ),
        )
        .limit(1)
        .then((r) => r[0]),
    ]);

    const userIds = Array.from(
      new Set(
        [
          run.createdBy,
          ...results.map((r) => r.assigneeId),
          ...results.map((r) => r.executedBy),
        ].filter(Boolean) as string[],
      ),
    );
    const userRows =
      userIds.length > 0
        ? await db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

    const resultDtos: TestRunResultDto[] = results.map((r) => ({
      id: r.id,
      runId: r.runId,
      testCaseId: r.testCaseId,
      caseCode: r.caseCode,
      caseVersion: r.caseVersion,
      caseSnapshot: r.caseSnapshot,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeId ? userMap.get(r.assigneeId) ?? null : null,
      status: r.status as ExecutionStatus,
      actualResult: r.actualResult,
      comment: r.comment,
      stepResults: Array.isArray(r.stepResults) ? r.stepResults : [],
      plannedDate: r.plannedDate,
      executedBy: r.executedBy,
      executedByName: r.executedBy ? userMap.get(r.executedBy) ?? null : null,
      executedAt: r.executedAt ? r.executedAt.toISOString() : null,
      jiraBugKeys: Array.isArray(r.jiraBugKeys) ? r.jiraBugKeys : [],
      evidence: Array.isArray(r.evidence) ? r.evidence : [],
      position: r.position,
    }));

    return {
      id: run.id,
      projectId: run.projectId,
      planId: run.planId,
      planTitle: planRow?.title ?? null,
      parentRunId: run.parentRunId ?? null,
      source: (run.source as TestRunSource) || 'MANUAL',
      title: run.title,
      description: run.description,
      environment: run.environment,
      appVersion: run.appVersion,
      plannedDate: run.plannedDate,
      jiraIssueKey: run.jiraIssueKey,
      status: run.status as TestRunStatus,
      stats: computeRunStats(results.map((r) => r.status)),
      defectCount: Number(defectAgg?.total ?? 0),
      createdByName: run.createdBy ? userMap.get(run.createdBy) ?? null : null,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      lastJiraSyncedAt: run.lastJiraSyncedAt ? run.lastJiraSyncedAt.toISOString() : null,
      results: resultDtos,
      jiraEnabled: jiraRow?.isEnabled ?? false,
      jiraBaseUrl: jiraRow?.config?.baseUrl || null,
    };
  }

  async createRun(
    projectId: string,
    user: AuthUser,
    input: {
      title: string;
      description?: string | null;
      environment?: string;
      appVersion?: string;
      plannedDate?: string | null;
      jiraIssueKey?: string | null;
      planId?: string | null;
      caseIds?: string[];
      defaultAssigneeId?: string | null;
    },
  ): Promise<TestRunDetailDto> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    let selectedCaseIds: string[] = [];
    const assigneeByCase = new Map<string, string | null>();

    if (input.planId) {
      const planCases = await db
        .select()
        .from(testPlanCases)
        .where(eq(testPlanCases.planId, input.planId))
        .orderBy(asc(testPlanCases.position));
      selectedCaseIds = planCases.map((pc) => pc.testCaseId);
      for (const pc of planCases) {
        if (pc.defaultAssigneeId) assigneeByCase.set(pc.testCaseId, pc.defaultAssigneeId);
      }
    } else if (input.caseIds && input.caseIds.length > 0) {
      selectedCaseIds = Array.from(new Set(input.caseIds));
    } else {
      const allProjectCases = await db
        .select({ id: testCases.id })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt)))
        .orderBy(asc(testCases.seqNumber));
      selectedCaseIds = allProjectCases.map((c) => c.id);
    }

    if (selectedCaseIds.length === 0) {
      throw new BadRequestException('Không có Test Case nào để tạo Test Run');
    }

    const [caseRows, allSuites, stepRows, sharedStepRows] = await Promise.all([
      db
        .select()
        .from(testCases)
        .where(
          and(
            eq(testCases.projectId, projectId),
            isNull(testCases.deletedAt),
            inArray(testCases.id, selectedCaseIds),
          ),
        ),
      db.select().from(suites).where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt))),
      db
        .select()
        .from(testSteps)
        .where(inArray(testSteps.testCaseId, selectedCaseIds))
        .orderBy(asc(testSteps.stepOrder)),
      db.select().from(sharedSteps).where(eq(sharedSteps.projectId, projectId)),
    ]);

    if (caseRows.length === 0) {
      throw new BadRequestException('Danh sách Test Case không hợp lệ');
    }

    const suiteMap = new Map(allSuites.map((s) => [s.id, s.title]));
    const sharedStepMap = new Map(sharedStepRows.map((ss) => [ss.id, ss]));
    const caseMap = new Map(caseRows.map((c) => [c.id, c]));
    const stepsByCase = new Map<string, Array<{ action: string; data: string; expectedResult: string }>>();
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

    const orderedCases = selectedCaseIds
      .map((id) => caseMap.get(id))
      .filter((c): c is typeof testCases.$inferSelect => Boolean(c));

    const plannedDate = input.plannedDate?.trim() || formatDdMmYyyy(new Date());
    const [createdRun] = await db
      .insert(testRuns)
      .values({
        projectId,
        planId: input.planId || null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        environment: input.environment?.trim() || 'Staging',
        appVersion: input.appVersion?.trim() || '1.0.0',
        plannedDate,
        jiraIssueKey: input.jiraIssueKey?.trim().toUpperCase() || null,
        status: 'IN_PROGRESS',
        createdBy: user.id,
      })
      .returning();

    const resultInserts = orderedCases.map((c, idx) => {
      const steps = (stepsByCase.get(c.id) ?? []).map((s, sIdx) => ({
        stepOrder: sIdx,
        action: s.action,
        data: s.data,
        expectedResult: s.expectedResult,
      }));
      return {
        runId: createdRun.id,
        testCaseId: c.id,
        caseCode: `${project.code}-${c.seqNumber}`,
        caseVersion: c.currentVersion || 1,
        caseSnapshot: {
          title: c.title,
          suiteId: c.suiteId,
          suiteTitle: c.suiteId ? suiteMap.get(c.suiteId) ?? null : null,
          description: c.description,
          preconditions: c.preconditions,
          priority: c.priority as Priority,
          severity: c.severity as Severity,
          type: c.type as TestCaseType,
          automationStatus: c.automationStatus as AutomationStatus,
          status: c.status as TestCaseStatus,
          tags: Array.isArray(c.tags) ? c.tags : [],
          jiraIssueKeys: Array.isArray(c.jiraIssueKeys) ? c.jiraIssueKeys : [],
          steps,
        },
        assigneeId:
          input.defaultAssigneeId !== undefined
            ? input.defaultAssigneeId || null
            : assigneeByCase.get(c.id) ?? null,
        status: 'NOT_EXECUTED',
        actualResult: '',
        comment: '',
        stepResults: steps.map((s) => ({ stepOrder: s.stepOrder, status: 'UNSET' as const })),
        plannedDate,
        jiraBugKeys: [],
        evidence: [],
        position: idx,
      };
    });

    await db.insert(testRunResults).values(resultInserts);

    return this.getRunDetail(projectId, createdRun.id, user);
  }

  async updateRun(
    projectId: string,
    runId: string,
    user: AuthUser,
    input: {
      title?: string;
      description?: string | null;
      environment?: string;
      appVersion?: string;
      plannedDate?: string | null;
      jiraIssueKey?: string | null;
      status?: TestRunStatus;
    },
  ): Promise<TestRunDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(testRuns)
      .where(and(eq(testRuns.id, runId), eq(testRuns.projectId, projectId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Test Run');

    const updateData: Partial<typeof testRuns.$inferInsert> = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim() || null;
    if (input.environment !== undefined) updateData.environment = input.environment.trim();
    if (input.appVersion !== undefined) updateData.appVersion = input.appVersion.trim();
    if (input.plannedDate !== undefined) updateData.plannedDate = input.plannedDate?.trim() || null;
    if (input.jiraIssueKey !== undefined) {
      updateData.jiraIssueKey = input.jiraIssueKey?.trim().toUpperCase() || null;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
      updateData.completedAt = input.status === 'COMPLETED' ? new Date() : null;
    }

    await db.update(testRuns).set(updateData).where(eq(testRuns.id, runId));
    const detail = await this.getRunDetail(projectId, runId, user);
    if (input.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      void this.webhookService.notifyRunCompleted(projectId, {
        runTitle: detail.title,
        environment: detail.environment,
        appVersion: detail.appVersion,
        source: detail.source,
        stats: detail.stats,
        actorName: user.fullName,
      });
    }
    return detail;
  }

  async deleteRun(projectId: string, runId: string, user: AuthUser): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    await this.dbService.db
      .delete(testRuns)
      .where(and(eq(testRuns.id, runId), eq(testRuns.projectId, projectId)));
    return { deleted: true };
  }

  async updateRunResult(
    projectId: string,
    runId: string,
    resultId: string,
    user: AuthUser,
    input: {
      status?: ExecutionStatus;
      actualResult?: string;
      comment?: string;
      stepResults?: StepExecutionResultDto[];
      assigneeId?: string | null;
      plannedDate?: string | null;
      jiraBugKeys?: string[];
    },
  ): Promise<TestRunResultDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(testRunResults)
      .where(and(eq(testRunResults.id, resultId), eq(testRunResults.runId, runId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy kết quả Test Case trong đợt chạy');

    const updateData: Partial<typeof testRunResults.$inferInsert> = {};
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'NOT_EXECUTED') {
        updateData.executedBy = null;
        updateData.executedAt = null;
      } else {
        updateData.executedBy = user.id;
        updateData.executedAt = new Date();
      }
    }
    if (input.actualResult !== undefined) updateData.actualResult = input.actualResult;
    if (input.comment !== undefined) updateData.comment = input.comment;
    if (input.stepResults !== undefined) updateData.stepResults = input.stepResults;
    if (input.assigneeId !== undefined) updateData.assigneeId = input.assigneeId || null;
    if (input.plannedDate !== undefined) updateData.plannedDate = input.plannedDate?.trim() || null;
    if (input.jiraBugKeys !== undefined) {
      updateData.jiraBugKeys = Array.from(
        new Set(input.jiraBugKeys.map((k) => k.trim().toUpperCase()).filter(Boolean)),
      );
    }

    const [updated] = await db
      .update(testRunResults)
      .set(updateData)
      .where(eq(testRunResults.id, resultId))
      .returning();

    // Record execution history audit entry
    const statusChanged = input.status !== undefined && existing.status !== updated.status;
    const detailsChanged =
      (input.actualResult !== undefined && existing.actualResult !== updated.actualResult) ||
      (input.comment !== undefined && existing.comment !== updated.comment);

    if (statusChanged) {
      await db.insert(testRunResultHistory).values({
        runId,
        runResultId: resultId,
        caseCode: updated.caseCode,
        caseTitle: updated.caseSnapshot?.title || updated.caseCode,
        eventType: 'STATUS_CHANGED',
        fromStatus: existing.status,
        toStatus: updated.status,
        summary: `Đổi trạng thái từ ${existing.status} sang ${updated.status}`,
        actualResult: updated.actualResult || '',
        comment: updated.comment || '',
        actorId: user.id,
        actorName: user.fullName,
      });
    } else if (detailsChanged) {
      await db.insert(testRunResultHistory).values({
        runId,
        runResultId: resultId,
        caseCode: updated.caseCode,
        caseTitle: updated.caseSnapshot?.title || updated.caseCode,
        eventType: 'DETAILS_UPDATED',
        fromStatus: existing.status,
        toStatus: updated.status,
        summary: 'Cập nhật kết quả thực tế / ghi chú',
        actualResult: updated.actualResult || '',
        comment: updated.comment || '',
        actorId: user.id,
        actorName: user.fullName,
      });
    }

    const userIds = [updated.assigneeId, updated.executedBy].filter(Boolean) as string[];
    const userRows =
      userIds.length > 0
        ? await db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

    return {
      id: updated.id,
      runId: updated.runId,
      testCaseId: updated.testCaseId,
      caseCode: updated.caseCode,
      caseVersion: updated.caseVersion,
      caseSnapshot: updated.caseSnapshot,
      assigneeId: updated.assigneeId,
      assigneeName: updated.assigneeId ? userMap.get(updated.assigneeId) ?? null : null,
      status: updated.status as ExecutionStatus,
      actualResult: updated.actualResult,
      comment: updated.comment,
      stepResults: Array.isArray(updated.stepResults) ? updated.stepResults : [],
      plannedDate: updated.plannedDate,
      executedBy: updated.executedBy,
      executedByName: updated.executedBy ? userMap.get(updated.executedBy) ?? null : null,
      executedAt: updated.executedAt ? updated.executedAt.toISOString() : null,
      jiraBugKeys: Array.isArray(updated.jiraBugKeys) ? updated.jiraBugKeys : [],
      evidence: Array.isArray(updated.evidence) ? updated.evidence : [],
      position: updated.position,
    };
  }

  async uploadEvidence(
    projectId: string,
    runId: string,
    resultId: string,
    user: AuthUser,
    file: Express.Multer.File,
  ): Promise<RunEvidenceDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(testRunResults)
      .where(and(eq(testRunResults.id, resultId), eq(testRunResults.runId, runId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Test Run Result');

    const safeMimeType = this.storageService.validateUploadFile(file.originalname, file.mimetype);
    const storageKey = this.storageService.saveBuffer(file.originalname, file.buffer);
    const entry: RunEvidenceDto = {
      id: crypto.randomUUID(),
      fileName: file.originalname,
      mimeType: safeMimeType,
      fileSize: file.size,
      storageKey,
      url: `/api/run-evidence/${encodeURIComponent(storageKey)}`,
      uploadedAt: new Date().toISOString(),
    };

    const nextEvidence = [...(existing.evidence || []), entry];
    await db
      .update(testRunResults)
      .set({ evidence: nextEvidence })
      .where(eq(testRunResults.id, resultId));

    await db.insert(testRunResultHistory).values({
      runId,
      runResultId: resultId,
      caseCode: existing.caseCode,
      caseTitle: existing.caseSnapshot?.title || existing.caseCode,
      eventType: 'EVIDENCE_ADDED',
      fromStatus: existing.status,
      toStatus: existing.status,
      summary: `Đính kèm bằng chứng "${file.originalname}"`,
      actualResult: '',
      comment: '',
      actorId: user.id,
      actorName: user.fullName,
    });

    return entry;
  }

  async deleteEvidence(
    projectId: string,
    runId: string,
    resultId: string,
    evidenceId: string,
    user: AuthUser,
  ): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(testRunResults)
      .where(and(eq(testRunResults.id, resultId), eq(testRunResults.runId, runId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Test Run Result');

    const target = (existing.evidence || []).find((e) => e.id === evidenceId);
    if (target) {
      this.storageService.deleteFile(target.storageKey);
      const next = (existing.evidence || []).filter((e) => e.id !== evidenceId);
      await db
        .update(testRunResults)
        .set({ evidence: next })
        .where(eq(testRunResults.id, resultId));
    }
    return { deleted: true };
  }

  async createDefectFromResult(
    projectId: string,
    runId: string,
    resultId: string,
    user: AuthUser,
    input: {
      title: string;
      description?: string;
      stepsToReproduce?: string;
      actualResult?: string;
      expectedResult?: string;
      priority?: Priority;
      severity?: DefectSeverity;
      jiraIssueKey?: string | null;
      pushToJira?: boolean;
    },
  ): Promise<{ defect: DefectDto; jiraResult?: { ok: boolean; message: string } }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [run] = await db
      .select()
      .from(testRuns)
      .where(and(eq(testRuns.id, runId), eq(testRuns.projectId, projectId)))
      .limit(1);
    if (!run) throw new NotFoundException('Không tìm thấy Test Run');

    const [resRow] = await db
      .select()
      .from(testRunResults)
      .where(and(eq(testRunResults.id, resultId), eq(testRunResults.runId, runId)))
      .limit(1);
    if (!resRow) throw new NotFoundException('Không tìm thấy kết quả Test Case');

    const snap = resRow.caseSnapshot;
    const defaultStepsText = (snap.steps || [])
      .map((s, i) => `${i + 1}. ${s.action}${s.data ? ` [Data: ${s.data}]` : ''}`)
      .join('\n');
    const defaultExpectedText = (snap.steps || [])
      .map((s, i) => `${i + 1}. ${s.expectedResult}`)
      .join('\n');

    const res = await this.defectsService.createDefect(projectId, user, {
      title: input.title,
      description: input.description ?? resRow.comment ?? '',
      stepsToReproduce: input.stepsToReproduce ?? defaultStepsText,
      expectedResult: input.expectedResult ?? defaultExpectedText,
      actualResult: input.actualResult ?? resRow.actualResult ?? '',
      priority: input.priority ?? snap.priority ?? 'MEDIUM',
      severity: input.severity ?? 'HIGH',
      runId: run.id,
      runResultId: resRow.id,
      caseCode: resRow.caseCode,
      jiraIssueKey: input.jiraIssueKey,
      pushToJira: input.pushToJira,
      environment: run.environment,
      appVersion: run.appVersion,
    });

    await db.insert(testRunResultHistory).values({
      runId,
      runResultId: resultId,
      caseCode: resRow.caseCode,
      caseTitle: resRow.caseSnapshot?.title || resRow.caseCode,
      eventType: 'BUG_LINKED',
      fromStatus: resRow.status,
      toStatus: resRow.status,
      summary: res.defect.jiraIssueKey
        ? `Tạo Bug ${res.defect.jiraIssueKey}: ${res.defect.title}`
        : `Tạo Defect: ${res.defect.title}`,
      actualResult: '',
      comment: '',
      actorId: user.id,
      actorName: user.fullName,
    });

    return res;
  }

  private mapHistoryRow(row: typeof testRunResultHistory.$inferSelect): TestRunResultHistoryDto {
    return {
      id: row.id,
      runId: row.runId,
      runResultId: row.runResultId,
      caseCode: row.caseCode,
      caseTitle: row.caseTitle,
      eventType: row.eventType as RunHistoryEventType,
      fromStatus: (row.fromStatus as ExecutionStatus) || null,
      toStatus: (row.toStatus as ExecutionStatus) || null,
      summary: row.summary,
      actualResult: row.actualResult,
      comment: row.comment,
      actorId: row.actorId,
      actorName: row.actorName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listResultHistory(
    projectId: string,
    runId: string,
    resultId: string,
    user: AuthUser,
  ): Promise<TestRunResultHistoryDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const rows = await this.dbService.db
      .select()
      .from(testRunResultHistory)
      .where(
        and(
          eq(testRunResultHistory.runId, runId),
          eq(testRunResultHistory.runResultId, resultId),
        ),
      )
      .orderBy(desc(testRunResultHistory.createdAt));

    return rows.map((r) => this.mapHistoryRow(r));
  }

  async listRunHistory(
    projectId: string,
    runId: string,
    user: AuthUser,
  ): Promise<TestRunResultHistoryDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const rows = await this.dbService.db
      .select()
      .from(testRunResultHistory)
      .where(eq(testRunResultHistory.runId, runId))
      .orderBy(desc(testRunResultHistory.createdAt))
      .limit(250);

    return rows.map((r) => this.mapHistoryRow(r));
  }

  async syncRunToJira(
    projectId: string,
    runId: string,
    user: AuthUser,
    overrideJiraKey?: string,
  ): Promise<{ ok: boolean; issueKey?: string; issueUrl?: string; message: string }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const detail = await this.getRunDetail(projectId, runId, user);
    const targetKey = (overrideJiraKey || detail.jiraIssueKey || '').trim().toUpperCase();

    if (!targetKey) {
      return {
        ok: false,
        message: 'Vui lòng nhập mã Jira Ticket (VD: ECOM-100) cho Test Run trước khi đồng bộ.',
      };
    }

    const failedCases = detail.results
      .filter((r) => r.status === 'FAILED')
      .map((r) => ({
        code: r.caseCode,
        title: r.caseSnapshot.title,
        actualResult: r.actualResult,
        bugs: r.jiraBugKeys,
      }));

    const syncRes = await this.jiraService.syncRunProgressToJira(projectId, targetKey, {
      runTitle: detail.title,
      environment: detail.environment,
      appVersion: detail.appVersion,
      stats: detail.stats,
      failedCases,
      syncedByName: user.fullName,
    });

    if (syncRes.ok) {
      await this.dbService.db
        .update(testRuns)
        .set({ jiraIssueKey: targetKey, lastJiraSyncedAt: new Date() })
        .where(eq(testRuns.id, runId));
    }

    return { ...syncRes, issueKey: targetKey };
  }

  async exportRunVikkiExcel(
    projectId: string,
    runId: string,
    user: AuthUser,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const { project } = await this.projectAccess.verifyAccess(projectId, user, 'view');
    const detail = await this.getRunDetail(projectId, runId, user);
    const db = this.dbService.db;

    const [allSuites, runDefects] = await Promise.all([
      db.select().from(suites).where(eq(suites.projectId, projectId)),
      db
        .select()
        .from(defects)
        .where(and(eq(defects.projectId, projectId), eq(defects.runId, runId)))
        .orderBy(asc(defects.createdAt)),
    ]);

    const suiteMap = new Map(allSuites.map((s) => [s.id, s]));
    const getSuitePathArr = (suiteId: string | null, fallbackTitle: string | null): string[] => {
      if (!suiteId) return fallbackTitle ? [fallbackTitle] : [];
      const parts: string[] = [];
      let cur: string | null = suiteId;
      let guard = 0;
      while (cur && suiteMap.has(cur) && guard < 20) {
        const s: typeof suites.$inferSelect = suiteMap.get(cur)!;
        parts.unshift(s.title);
        cur = s.parentId;
        guard++;
      }
      return parts.length > 0 ? parts : fallbackTitle ? [fallbackTitle] : [];
    };

    const items: ExportableRunResultItem[] = detail.results.map((r) => {
      const noteParts: string[] = [];
      if (r.jiraBugKeys.length > 0) noteParts.push(`Bug: ${r.jiraBugKeys.join(', ')}`);
      if (r.caseSnapshot.jiraIssueKeys.length > 0) {
        noteParts.push(`Jira: ${r.caseSnapshot.jiraIssueKeys.join(', ')}`);
      }
      if (r.comment.trim()) noteParts.push(r.comment.trim());

      return {
        code: r.caseCode,
        suitePath: getSuitePathArr(r.caseSnapshot.suiteId, r.caseSnapshot.suiteTitle),
        title: r.caseSnapshot.title,
        steps: r.caseSnapshot.steps || [],
        preconditions: r.caseSnapshot.preconditions || '',
        actualResult: r.actualResult || '',
        creatorName: r.executedByName || r.assigneeName || detail.createdByName || '',
        plannedDate: r.plannedDate || detail.plannedDate || '',
        executedDate: r.executedAt ? formatDdMmYyyy(new Date(r.executedAt)) : '',
        executionStatus: r.status,
        priority: r.caseSnapshot.priority,
        notes: noteParts.join('\n'),
      };
    });

    items.sort((a, b) => a.suitePath.join(' / ').localeCompare(b.suitePath.join(' / ')));

    const exportDefects: ExportableRunDefectItem[] = runDefects.map((d, idx) => ({
      bugKey: d.jiraIssueKey || `BUG-${idx + 1}`,
      title: d.title,
      severity: d.severity as DefectSeverity,
      status: d.status,
      caseCode: d.caseCode || '',
      jiraUrl: d.jiraIssueUrl || '',
    }));

    const docLink =
      detail.jiraBaseUrl && detail.jiraIssueKey
        ? `${detail.jiraBaseUrl.replace(/\/+$/, '')}/browse/${detail.jiraIssueKey}`
        : undefined;

    const buffer = await buildVikkiRunExecutionExportBuffer({
      projectCode: project.code,
      projectName: project.name,
      runTitle: detail.title,
      appVersion: detail.appVersion,
      environment: detail.environment,
      docLink,
      items,
      defects: exportDefects,
    });

    const safeSlug = detail.title
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const dateStr = new Date().toISOString().slice(0, 10);
    return {
      fileName: `Vikki-${project.code}-Run-${safeSlug || 'Execution'}-${dateStr}.xlsx`,
      buffer,
    };
  }

  async bulkAssignResults(
    projectId: string,
    runId: string,
    user: AuthUser,
    resultIds: string[],
    assigneeId: string | null,
  ): Promise<{ updated: number }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    if (resultIds.length === 0) {
      throw new BadRequestException('Chưa chọn Test Case nào để phân công');
    }

    const [run] = await db
      .select({ id: testRuns.id })
      .from(testRuns)
      .where(and(eq(testRuns.id, runId), eq(testRuns.projectId, projectId)))
      .limit(1);
    if (!run) throw new NotFoundException('Không tìm thấy Test Run');

    const updated = await db
      .update(testRunResults)
      .set({ assigneeId: assigneeId || null })
      .where(and(eq(testRunResults.runId, runId), inArray(testRunResults.id, resultIds)))
      .returning({ id: testRunResults.id });

    return { updated: updated.length };
  }

  async rerunFromRun(
    projectId: string,
    sourceRunId: string,
    user: AuthUser,
    input: {
      statuses?: ExecutionStatus[];
      title?: string;
      environment?: string;
      appVersion?: string;
      jiraIssueKey?: string | null;
    },
  ): Promise<TestRunDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [sourceRun] = await db
      .select()
      .from(testRuns)
      .where(and(eq(testRuns.id, sourceRunId), eq(testRuns.projectId, projectId)))
      .limit(1);
    if (!sourceRun) throw new NotFoundException('Không tìm thấy Test Run gốc');

    const targetStatuses: ExecutionStatus[] =
      input.statuses && input.statuses.length > 0 ? input.statuses : ['FAILED', 'BLOCKED'];

    const sourceResults = await db
      .select()
      .from(testRunResults)
      .where(
        and(
          eq(testRunResults.runId, sourceRunId),
          inArray(testRunResults.status, targetStatuses),
        ),
      )
      .orderBy(asc(testRunResults.position));

    if (sourceResults.length === 0) {
      throw new BadRequestException(
        'Không có Test Case nào ở trạng thái đã chọn để chạy lại.',
      );
    }

    const plannedDate = formatDdMmYyyy(new Date());
    const newTitle =
      input.title?.trim() || `[Re-run] ${sourceRun.title}`.slice(0, 255);

    const [createdRun] = await db
      .insert(testRuns)
      .values({
        projectId,
        planId: sourceRun.planId,
        parentRunId: sourceRun.id,
        title: newTitle,
        description: `Chạy lại từ đợt "${sourceRun.title}" (${targetStatuses.join(', ')})`,
        environment: input.environment?.trim() || sourceRun.environment,
        appVersion: input.appVersion?.trim() || sourceRun.appVersion,
        plannedDate,
        jiraIssueKey:
          input.jiraIssueKey !== undefined
            ? input.jiraIssueKey?.trim().toUpperCase() || null
            : sourceRun.jiraIssueKey,
        status: 'IN_PROGRESS',
        createdBy: user.id,
      })
      .returning();

    const resultInserts = sourceResults.map((r, idx) => {
      const snapSteps = Array.isArray(r.caseSnapshot?.steps) ? r.caseSnapshot.steps : [];
      return {
        runId: createdRun.id,
        testCaseId: r.testCaseId,
        caseCode: r.caseCode,
        caseVersion: r.caseVersion,
        caseSnapshot: r.caseSnapshot,
        assigneeId: r.assigneeId,
        status: 'NOT_EXECUTED',
        actualResult: '',
        comment: '',
        stepResults: snapSteps.map((s) => ({
          stepOrder: s.stepOrder,
          status: 'UNSET' as const,
        })),
        plannedDate,
        jiraBugKeys: [],
        evidence: [],
        position: idx,
      };
    });

    await db.insert(testRunResults).values(resultInserts);
    return this.getRunDetail(projectId, createdRun.id, user);
  }
}
