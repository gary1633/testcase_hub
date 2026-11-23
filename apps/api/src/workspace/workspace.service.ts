import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import {
  canViewAllProjects,
  type AutomationStatus,
  type DefectSeverity,
  type DefectStatus,
  type ExecutionStatus,
  type GlobalSearchResultDto,
  type MyWorkDto,
  type Priority,
  type TestCaseStatus,
  type TestRunStatus,
} from '@tcms/shared';
import { DatabaseService } from '../db/database.service';
import {
  defects,
  projectMembers,
  projects,
  testCases,
  testRunResults,
  testRuns,
} from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';

@Injectable()
export class WorkspaceService {
  constructor(private readonly dbService: DatabaseService) {}

  private async getAccessibleProjects(user: AuthUser) {
    const db = this.dbService.db;
    if (canViewAllProjects(user.role)) {
      const rows = await db
        .select({
          id: projects.id,
          code: projects.code,
          name: projects.name,
          isArchived: projects.isArchived,
        })
        .from(projects);
      return rows.map((p) => ({ ...p, canManage: true }));
    }

    const rows = await db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        isArchived: projects.isArchived,
        memberRole: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(eq(projectMembers.userId, user.id));

    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      isArchived: p.isArchived,
      canManage: p.memberRole === 'QA_LEAD',
    }));
  }

  async globalSearch(user: AuthUser, rawQuery: string): Promise<GlobalSearchResultDto> {
    const q = (rawQuery || '').trim();
    const accessible = await this.getAccessibleProjects(user);
    if (accessible.length === 0) {
      return { projects: [], cases: [], runs: [], defects: [] };
    }

    const projectMap = new Map(accessible.map((p) => [p.id, p]));
    const projectIds = accessible.map((p) => p.id);

    // If query is empty, return recent active projects & latest runs as quick jumps
    if (!q) {
      const activeProjects = accessible
        .filter((p) => !p.isArchived)
        .slice(0, 6)
        .map((p) => ({ id: p.id, code: p.code, name: p.name, isArchived: p.isArchived }));

      const recentRuns = await this.dbService.db
        .select({
          id: testRuns.id,
          projectId: testRuns.projectId,
          title: testRuns.title,
          environment: testRuns.environment,
          status: testRuns.status,
        })
        .from(testRuns)
        .where(inArray(testRuns.projectId, projectIds))
        .orderBy(desc(testRuns.startedAt))
        .limit(5);

      return {
        projects: activeProjects,
        cases: [],
        runs: recentRuns.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          projectCode: projectMap.get(r.projectId)?.code ?? '',
          title: r.title,
          environment: r.environment,
          status: r.status as TestRunStatus,
        })),
        defects: [],
      };
    }

    const db = this.dbService.db;
    const lowerQ = q.toLowerCase();
    const pattern = `%${q}%`;

    // Match projects in-memory (fast)
    const matchedProjects = accessible
      .filter(
        (p) =>
          p.code.toLowerCase().includes(lowerQ) || p.name.toLowerCase().includes(lowerQ),
      )
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        isArchived: p.isArchived,
      }));

    // Parse optional case code pattern e.g. "WEB-12" or "12"
    const codeMatch = /^([A-Za-z0-9]+)-(\d+)$/.exec(q);
    let caseCodeCond = undefined;
    if (codeMatch) {
      const codePrefix = codeMatch[1].toUpperCase();
      const seqNum = Number(codeMatch[2]);
      const matchedProjIds = accessible
        .filter((p) => p.code.toUpperCase() === codePrefix)
        .map((p) => p.id);
      if (matchedProjIds.length > 0 && Number.isFinite(seqNum)) {
        caseCodeCond = and(
          inArray(testCases.projectId, matchedProjIds),
          eq(testCases.seqNumber, seqNum),
        );
      }
    }

    const [matchedCases, matchedRuns, matchedDefects] = await Promise.all([
      db
        .select({
          id: testCases.id,
          projectId: testCases.projectId,
          seqNumber: testCases.seqNumber,
          title: testCases.title,
          priority: testCases.priority,
          status: testCases.status,
        })
        .from(testCases)
        .where(
          and(
            inArray(testCases.projectId, projectIds),
            isNull(testCases.deletedAt),
            caseCodeCond ? or(ilike(testCases.title, pattern), caseCodeCond) : ilike(testCases.title, pattern),
          ),
        )
        .orderBy(desc(testCases.updatedAt))
        .limit(8),

      db
        .select({
          id: testRuns.id,
          projectId: testRuns.projectId,
          title: testRuns.title,
          environment: testRuns.environment,
          status: testRuns.status,
        })
        .from(testRuns)
        .where(
          and(
            inArray(testRuns.projectId, projectIds),
            or(ilike(testRuns.title, pattern), ilike(testRuns.jiraIssueKey, pattern)),
          ),
        )
        .orderBy(desc(testRuns.startedAt))
        .limit(5),

      db
        .select({
          id: defects.id,
          projectId: defects.projectId,
          caseCode: defects.caseCode,
          title: defects.title,
          status: defects.status,
          severity: defects.severity,
          jiraIssueKey: defects.jiraIssueKey,
        })
        .from(defects)
        .where(
          and(
            inArray(defects.projectId, projectIds),
            or(
              ilike(defects.title, pattern),
              ilike(defects.caseCode, pattern),
              ilike(defects.jiraIssueKey, pattern),
            ),
          ),
        )
        .orderBy(desc(defects.createdAt))
        .limit(5),
    ]);

    return {
      projects: matchedProjects,
      cases: matchedCases.map((c) => {
        const projCode = projectMap.get(c.projectId)?.code ?? '';
        return {
          id: c.id,
          projectId: c.projectId,
          projectCode: projCode,
          code: `${projCode}-${c.seqNumber}`,
          title: c.title,
          priority: c.priority as Priority,
          status: c.status as TestCaseStatus,
        };
      }),
      runs: matchedRuns.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        projectCode: projectMap.get(r.projectId)?.code ?? '',
        title: r.title,
        environment: r.environment,
        status: r.status as TestRunStatus,
      })),
      defects: matchedDefects.map((d) => ({
        id: d.id,
        projectId: d.projectId,
        projectCode: projectMap.get(d.projectId)?.code ?? '',
        caseCode: d.caseCode,
        title: d.title,
        status: d.status as DefectStatus,
        severity: d.severity as DefectSeverity,
        jiraIssueKey: d.jiraIssueKey,
      })),
    };
  }

  async getMyWork(user: AuthUser): Promise<MyWorkDto> {
    const accessible = (await this.getAccessibleProjects(user)).filter((p) => !p.isArchived);
    if (accessible.length === 0) {
      return {
        assignedRunItems: [],
        pendingReviewCases: [],
        myDraftCases: [],
        openDefects: [],
      };
    }

    const db = this.dbService.db;
    const projectMap = new Map(accessible.map((p) => [p.id, p]));
    const projectIds = accessible.map((p) => p.id);
    const manageableProjectIds = accessible.filter((p) => p.canManage).map((p) => p.id);

    const [assignedRows, reviewRows, draftRows, defectRows] = await Promise.all([
      db
        .select({
          resultId: testRunResults.id,
          runId: testRuns.id,
          runTitle: testRuns.title,
          projectId: testRuns.projectId,
          environment: testRuns.environment,
          caseCode: testRunResults.caseCode,
          caseSnapshot: testRunResults.caseSnapshot,
          status: testRunResults.status,
          plannedDate: testRunResults.plannedDate,
        })
        .from(testRunResults)
        .innerJoin(testRuns, eq(testRunResults.runId, testRuns.id))
        .where(
          and(
            inArray(testRuns.projectId, projectIds),
            eq(testRuns.status, 'IN_PROGRESS'),
            eq(testRunResults.assigneeId, user.id),
          ),
        )
        .orderBy(desc(testRuns.startedAt))
        .limit(40),

      manageableProjectIds.length > 0
        ? db
            .select({
              id: testCases.id,
              projectId: testCases.projectId,
              seqNumber: testCases.seqNumber,
              title: testCases.title,
              priority: testCases.priority,
              status: testCases.status,
              updatedAt: testCases.updatedAt,
            })
            .from(testCases)
            .where(
              and(
                inArray(testCases.projectId, manageableProjectIds),
                eq(testCases.status, 'IN_REVIEW'),
                isNull(testCases.deletedAt),
              ),
            )
            .orderBy(desc(testCases.updatedAt))
            .limit(30)
        : Promise.resolve([]),

      db
        .select({
          id: testCases.id,
          projectId: testCases.projectId,
          seqNumber: testCases.seqNumber,
          title: testCases.title,
          priority: testCases.priority,
          status: testCases.status,
          updatedAt: testCases.updatedAt,
        })
        .from(testCases)
        .where(
          and(
            inArray(testCases.projectId, projectIds),
            eq(testCases.createdBy, user.id),
            eq(testCases.status, 'DRAFT'),
            isNull(testCases.deletedAt),
          ),
        )
        .orderBy(desc(testCases.updatedAt))
        .limit(25),

      db
        .select({
          id: defects.id,
          projectId: defects.projectId,
          caseCode: defects.caseCode,
          title: defects.title,
          severity: defects.severity,
          status: defects.status,
          jiraIssueKey: defects.jiraIssueKey,
          createdAt: defects.createdAt,
        })
        .from(defects)
        .where(
          and(
            inArray(defects.projectId, projectIds),
            inArray(defects.status, ['OPEN', 'IN_PROGRESS']),
          ),
        )
        .orderBy(desc(defects.createdAt))
        .limit(25),
    ]);

    // Prioritize unfinished items first in assignedRunItems
    const statusWeight = (s: string) => {
      if (s === 'FAILED') return 0;
      if (s === 'BLOCKED') return 1;
      if (s === 'RETEST') return 2;
      if (s === 'NOT_EXECUTED') return 3;
      if (s === 'IN_PROGRESS') return 4;
      return 5;
    };

    const assignedRunItems = assignedRows
      .map((r) => {
        const proj = projectMap.get(r.projectId);
        return {
          resultId: r.resultId,
          runId: r.runId,
          runTitle: r.runTitle,
          projectId: r.projectId,
          projectCode: proj?.code ?? '',
          projectName: proj?.name ?? '',
          caseCode: r.caseCode,
          caseTitle: r.caseSnapshot?.title ?? r.caseCode,
          status: r.status as ExecutionStatus,
          plannedDate: r.plannedDate ?? null,
          environment: r.environment,
        };
      })
      .sort((a, b) => statusWeight(a.status) - statusWeight(b.status));

    const mapCase = (c: (typeof reviewRows)[number]) => {
      const proj = projectMap.get(c.projectId);
      return {
        id: c.id,
        projectId: c.projectId,
        projectCode: proj?.code ?? '',
        projectName: proj?.name ?? '',
        code: `${proj?.code ?? ''}-${c.seqNumber}`,
        title: c.title,
        priority: c.priority as Priority,
        status: c.status as TestCaseStatus,
        updatedAt: c.updatedAt.toISOString(),
      };
    };

    return {
      assignedRunItems,
      pendingReviewCases: reviewRows.map(mapCase),
      myDraftCases: draftRows.map(mapCase),
      openDefects: defectRows.map((d) => {
        const proj = projectMap.get(d.projectId);
        return {
          id: d.id,
          projectId: d.projectId,
          projectCode: proj?.code ?? '',
          projectName: proj?.name ?? '',
          caseCode: d.caseCode,
          title: d.title,
          severity: d.severity as DefectSeverity,
          status: d.status as DefectStatus,
          jiraIssueKey: d.jiraIssueKey,
          createdAt: d.createdAt.toISOString(),
        };
      }),
    };
  }
}
