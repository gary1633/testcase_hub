import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { defects, projectIntegrations, testRunResults, testRuns, users } from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { validateSafeExternalUrl } from '../common/url-security.util';
import { StorageService } from '../test-cases/storage.service';
import { JiraService } from '../jira/jira.service';
import { WebhookService } from '../webhook/webhook.service';
import type {
  DefectDto,
  DefectSeverity,
  DefectStatus,
  Priority,
  RunEvidenceDto,
} from '@tcms/shared';

@Injectable()
export class DefectsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
    private readonly storageService: StorageService,
    private readonly jiraService: JiraService,
    private readonly webhookService: WebhookService,
  ) {}

  async listDefects(
    projectId: string,
    user: AuthUser,
    filter: { status?: DefectStatus; severity?: DefectSeverity; priority?: Priority; runId?: string },
  ): Promise<DefectDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const conditions = [eq(defects.projectId, projectId)];
    if (filter.status) conditions.push(eq(defects.status, filter.status));
    if (filter.severity) conditions.push(eq(defects.severity, filter.severity));
    if (filter.priority) conditions.push(eq(defects.priority, filter.priority));
    if (filter.runId) conditions.push(eq(defects.runId, filter.runId));

    const rows = await db
      .select()
      .from(defects)
      .where(and(...conditions))
      .orderBy(desc(defects.createdAt));

    if (rows.length === 0) return [];

    const runIds = Array.from(new Set(rows.map((r) => r.runId).filter(Boolean) as string[]));
    const creatorIds = Array.from(
      new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[]),
    );

    const [runRows, userRows] = await Promise.all([
      runIds.length > 0
        ? db
            .select({ id: testRuns.id, title: testRuns.title })
            .from(testRuns)
            .where(inArray(testRuns.id, runIds))
        : Promise.resolve([]),
      creatorIds.length > 0
        ? db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, creatorIds))
        : Promise.resolve([]),
    ]);

    const runMap = new Map(runRows.map((r) => [r.id, r.title]));
    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

    return rows.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      runId: d.runId,
      runTitle: d.runId ? runMap.get(d.runId) ?? null : null,
      runResultId: d.runResultId,
      caseCode: d.caseCode,
      title: d.title,
      description: d.description,
      stepsToReproduce: d.stepsToReproduce || '',
      actualResult: d.actualResult || '',
      expectedResult: d.expectedResult || '',
      priority: (d.priority as Priority) || 'MEDIUM',
      severity: d.severity as DefectSeverity,
      status: d.status as DefectStatus,
      jiraIssueKey: d.jiraIssueKey,
      jiraIssueUrl: d.jiraIssueUrl,
      evidence: Array.isArray(d.evidence) ? d.evidence : [],
      createdByName: d.createdBy ? userMap.get(d.createdBy) ?? null : null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  async createDefect(
    projectId: string,
    user: AuthUser,
    input: {
      title: string;
      description?: string;
      stepsToReproduce?: string;
      actualResult?: string;
      expectedResult?: string;
      priority?: Priority;
      severity?: DefectSeverity;
      runId?: string | null;
      runResultId?: string | null;
      caseCode?: string | null;
      jiraIssueKey?: string | null;
      pushToJira?: boolean;
      environment?: string;
      appVersion?: string;
      stepsText?: string;
      expectedText?: string;
    },
  ): Promise<{ defect: DefectDto; jiraResult?: { ok: boolean; message: string } }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const stepsToReproduce = input.stepsToReproduce ?? input.stepsText ?? '';
    const expectedResult = input.expectedResult ?? input.expectedText ?? '';
    const actualResult = input.actualResult ?? '';
    const priority: Priority = input.priority ?? 'MEDIUM';
    const severity: DefectSeverity = input.severity ?? 'HIGH';

    let jiraIssueKey = input.jiraIssueKey?.trim().toUpperCase() || null;
    let jiraIssueUrl: string | null = null;
    let jiraResult: { ok: boolean; message: string } | undefined;

    if (input.pushToJira) {
      const res = await this.jiraService.createJiraBug(projectId, {
        summary: input.title.trim(),
        description: input.description ?? '',
        severity,
        caseCode: input.caseCode,
        environment: input.environment,
        appVersion: input.appVersion,
        stepsText: stepsToReproduce,
        expectedText: expectedResult,
        actualResult,
      });
      jiraResult = { ok: res.ok, message: res.message };
      if (res.ok && res.issueKey) {
        jiraIssueKey = res.issueKey;
        jiraIssueUrl = res.issueUrl ?? null;
      }
    } else if (jiraIssueKey) {
      const [jiraCfg] = await db
        .select()
        .from(projectIntegrations)
        .where(
          and(
            eq(projectIntegrations.projectId, projectId),
            eq(projectIntegrations.provider, 'jira'),
          ),
        )
        .limit(1);
      if (jiraCfg?.config?.baseUrl) {
        try {
          const safeBase = validateSafeExternalUrl(jiraCfg.config.baseUrl, 'Jira Base URL');
          jiraIssueUrl = `${safeBase}/browse/${jiraIssueKey}`;
        } catch {
          jiraIssueUrl = null;
        }
      }
    }

    const [created] = await db
      .insert(defects)
      .values({
        projectId,
        runId: input.runId ?? null,
        runResultId: input.runResultId ?? null,
        caseCode: input.caseCode ?? null,
        title: input.title.trim(),
        description: input.description ?? '',
        stepsToReproduce,
        actualResult,
        expectedResult,
        priority,
        severity,
        status: 'OPEN',
        jiraIssueKey,
        jiraIssueUrl,
        evidence: [],
        createdBy: user.id,
      })
      .returning();

    // If linked to a Test Run Result and we have a Jira Bug Key, append it to result.jiraBugKeys
    if (input.runResultId && jiraIssueKey) {
      const [resRow] = await db
        .select({ jiraBugKeys: testRunResults.jiraBugKeys })
        .from(testRunResults)
        .where(eq(testRunResults.id, input.runResultId))
        .limit(1);
      if (resRow) {
        const merged = Array.from(new Set([...(resRow.jiraBugKeys || []), jiraIssueKey]));
        await db
          .update(testRunResults)
          .set({ jiraBugKeys: merged })
          .where(eq(testRunResults.id, input.runResultId));
      }
    }

    const dto: DefectDto = {
      id: created.id,
      projectId: created.projectId,
      runId: created.runId,
      runResultId: created.runResultId,
      caseCode: created.caseCode,
      title: created.title,
      description: created.description,
      stepsToReproduce: created.stepsToReproduce || '',
      actualResult: created.actualResult || '',
      expectedResult: created.expectedResult || '',
      priority: (created.priority as Priority) || 'MEDIUM',
      severity: created.severity as DefectSeverity,
      status: created.status as DefectStatus,
      jiraIssueKey: created.jiraIssueKey,
      jiraIssueUrl: created.jiraIssueUrl,
      evidence: Array.isArray(created.evidence) ? created.evidence : [],
      createdByName: user.fullName,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    void this.webhookService.notifyHighDefect(projectId, {
      defectTitle: dto.title,
      severity: dto.severity,
      caseCode: dto.caseCode,
      jiraIssueKey: dto.jiraIssueKey,
      reporterName: user.fullName,
    });

    return { defect: dto, jiraResult };
  }

  async updateDefect(
    projectId: string,
    defectId: string,
    user: AuthUser,
    input: {
      title?: string;
      description?: string;
      stepsToReproduce?: string;
      actualResult?: string;
      expectedResult?: string;
      priority?: Priority;
      severity?: DefectSeverity;
      status?: DefectStatus;
      jiraIssueKey?: string | null;
    },
  ): Promise<DefectDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(defects)
      .where(and(eq(defects.id, defectId), eq(defects.projectId, projectId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Defect');

    const updateData: Partial<typeof defects.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description;
    if (input.stepsToReproduce !== undefined) updateData.stepsToReproduce = input.stepsToReproduce;
    if (input.actualResult !== undefined) updateData.actualResult = input.actualResult;
    if (input.expectedResult !== undefined) updateData.expectedResult = input.expectedResult;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.severity !== undefined) updateData.severity = input.severity;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.jiraIssueKey !== undefined) {
      const cleanKey = input.jiraIssueKey?.trim().toUpperCase() || null;
      updateData.jiraIssueKey = cleanKey;
      if (cleanKey) {
        const [jiraCfg] = await db
          .select()
          .from(projectIntegrations)
          .where(
            and(
              eq(projectIntegrations.projectId, projectId),
              eq(projectIntegrations.provider, 'jira'),
            ),
          )
          .limit(1);
        if (jiraCfg?.config?.baseUrl) {
          try {
            const safeBase = validateSafeExternalUrl(jiraCfg.config.baseUrl, 'Jira Base URL');
            updateData.jiraIssueUrl = `${safeBase}/browse/${cleanKey}`;
          } catch {
            updateData.jiraIssueUrl = null;
          }
        } else {
          updateData.jiraIssueUrl = null;
        }
      } else {
        updateData.jiraIssueUrl = null;
      }
    }

    const [updated] = await db
      .update(defects)
      .set(updateData)
      .where(eq(defects.id, defectId))
      .returning();

    return {
      id: updated.id,
      projectId: updated.projectId,
      runId: updated.runId,
      runResultId: updated.runResultId,
      caseCode: updated.caseCode,
      title: updated.title,
      description: updated.description,
      stepsToReproduce: updated.stepsToReproduce || '',
      actualResult: updated.actualResult || '',
      expectedResult: updated.expectedResult || '',
      priority: (updated.priority as Priority) || 'MEDIUM',
      severity: updated.severity as DefectSeverity,
      status: updated.status as DefectStatus,
      jiraIssueKey: updated.jiraIssueKey,
      jiraIssueUrl: updated.jiraIssueUrl,
      evidence: Array.isArray(updated.evidence) ? updated.evidence : [],
      createdByName: null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async uploadEvidence(
    projectId: string,
    defectId: string,
    user: AuthUser,
    file: Express.Multer.File,
  ): Promise<RunEvidenceDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(defects)
      .where(and(eq(defects.id, defectId), eq(defects.projectId, projectId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Defect');

    const safeMimeType = this.storageService.validateUploadFile(file.originalname, file.mimetype);
    const storageKey = this.storageService.saveBuffer(file.originalname, file.buffer);
    const entry: RunEvidenceDto = {
      id: crypto.randomUUID(),
      fileName: file.originalname,
      mimeType: safeMimeType,
      fileSize: file.size,
      storageKey,
      url: `/api/defect-evidence/${storageKey}`,
      uploadedAt: new Date().toISOString(),
    };

    const next = [...(existing.evidence || []), entry];
    await db
      .update(defects)
      .set({ evidence: next, updatedAt: new Date() })
      .where(eq(defects.id, defectId));

    return entry;
  }

  async deleteEvidence(
    projectId: string,
    defectId: string,
    evidenceId: string,
    user: AuthUser,
  ): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(defects)
      .where(and(eq(defects.id, defectId), eq(defects.projectId, projectId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Defect');

    const target = (existing.evidence || []).find((e) => e.id === evidenceId);
    if (target) {
      this.storageService.deleteFile(target.storageKey);
      const next = (existing.evidence || []).filter((e) => e.id !== evidenceId);
      await db
        .update(defects)
        .set({ evidence: next, updatedAt: new Date() })
        .where(eq(defects.id, defectId));
    }
    return { deleted: true };
  }

  async deleteDefect(
    projectId: string,
    defectId: string,
    user: AuthUser,
  ): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const [existing] = await this.dbService.db
      .select({ id: defects.id, evidence: defects.evidence })
      .from(defects)
      .where(and(eq(defects.id, defectId), eq(defects.projectId, projectId)))
      .limit(1);

    if (existing) {
      for (const ev of existing.evidence || []) {
        this.storageService.deleteFile(ev.storageKey);
      }
      await this.dbService.db
        .delete(defects)
        .where(and(eq(defects.id, defectId), eq(defects.projectId, projectId)));
    }
    return { deleted: true };
  }
}
