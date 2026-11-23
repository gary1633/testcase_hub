import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import {
  projects,
  sharedSteps,
  suites,
  testCaseVersions,
  testCases,
  testSteps,
} from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import type {
  AutomationStatus,
  Priority,
  Severity,
  SuiteDto,
  TestCaseStatus,
  TestCaseType,
} from '@tcms/shared';

export interface SuiteTreeResponse {
  tree: SuiteDto[];
  flat: SuiteDto[];
  totalProjectCases: number;
  uncategorizedCases: number;
}

@Injectable()
export class SuitesService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async listSuites(projectId: string, user: AuthUser): Promise<SuiteTreeResponse> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const [suiteRows, caseCounts] = await Promise.all([
      db
        .select()
        .from(suites)
        .where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt)))
        .orderBy(asc(suites.position), asc(suites.createdAt)),
      db
        .select({
          suiteId: testCases.suiteId,
          total: count(),
        })
        .from(testCases)
        .where(and(eq(testCases.projectId, projectId), isNull(testCases.deletedAt)))
        .groupBy(testCases.suiteId),
    ]);

    const directCountMap = new Map<string, number>();
    let uncategorizedCases = 0;
    let totalProjectCases = 0;

    for (const row of caseCounts) {
      const c = Number(row.total);
      totalProjectCases += c;
      if (row.suiteId) {
        directCountMap.set(row.suiteId, c);
      } else {
        uncategorizedCases += c;
      }
    }

    const nodeMap = new Map<string, SuiteDto>();
    for (const row of suiteRows) {
      const direct = directCountMap.get(row.id) ?? 0;
      nodeMap.set(row.id, {
        id: row.id,
        projectId: row.projectId,
        parentId: row.parentId,
        title: row.title,
        description: row.description,
        position: row.position,
        directCaseCount: direct,
        totalCaseCount: direct,
        children: [],
      });
    }

    const roots: SuiteDto[] = [];
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    const computeTotal = (node: SuiteDto): number => {
      let sum = node.directCaseCount;
      for (const child of node.children ?? []) {
        sum += computeTotal(child);
      }
      node.totalCaseCount = sum;
      return sum;
    };
    for (const root of roots) {
      computeTotal(root);
    }

    const flat: SuiteDto[] = [];
    const flatten = (nodes: SuiteDto[]) => {
      for (const n of nodes) {
        flat.push({
          id: n.id,
          projectId: n.projectId,
          parentId: n.parentId,
          title: n.title,
          description: n.description,
          position: n.position,
          directCaseCount: n.directCaseCount,
          totalCaseCount: n.totalCaseCount,
        });
        if (n.children && n.children.length > 0) {
          flatten(n.children);
        }
      }
    };
    flatten(roots);

    return {
      tree: roots,
      flat,
      totalProjectCases,
      uncategorizedCases,
    };
  }

  async createSuite(
    projectId: string,
    user: AuthUser,
    input: { title: string; description?: string | null; parentId?: string | null },
  ): Promise<SuiteDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const parentId = input.parentId || null;
    if (parentId) {
      const [parent] = await db
        .select({ id: suites.id })
        .from(suites)
        .where(
          and(
            eq(suites.id, parentId),
            eq(suites.projectId, projectId),
            isNull(suites.deletedAt),
          ),
        )
        .limit(1);
      if (!parent) {
        throw new BadRequestException('Parent suite không tồn tại trong dự án này');
      }
    }

    const siblings = await db
      .select({ position: suites.position })
      .from(suites)
      .where(
        and(
          eq(suites.projectId, projectId),
          isNull(suites.deletedAt),
          parentId ? eq(suites.parentId, parentId) : isNull(suites.parentId),
        ),
      );
    const nextPosition =
      siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.position)) + 1;

    const [created] = await db
      .insert(suites)
      .values({
        projectId,
        parentId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        position: nextPosition,
      })
      .returning();

    return {
      id: created.id,
      projectId: created.projectId,
      parentId: created.parentId,
      title: created.title,
      description: created.description,
      position: created.position,
      directCaseCount: 0,
      totalCaseCount: 0,
      children: [],
    };
  }

  async updateSuite(
    projectId: string,
    suiteId: string,
    user: AuthUser,
    input: {
      title?: string;
      description?: string | null;
      parentId?: string | null;
      position?: number;
      orderedSiblingIds?: string[];
    },
  ): Promise<SuiteDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(suites)
      .where(and(eq(suites.id, suiteId), eq(suites.projectId, projectId), isNull(suites.deletedAt)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Suite không tồn tại');
    }

    if (input.parentId !== undefined) {
      if (input.parentId === suiteId) {
        throw new BadRequestException('Không thể đặt suite làm cha của chính nó');
      }
      if (input.parentId) {
        // Prevent circular nesting by walking ancestors
        const allSuites = await db
          .select({ id: suites.id, parentId: suites.parentId })
          .from(suites)
          .where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt)));
        const parentMap = new Map(allSuites.map((s) => [s.id, s.parentId]));
        if (!parentMap.has(input.parentId)) {
          throw new BadRequestException('Parent suite không hợp lệ');
        }
        let cursor: string | null | undefined = input.parentId;
        while (cursor) {
          if (cursor === suiteId) {
            throw new BadRequestException('Không thể di chuyển suite vào bên trong thư mục con của chính nó');
          }
          cursor = parentMap.get(cursor);
        }
      }
    }

    const updateData: Partial<typeof suites.$inferInsert> = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim() || null;
    if (input.parentId !== undefined) updateData.parentId = input.parentId;
    if (input.position !== undefined) updateData.position = input.position;

    const [updated] = await db
      .update(suites)
      .set(updateData)
      .where(eq(suites.id, suiteId))
      .returning();

    if (input.orderedSiblingIds && input.orderedSiblingIds.length > 0) {
      for (let i = 0; i < input.orderedSiblingIds.length; i++) {
        await db
          .update(suites)
          .set({ position: i })
          .where(
            and(
              eq(suites.id, input.orderedSiblingIds[i]),
              eq(suites.projectId, projectId),
            ),
          );
      }
    }

    return {
      id: updated.id,
      projectId: updated.projectId,
      parentId: updated.parentId,
      title: updated.title,
      description: updated.description,
      position: updated.position,
      directCaseCount: 0,
      totalCaseCount: 0,
    };
  }

  async reorderSuites(
    projectId: string,
    user: AuthUser,
    orderedIds: string[],
  ): Promise<{ updated: number }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(suites)
        .set({ position: i })
        .where(and(eq(suites.id, orderedIds[i]), eq(suites.projectId, projectId)));
    }
    return { updated: orderedIds.length };
  }

  async deleteSuite(
    projectId: string,
    suiteId: string,
    user: AuthUser,
    deleteCases = false,
  ): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const allSuites = await db
      .select({ id: suites.id, parentId: suites.parentId })
      .from(suites)
      .where(and(eq(suites.projectId, projectId), isNull(suites.deletedAt)));

    if (!allSuites.some((s) => s.id === suiteId)) {
      throw new NotFoundException('Suite không tồn tại');
    }

    // Collect descendant suite IDs
    const toDeleteIds = new Set<string>([suiteId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of allSuites) {
        if (s.parentId && toDeleteIds.has(s.parentId) && !toDeleteIds.has(s.id)) {
          toDeleteIds.add(s.id);
          changed = true;
        }
      }
    }

    const now = new Date();
    const ids = Array.from(toDeleteIds);
    if (deleteCases) {
      await db
        .update(testCases)
        .set({ deletedAt: now, deletedBy: user.id, updatedAt: now })
        .where(
          and(
            eq(testCases.projectId, projectId),
            inArray(testCases.suiteId, ids),
            isNull(testCases.deletedAt),
          ),
        );
    } else {
      await db
        .update(testCases)
        .set({ suiteId: null, updatedAt: now })
        .where(
          and(
            eq(testCases.projectId, projectId),
            inArray(testCases.suiteId, ids),
            isNull(testCases.deletedAt),
          ),
        );
    }

    await db
      .update(suites)
      .set({ deletedAt: now, deletedBy: user.id })
      .where(and(eq(suites.projectId, projectId), inArray(suites.id, ids)));

    return { deleted: true };
  }

  async restoreSuite(
    projectId: string,
    suiteId: string,
    user: AuthUser,
  ): Promise<{ restored: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [target] = await db
      .select()
      .from(suites)
      .where(and(eq(suites.id, suiteId), eq(suites.projectId, projectId)))
      .limit(1);
    if (!target) throw new NotFoundException('Không tìm thấy Suite trong thùng rác');

    // If its parent suite is still deleted or missing, move restored suite to root
    let nextParentId = target.parentId;
    if (nextParentId) {
      const [parent] = await db
        .select({ id: suites.id, deletedAt: suites.deletedAt })
        .from(suites)
        .where(eq(suites.id, nextParentId))
        .limit(1);
      if (!parent || parent.deletedAt) {
        nextParentId = null;
      }
    }

    await db
      .update(suites)
      .set({ deletedAt: null, deletedBy: null, parentId: nextParentId })
      .where(and(eq(suites.id, suiteId), eq(suites.projectId, projectId)));

    return { restored: true };
  }

  async permanentlyDeleteSuite(
    projectId: string,
    suiteId: string,
    user: AuthUser,
  ): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'manage');
    const db = this.dbService.db;
    await db
      .delete(suites)
      .where(and(eq(suites.id, suiteId), eq(suites.projectId, projectId)));
    return { deleted: true };
  }

  async copySuiteToProject(
    sourceProjectId: string,
    suiteId: string,
    user: AuthUser,
    input: {
      targetProjectId: string;
      targetParentSuiteId?: string | null;
      includeSubSuites?: boolean;
      includeCases?: boolean;
    },
  ): Promise<{
    copiedSuitesCount: number;
    copiedCasesCount: number;
    rootSuiteId: string;
    targetProjectId: string;
    targetProjectCode: string;
    targetProjectName: string;
  }> {
    const { project: sourceProject } = await this.projectAccess.verifyAccess(
      sourceProjectId,
      user,
      'view',
    );
    const { project: targetProject } = await this.projectAccess.verifyAccess(
      input.targetProjectId,
      user,
      'edit',
    );

    if (targetProject.isArchived) {
      throw new BadRequestException('Không thể nhân bản sang dự án đang lưu trữ (Archived)');
    }

    const db = this.dbService.db;
    const includeSubSuites = input.includeSubSuites !== false;
    const includeCases = input.includeCases !== false;
    const targetParentSuiteId = input.targetParentSuiteId ?? null;

    if (targetParentSuiteId) {
      const [targetParent] = await db
        .select({ id: suites.id })
        .from(suites)
        .where(
          and(
            eq(suites.id, targetParentSuiteId),
            eq(suites.projectId, targetProject.id),
            isNull(suites.deletedAt),
          ),
        )
        .limit(1);
      if (!targetParent) {
        throw new BadRequestException('Suite cha đích không tồn tại trong dự án đích');
      }
    }

    const allSourceSuites = await db
      .select()
      .from(suites)
      .where(and(eq(suites.projectId, sourceProjectId), isNull(suites.deletedAt)))
      .orderBy(asc(suites.position), asc(suites.createdAt));

    const rootSource = allSourceSuites.find((s) => s.id === suiteId);
    if (!rootSource) {
      throw new NotFoundException('Suite nguồn không tồn tại');
    }

    // Build topological order (parent before children)
    const collectedSuites: Array<typeof rootSource> = [rootSource];
    if (includeSubSuites) {
      const childrenByParent = new Map<string, Array<typeof rootSource>>();
      for (const s of allSourceSuites) {
        if (!s.parentId) continue;
        const list = childrenByParent.get(s.parentId) ?? [];
        list.push(s);
        childrenByParent.set(s.parentId, list);
      }
      const queue = [rootSource.id];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const kids = childrenByParent.get(cur) ?? [];
        for (const kid of kids) {
          collectedSuites.push(kid);
          queue.push(kid.id);
        }
      }
    }

    const isSameProject = targetProject.id === sourceProjectId;
    const existingTargetSiblings = await db
      .select({ position: suites.position })
      .from(suites)
      .where(
        and(
          eq(suites.projectId, targetProject.id),
          isNull(suites.deletedAt),
          targetParentSuiteId
            ? eq(suites.parentId, targetParentSuiteId)
            : isNull(suites.parentId),
        ),
      );
    const rootNextPosition =
      existingTargetSiblings.length === 0
        ? 0
        : Math.max(...existingTargetSiblings.map((s) => s.position)) + 1;

    const oldToNewSuiteId = new Map<string, string>();
    const newSuiteTitleById = new Map<string, string>();

    for (let i = 0; i < collectedSuites.length; i++) {
      const src = collectedSuites[i];
      const isRoot = src.id === rootSource.id;
      const mappedParentId = isRoot
        ? targetParentSuiteId
        : (src.parentId ? oldToNewSuiteId.get(src.parentId) ?? targetParentSuiteId : targetParentSuiteId);
      const nextTitle =
        isRoot && isSameProject && mappedParentId === (src.parentId ?? null)
          ? `${src.title} (Copy)`
          : src.title;

      const [created] = await db
        .insert(suites)
        .values({
          projectId: targetProject.id,
          parentId: mappedParentId,
          title: nextTitle,
          description: src.description,
          position: isRoot ? rootNextPosition : src.position,
        })
        .returning();

      oldToNewSuiteId.set(src.id, created.id);
      newSuiteTitleById.set(created.id, created.title);
    }

    let copiedCasesCount = 0;
    if (includeCases) {
      const sourceSuiteIds = collectedSuites.map((s) => s.id);
      const sourceCases = await db
        .select()
        .from(testCases)
        .where(
          and(
            eq(testCases.projectId, sourceProjectId),
            inArray(testCases.suiteId, sourceSuiteIds),
            isNull(testCases.deletedAt),
          ),
        )
        .orderBy(asc(testCases.seqNumber));

      if (sourceCases.length > 0) {
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

        const sharedStepIds = Array.from(
          new Set(sourceSteps.map((s) => s.sharedStepId).filter((id): id is string => Boolean(id))),
        );
        const sharedStepMap = new Map<
          string,
          Array<{ action: string; data: string; expectedResult: string }>
        >();
        if (sharedStepIds.length > 0 && !isSameProject) {
          const sharedRows = await db
            .select()
            .from(sharedSteps)
            .where(inArray(sharedSteps.id, sharedStepIds));
          for (const sr of sharedRows) {
            sharedStepMap.set(sr.id, Array.isArray(sr.steps) ? sr.steps : []);
          }
        }

        const stepsByCase = new Map<string, typeof sourceSteps>();
        for (const s of sourceSteps) {
          const list = stepsByCase.get(s.testCaseId) ?? [];
          list.push(s);
          stepsByCase.set(s.testCaseId, list);
        }

        const [updatedProj] = await db
          .update(projects)
          .set({ caseCounter: sql`${projects.caseCounter} + ${sourceCases.length}` })
          .where(eq(projects.id, targetProject.id))
          .returning({ caseCounter: projects.caseCounter });

        let nextSeq = updatedProj.caseCounter - sourceCases.length + 1;

        for (const src of sourceCases) {
          const mappedSuiteId = src.suiteId ? (oldToNewSuiteId.get(src.suiteId) ?? null) : null;
          const seqNum = nextSeq++;
          const [cloned] = await db
            .insert(testCases)
            .values({
              projectId: targetProject.id,
              suiteId: mappedSuiteId,
              seqNumber: seqNum,
              currentVersion: 1,
              title: src.title,
              description: src.description,
              preconditions: src.preconditions,
              priority: src.priority,
              severity: src.severity,
              type: src.type,
              automationStatus: src.automationStatus,
              status: src.status,
              tags: src.tags,
              jiraIssueKeys: src.jiraIssueKeys,
              position: seqNum,
              createdBy: user.id,
              updatedBy: user.id,
            })
            .returning();

          const srcSteps = stepsByCase.get(src.id) ?? [];
          const expandedSteps: Array<{
            testCaseId: string;
            sharedStepId: string | null;
            stepOrder: number;
            action: string;
            data: string;
            expectedResult: string;
          }> = [];

          for (const s of srcSteps) {
            if (!isSameProject && s.sharedStepId && sharedStepMap.has(s.sharedStepId)) {
              const items = sharedStepMap.get(s.sharedStepId) ?? [];
              for (const item of items) {
                expandedSteps.push({
                  testCaseId: cloned.id,
                  sharedStepId: null,
                  stepOrder: expandedSteps.length,
                  action: item.action ?? '',
                  data: item.data ?? '',
                  expectedResult: item.expectedResult ?? '',
                });
              }
            } else {
              expandedSteps.push({
                testCaseId: cloned.id,
                sharedStepId: isSameProject ? s.sharedStepId || null : null,
                stepOrder: expandedSteps.length,
                action: s.action,
                data: s.data,
                expectedResult: s.expectedResult,
              });
            }
          }

          if (expandedSteps.length > 0) {
            await db.insert(testSteps).values(expandedSteps);
          }

          await db.insert(testCaseVersions).values({
            projectId: targetProject.id,
            testCaseId: cloned.id,
            caseCode: `${targetProject.code}-${seqNum}`,
            versionNumber: 1,
            action: 'CLONED',
            versionState: 'ACTIVE',
            summary: isSameProject
              ? `Nhân bản cùng Suite "${rootSource.title}"`
              : `Nhân bản cùng Suite "${rootSource.title}" từ dự án ${sourceProject.code}`,
            changes: [],
            snapshot: {
              title: cloned.title,
              suiteId: mappedSuiteId,
              suiteTitle: mappedSuiteId ? (newSuiteTitleById.get(mappedSuiteId) ?? null) : null,
              description: cloned.description,
              preconditions: cloned.preconditions,
              priority: cloned.priority as Priority,
              severity: cloned.severity as Severity,
              type: cloned.type as TestCaseType,
              automationStatus: cloned.automationStatus as AutomationStatus,
              status: cloned.status as TestCaseStatus,
              tags: cloned.tags ?? [],
              jiraIssueKeys: cloned.jiraIssueKeys ?? [],
              steps: expandedSteps.map((st, idx) => ({
                stepOrder: idx,
                action: st.action,
                data: st.data,
                expectedResult: st.expectedResult,
              })),
            },
            changedBy: user.id,
          });

          copiedCasesCount++;
        }
      }
    }

    return {
      copiedSuitesCount: collectedSuites.length,
      copiedCasesCount,
      rootSuiteId: oldToNewSuiteId.get(rootSource.id)!,
      targetProjectId: targetProject.id,
      targetProjectCode: targetProject.code,
      targetProjectName: targetProject.name,
    };
  }
}
