import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { projects, sharedSteps, testCases, testSteps, users } from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import type { SharedStepDto, SharedStepItemDto } from '@tcms/shared';

@Injectable()
export class SharedStepsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async listSharedSteps(projectId: string, user: AuthUser): Promise<SharedStepDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const rows = await db
      .select()
      .from(sharedSteps)
      .where(eq(sharedSteps.projectId, projectId))
      .orderBy(asc(sharedSteps.seqNumber));

    if (rows.length === 0) return [];

    const ssIds = rows.map((r) => r.id);
    const creatorIds = Array.from(
      new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[]),
    );

    const [usageRows, userRows] = await Promise.all([
      db
        .select({
          sharedStepId: testSteps.sharedStepId,
          total: sql<number>`COUNT(DISTINCT ${testSteps.testCaseId})::int`,
        })
        .from(testSteps)
        .innerJoin(testCases, eq(testSteps.testCaseId, testCases.id))
        .where(and(inArray(testSteps.sharedStepId, ssIds), isNull(testCases.deletedAt)))
        .groupBy(testSteps.sharedStepId),
      creatorIds.length > 0
        ? db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, creatorIds))
        : Promise.resolve([]),
    ]);

    const usageMap = new Map(
      usageRows.filter((u) => u.sharedStepId).map((u) => [u.sharedStepId!, Number(u.total)]),
    );
    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      seqNumber: r.seqNumber,
      code: `SS-${r.seqNumber}`,
      title: r.title,
      steps: Array.isArray(r.steps) ? r.steps : [],
      usedInCaseCount: usageMap.get(r.id) ?? 0,
      createdByName: r.createdBy ? userMap.get(r.createdBy) ?? null : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async createSharedStep(
    projectId: string,
    user: AuthUser,
    input: { title: string; steps: SharedStepItemDto[] },
  ): Promise<SharedStepDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const cleanSteps = input.steps
      .filter((s) => s.action.trim() || s.data.trim() || s.expectedResult.trim())
      .map((s) => ({
        action: s.action ?? '',
        data: s.data ?? '',
        expectedResult: s.expectedResult ?? '',
      }));
    if (cleanSteps.length === 0) {
      throw new BadRequestException('Shared Step cần có ít nhất 1 bước thực hiện');
    }

    const existingSeqs = await db
      .select({ seqNumber: sharedSteps.seqNumber })
      .from(sharedSteps)
      .where(eq(sharedSteps.projectId, projectId));
    const nextSeq =
      existingSeqs.length === 0 ? 1 : Math.max(...existingSeqs.map((s) => s.seqNumber)) + 1;

    const [created] = await db
      .insert(sharedSteps)
      .values({
        projectId,
        seqNumber: nextSeq,
        title: input.title.trim(),
        steps: cleanSteps,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();

    return {
      id: created.id,
      projectId: created.projectId,
      seqNumber: created.seqNumber,
      code: `SS-${created.seqNumber}`,
      title: created.title,
      steps: created.steps,
      usedInCaseCount: 0,
      createdByName: user.fullName,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateSharedStep(
    projectId: string,
    sharedStepId: string,
    user: AuthUser,
    input: { title?: string; steps?: SharedStepItemDto[] },
  ): Promise<SharedStepDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(sharedSteps)
      .where(and(eq(sharedSteps.id, sharedStepId), eq(sharedSteps.projectId, projectId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Shared Step');

    const updateData: Partial<typeof sharedSteps.$inferInsert> = {
      updatedBy: user.id,
      updatedAt: new Date(),
    };
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.steps !== undefined) {
      const cleanSteps = input.steps
        .filter((s) => s.action.trim() || s.data.trim() || s.expectedResult.trim())
        .map((s) => ({
          action: s.action ?? '',
          data: s.data ?? '',
          expectedResult: s.expectedResult ?? '',
        }));
      if (cleanSteps.length === 0) {
        throw new BadRequestException('Shared Step cần có ít nhất 1 bước thực hiện');
      }
      updateData.steps = cleanSteps;
    }

    const [updated] = await db
      .update(sharedSteps)
      .set(updateData)
      .where(eq(sharedSteps.id, sharedStepId))
      .returning();

    // Sync cached title in referencing test_steps rows
    if (input.title !== undefined) {
      await db
        .update(testSteps)
        .set({ action: updated.title })
        .where(eq(testSteps.sharedStepId, sharedStepId));
    }

    const [usageRow] = await db
      .select({ total: sql<number>`COUNT(DISTINCT ${testSteps.testCaseId})::int` })
      .from(testSteps)
      .innerJoin(testCases, eq(testSteps.testCaseId, testCases.id))
      .where(and(eq(testSteps.sharedStepId, sharedStepId), isNull(testCases.deletedAt)));

    return {
      id: updated.id,
      projectId: updated.projectId,
      seqNumber: updated.seqNumber,
      code: `SS-${updated.seqNumber}`,
      title: updated.title,
      steps: updated.steps,
      usedInCaseCount: Number(usageRow?.total ?? 0),
      createdByName: null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteSharedStep(
    projectId: string,
    sharedStepId: string,
    user: AuthUser,
  ): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select()
      .from(sharedSteps)
      .where(and(eq(sharedSteps.id, sharedStepId), eq(sharedSteps.projectId, projectId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Shared Step');

    // Convert any referencing steps into inline plain steps preserving current text before removing
    const summaryText = existing.steps
      .map((s, i) => `${i + 1}. ${s.action}`)
      .join('\n');
    await db
      .update(testSteps)
      .set({
        sharedStepId: null,
        action: `[Shared: ${existing.title}]\n${summaryText}`,
      })
      .where(eq(testSteps.sharedStepId, sharedStepId));

    await db
      .delete(sharedSteps)
      .where(and(eq(sharedSteps.id, sharedStepId), eq(sharedSteps.projectId, projectId)));

    return { deleted: true };
  }
}
