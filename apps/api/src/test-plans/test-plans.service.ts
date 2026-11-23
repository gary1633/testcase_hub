import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { testCases, testPlanCases, testPlans, testRuns, users } from '../db/schema';
import type { AuthUser } from '../common/auth-user.interface';
import { ProjectAccessService } from '../common/project-access.service';
import type { TestPlanDetailDto, TestPlanSummaryDto } from '@tcms/shared';

@Injectable()
export class TestPlansService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async listPlans(projectId: string, user: AuthUser): Promise<TestPlanSummaryDto[]> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const plans = await db
      .select()
      .from(testPlans)
      .where(eq(testPlans.projectId, projectId))
      .orderBy(desc(testPlans.updatedAt));

    if (plans.length === 0) return [];
    const planIds = plans.map((p) => p.id);
    const creatorIds = Array.from(
      new Set(plans.map((p) => p.createdBy).filter(Boolean) as string[]),
    );

    const [caseAggs, runAggs, userRows] = await Promise.all([
      db
        .select({ planId: testPlanCases.planId, total: count() })
        .from(testPlanCases)
        .where(inArray(testPlanCases.planId, planIds))
        .groupBy(testPlanCases.planId),
      db
        .select({ planId: testRuns.planId, total: count() })
        .from(testRuns)
        .where(inArray(testRuns.planId, planIds))
        .groupBy(testRuns.planId),
      creatorIds.length > 0
        ? db
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, creatorIds))
        : Promise.resolve([]),
    ]);

    const caseMap = new Map(caseAggs.map((r) => [r.planId, Number(r.total)]));
    const runMap = new Map(
      runAggs.filter((r) => r.planId).map((r) => [r.planId!, Number(r.total)]),
    );
    const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

    return plans.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      title: p.title,
      description: p.description,
      caseCount: caseMap.get(p.id) ?? 0,
      runCount: runMap.get(p.id) ?? 0,
      createdByName: p.createdBy ? userMap.get(p.createdBy) ?? null : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async getPlan(projectId: string, planId: string, user: AuthUser): Promise<TestPlanDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'view');
    const db = this.dbService.db;

    const [plan] = await db
      .select()
      .from(testPlans)
      .where(and(eq(testPlans.id, planId), eq(testPlans.projectId, projectId)))
      .limit(1);

    if (!plan) throw new NotFoundException('Không tìm thấy Test Plan');

    const [caseRows, [runAgg], creatorRow] = await Promise.all([
      db
        .select({ testCaseId: testPlanCases.testCaseId })
        .from(testPlanCases)
        .where(eq(testPlanCases.planId, planId))
        .orderBy(asc(testPlanCases.position)),
      db.select({ total: count() }).from(testRuns).where(eq(testRuns.planId, planId)),
      plan.createdBy
        ? db
            .select({ fullName: users.fullName })
            .from(users)
            .where(eq(users.id, plan.createdBy))
            .limit(1)
            .then((r) => r[0])
        : Promise.resolve(undefined),
    ]);

    return {
      id: plan.id,
      projectId: plan.projectId,
      title: plan.title,
      description: plan.description,
      caseCount: caseRows.length,
      runCount: Number(runAgg?.total ?? 0),
      createdByName: creatorRow?.fullName ?? null,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      caseIds: caseRows.map((c) => c.testCaseId),
    };
  }

  async createPlan(
    projectId: string,
    user: AuthUser,
    input: { title: string; description?: string | null; caseIds: string[] },
  ): Promise<TestPlanDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const uniqueCaseIds = Array.from(new Set(input.caseIds));
    if (uniqueCaseIds.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 Test Case cho Test Plan');
    }

    const validCases = await db
      .select({ id: testCases.id })
      .from(testCases)
      .where(
        and(
          eq(testCases.projectId, projectId),
          isNull(testCases.deletedAt),
          inArray(testCases.id, uniqueCaseIds),
        ),
      );
    const validSet = new Set(validCases.map((c) => c.id));
    const filteredIds = uniqueCaseIds.filter((id) => validSet.has(id));
    if (filteredIds.length === 0) {
      throw new BadRequestException('Danh sách Test Case không hợp lệ');
    }

    const [created] = await db
      .insert(testPlans)
      .values({
        projectId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        createdBy: user.id,
      })
      .returning();

    await db.insert(testPlanCases).values(
      filteredIds.map((cid, idx) => ({
        planId: created.id,
        testCaseId: cid,
        position: idx,
      })),
    );

    return this.getPlan(projectId, created.id, user);
  }

  async updatePlan(
    projectId: string,
    planId: string,
    user: AuthUser,
    input: { title?: string; description?: string | null; caseIds?: string[] },
  ): Promise<TestPlanDetailDto> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    const db = this.dbService.db;

    const [existing] = await db
      .select({ id: testPlans.id })
      .from(testPlans)
      .where(and(eq(testPlans.id, planId), eq(testPlans.projectId, projectId)))
      .limit(1);
    if (!existing) throw new NotFoundException('Không tìm thấy Test Plan');

    const updateData: Partial<typeof testPlans.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim() || null;

    await db.update(testPlans).set(updateData).where(eq(testPlans.id, planId));

    if (input.caseIds !== undefined) {
      const uniqueCaseIds = Array.from(new Set(input.caseIds));
      if (uniqueCaseIds.length === 0) {
        throw new BadRequestException('Test Plan cần có ít nhất 1 Test Case');
      }
      const validCases = await db
        .select({ id: testCases.id })
        .from(testCases)
        .where(
          and(
            eq(testCases.projectId, projectId),
            isNull(testCases.deletedAt),
            inArray(testCases.id, uniqueCaseIds),
          ),
        );
      const validSet = new Set(validCases.map((c) => c.id));
      const filteredIds = uniqueCaseIds.filter((id) => validSet.has(id));

      await db.delete(testPlanCases).where(eq(testPlanCases.planId, planId));
      if (filteredIds.length > 0) {
        await db.insert(testPlanCases).values(
          filteredIds.map((cid, idx) => ({
            planId,
            testCaseId: cid,
            position: idx,
          })),
        );
      }
    }

    return this.getPlan(projectId, planId, user);
  }

  async deletePlan(projectId: string, planId: string, user: AuthUser): Promise<{ deleted: boolean }> {
    await this.projectAccess.verifyAccess(projectId, user, 'edit');
    await this.dbService.db
      .delete(testPlans)
      .where(and(eq(testPlans.id, planId), eq(testPlans.projectId, projectId)));
    return { deleted: true };
  }
}
