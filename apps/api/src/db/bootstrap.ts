import { sql } from 'drizzle-orm';
import type { AppDb } from './client';

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'QA',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users (email)`,

  `CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    description TEXT,
    color VARCHAR(32) NOT NULL DEFAULT 'brand',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS teams_name_uidx ON teams (name)`,

  `CREATE TABLE IF NOT EXISTS team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members (user_id)`,

  `CREATE TABLE IF NOT EXISTS password_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS password_reset_requests_status_idx ON password_reset_requests (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS password_reset_requests_user_idx ON password_reset_requests (user_id)`,

  `CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(16) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    case_counter INTEGER NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS projects_code_uidx ON projects (code)`,

  `CREATE TABLE IF NOT EXISTS project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'QA',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id)`,

  `CREATE TABLE IF NOT EXISTS project_favorites (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS project_favorites_user_idx ON project_favorites (user_id)`,

  `CREATE TABLE IF NOT EXISTS project_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    config JSONB NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_integrations_proj_prov_uidx ON project_integrations (project_id, provider)`,

  `CREATE TABLE IF NOT EXISTS suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES suites(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS suites_project_idx ON suites (project_id)`,
  `CREATE INDEX IF NOT EXISTS suites_parent_idx ON suites (parent_id)`,

  `CREATE TABLE IF NOT EXISTS test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    suite_id UUID REFERENCES suites(id) ON DELETE SET NULL,
    seq_number INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    preconditions TEXT NOT NULL DEFAULT '',
    priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    severity VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
    type VARCHAR(32) NOT NULL DEFAULT 'FUNCTIONAL',
    automation_status VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    jira_issue_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    position INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS test_cases_project_seq_uidx ON test_cases (project_id, seq_number)`,
  `CREATE INDEX IF NOT EXISTS test_cases_project_suite_idx ON test_cases (project_id, suite_id)`,
  `CREATE INDEX IF NOT EXISTS test_cases_project_priority_idx ON test_cases (project_id, priority)`,
  `CREATE INDEX IF NOT EXISTS test_cases_project_auto_idx ON test_cases (project_id, automation_status)`,
  `CREATE INDEX IF NOT EXISTS test_cases_project_updated_idx ON test_cases (project_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS test_cases_tags_gin_idx ON test_cases USING GIN (tags)`,
  `CREATE INDEX IF NOT EXISTS test_cases_jira_gin_idx ON test_cases USING GIN (jira_issue_keys)`,

  `CREATE TABLE IF NOT EXISTS test_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL DEFAULT 0,
    action TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '',
    expected_result TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS test_steps_case_order_idx ON test_steps (test_case_id, step_order)`,

  `CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS attachments_case_idx ON attachments (test_case_id)`,

  `ALTER TABLE suites ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE suites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1`,

  `CREATE TABLE IF NOT EXISTS shared_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    seq_number INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS shared_steps_project_seq_uidx ON shared_steps (project_id, seq_number)`,
  `CREATE INDEX IF NOT EXISTS shared_steps_project_idx ON shared_steps (project_id)`,

  `ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS shared_step_id UUID REFERENCES shared_steps(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS test_steps_shared_step_idx ON test_steps (shared_step_id)`,

  `CREATE TABLE IF NOT EXISTS test_case_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS test_case_comments_case_idx ON test_case_comments (test_case_id, created_at ASC)`,

  `CREATE TABLE IF NOT EXISTS project_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL DEFAULT 'SLACK',
    webhook_url TEXT NOT NULL DEFAULT '',
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    notify_on_run_completed BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_high_defect BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_webhooks_project_uidx ON project_webhooks (project_id)`,

  `CREATE TABLE IF NOT EXISTS project_api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    token_prefix VARCHAR(24) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_api_tokens_hash_uidx ON project_api_tokens (token_hash)`,
  `CREATE INDEX IF NOT EXISTS project_api_tokens_proj_idx ON project_api_tokens (project_id)`,

  `CREATE TABLE IF NOT EXISTS test_case_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE SET NULL,
    case_code VARCHAR(32) NOT NULL,
    version_number INTEGER NOT NULL,
    action VARCHAR(32) NOT NULL,
    version_state VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    summary TEXT NOT NULL DEFAULT '',
    changes JSONB NOT NULL DEFAULT '[]'::jsonb,
    snapshot JSONB NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_by_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS test_case_versions_case_ver_idx ON test_case_versions (test_case_id, version_number DESC)`,
  `CREATE INDEX IF NOT EXISTS test_case_versions_proj_created_idx ON test_case_versions (project_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS test_case_versions_proj_code_idx ON test_case_versions (project_id, case_code)`,

  `CREATE TABLE IF NOT EXISTS test_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS test_plans_project_idx ON test_plans (project_id)`,

  `CREATE TABLE IF NOT EXISTS test_plan_cases (
    plan_id UUID NOT NULL REFERENCES test_plans(id) ON DELETE CASCADE,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    default_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (plan_id, test_case_id)
  )`,

  `CREATE TABLE IF NOT EXISTS test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES test_plans(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    environment VARCHAR(64) NOT NULL DEFAULT 'Staging',
    app_version VARCHAR(64) NOT NULL DEFAULT '1.0.0',
    planned_date VARCHAR(32),
    jira_issue_key VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    last_jira_synced_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS test_runs_project_idx ON test_runs (project_id, started_at DESC)`,
  `ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES test_runs(id) ON DELETE SET NULL`,
  `ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'MANUAL'`,

  `CREATE TABLE IF NOT EXISTS test_run_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE SET NULL,
    case_code VARCHAR(32) NOT NULL,
    case_version INTEGER NOT NULL DEFAULT 1,
    case_snapshot JSONB NOT NULL,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'NOT_EXECUTED',
    actual_result TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    step_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    planned_date VARCHAR(32),
    executed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    executed_at TIMESTAMPTZ,
    jira_bug_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS test_run_results_run_idx ON test_run_results (run_id, position)`,
  `CREATE INDEX IF NOT EXISTS test_run_results_status_idx ON test_run_results (run_id, status)`,

  `CREATE TABLE IF NOT EXISTS defects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id UUID REFERENCES test_runs(id) ON DELETE SET NULL,
    run_result_id UUID REFERENCES test_run_results(id) ON DELETE SET NULL,
    case_code VARCHAR(32),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    severity VARCHAR(24) NOT NULL DEFAULT 'HIGH',
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    jira_issue_key VARCHAR(64),
    jira_issue_url VARCHAR(500),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS defects_project_idx ON defects (project_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS defects_run_idx ON defects (run_id)`,
  `ALTER TABLE defects ADD COLUMN IF NOT EXISTS steps_to_reproduce TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE defects ADD COLUMN IF NOT EXISTS actual_result TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE defects ADD COLUMN IF NOT EXISTS expected_result TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE defects ADD COLUMN IF NOT EXISTS priority VARCHAR(24) NOT NULL DEFAULT 'MEDIUM'`,
  `ALTER TABLE defects ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb`,

  `CREATE TABLE IF NOT EXISTS test_run_result_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    run_result_id UUID NOT NULL REFERENCES test_run_results(id) ON DELETE CASCADE,
    case_code VARCHAR(32) NOT NULL,
    case_title VARCHAR(500) NOT NULL,
    event_type VARCHAR(32) NOT NULL DEFAULT 'STATUS_CHANGED',
    from_status VARCHAR(32),
    to_status VARCHAR(32),
    summary TEXT NOT NULL DEFAULT '',
    actual_result TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS test_run_result_history_res_idx ON test_run_result_history (run_result_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS test_run_result_history_run_idx ON test_run_result_history (run_id, created_at DESC)`,
];

export async function ensureSchema(db: AppDb): Promise<void> {
  for (const statement of DDL_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
}

export async function backfillMissingVersions(db: AppDb): Promise<number> {
  const { projects, suites, testCases, testSteps, testCaseVersions, users } = await import(
    './schema'
  );
  const { asc, eq, inArray } = await import('drizzle-orm');

  const allCases = await db.select().from(testCases);
  if (allCases.length === 0) return 0;

  const existingVers = await db
    .select({ testCaseId: testCaseVersions.testCaseId })
    .from(testCaseVersions);
  const hasVersionSet = new Set(existingVers.map((v) => v.testCaseId).filter(Boolean) as string[]);

  const missing = allCases.filter((c) => !hasVersionSet.has(c.id));
  if (missing.length === 0) return 0;

  const [allProjects, allSuites, allUsers, allSteps] = await Promise.all([
    db.select().from(projects),
    db.select().from(suites),
    db.select({ id: users.id, fullName: users.fullName }).from(users),
    db
      .select()
      .from(testSteps)
      .where(
        inArray(
          testSteps.testCaseId,
          missing.map((m) => m.id),
        ),
      )
      .orderBy(asc(testSteps.stepOrder)),
  ]);

  const projMap = new Map(allProjects.map((p) => [p.id, p.code]));
  const suiteMap = new Map(allSuites.map((s) => [s.id, s.title]));
  const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));
  const stepsByCase = new Map<string, Array<typeof testSteps.$inferSelect>>();
  for (const s of allSteps) {
    const list = stepsByCase.get(s.testCaseId) ?? [];
    list.push(s);
    stepsByCase.set(s.testCaseId, list);
  }

  for (const c of missing) {
    const code = `${projMap.get(c.projectId) || 'TC'}-${c.seqNumber}`;
    const steps = (stepsByCase.get(c.id) ?? []).map((s) => ({
      stepOrder: s.stepOrder,
      action: s.action,
      data: s.data,
      expectedResult: s.expectedResult,
    }));

    await db.insert(testCaseVersions).values({
      projectId: c.projectId,
      testCaseId: c.id,
      caseCode: code,
      versionNumber: c.currentVersion || 1,
      action: 'CREATED',
      versionState: 'ACTIVE',
      summary: 'Khởi tạo Test Case (v1)',
      changes: [],
      snapshot: {
        title: c.title,
        suiteId: c.suiteId,
        suiteTitle: c.suiteId ? suiteMap.get(c.suiteId) ?? null : null,
        description: c.description,
        preconditions: c.preconditions,
        priority: c.priority as any,
        severity: c.severity as any,
        type: c.type as any,
        automationStatus: c.automationStatus as any,
        status: c.status as any,
        tags: Array.isArray(c.tags) ? c.tags : [],
        jiraIssueKeys: Array.isArray(c.jiraIssueKeys) ? c.jiraIssueKeys : [],
        steps,
      },
      changedBy: c.createdBy,
      changedByName: c.createdBy ? userMap.get(c.createdBy) ?? 'System' : 'System',
      createdAt: c.createdAt,
    });
    if (!c.currentVersion) {
      await db.update(testCases).set({ currentVersion: 1 }).where(eq(testCases.id, c.id));
    }
  }

  return missing.length;
}

export async function seedPhase2SampleIfEmpty(db: AppDb): Promise<boolean> {
  const {
    defects,
    projects,
    suites,
    testCases,
    testPlanCases,
    testPlans,
    testRunResults,
    testRuns,
    testSteps,
    users,
  } = await import('./schema');
  const { asc, count, eq, inArray } = await import('drizzle-orm');

  const [{ value: runCount }] = await db.select({ value: count() }).from(testRuns);
  if (runCount > 0) return false;

  const [webProject] = await db
    .select()
    .from(projects)
    .where(eq(projects.code, 'WEB'))
    .limit(1);
  if (!webProject) return false;

  const [qaUser, leadUser] = await Promise.all([
    db.select().from(users).where(eq(users.email, 'qa@company.local')).limit(1).then((r) => r[0]),
    db.select().from(users).where(eq(users.email, 'lead@company.local')).limit(1).then((r) => r[0]),
  ]);

  const cases = await db
    .select()
    .from(testCases)
    .where(eq(testCases.projectId, webProject.id))
    .orderBy(asc(testCases.seqNumber))
    .limit(8);
  if (cases.length === 0) return false;

  const [allSuites, allSteps] = await Promise.all([
    db.select().from(suites).where(eq(suites.projectId, webProject.id)),
    db
      .select()
      .from(testSteps)
      .where(
        inArray(
          testSteps.testCaseId,
          cases.map((c) => c.id),
        ),
      )
      .orderBy(asc(testSteps.stepOrder)),
  ]);

  const suiteMap = new Map(allSuites.map((s) => [s.id, s.title]));
  const stepsByCase = new Map<string, Array<typeof testSteps.$inferSelect>>();
  for (const s of allSteps) {
    const list = stepsByCase.get(s.testCaseId) ?? [];
    list.push(s);
    stepsByCase.set(s.testCaseId, list);
  }

  // 1. Sample Test Plan
  const [plan] = await db
    .insert(testPlans)
    .values({
      projectId: webProject.id,
      title: 'Release v2.1 — Smoke & Checkout Regression',
      description:
        'Bộ kịch bản kiểm thử trọng yếu trước khi golive Release v2.1 (Đăng nhập, Tìm kiếm, Thanh toán VNPay).',
      createdBy: leadUser?.id ?? null,
    })
    .returning();

  await db.insert(testPlanCases).values(
    cases.map((c, idx) => ({
      planId: plan.id,
      testCaseId: c.id,
      defaultAssigneeId: qaUser?.id ?? null,
      position: idx,
    })),
  );

  // 2. Sample Test Run
  const today = new Date();
  const plannedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
  const [run] = await db
    .insert(testRuns)
    .values({
      projectId: webProject.id,
      planId: plan.id,
      title: 'Sprint 24 — Release v2.1 UAT',
      description: 'Kiểm thử nghiệm thu trên môi trường UAT trước đợt phát hành.',
      environment: 'UAT',
      appVersion: '2.1.0',
      plannedDate,
      jiraIssueKey: 'ECOM-100',
      status: 'IN_PROGRESS',
      createdBy: leadUser?.id ?? null,
    })
    .returning();

  const sampleOutcomes = [
    { status: 'PASSED', actual: 'Đăng nhập thành công, redirect về trang chủ và lưu token đúng.' },
    { status: 'PASSED', actual: 'Tài khoản bị khóa đúng 15 phút sau 5 lần sai mật khẩu.' },
    { status: 'PASSED', actual: 'Liên kết OAuth Google tạo hồ sơ mới chính xác.' },
    { status: 'BLOCKED', actual: 'Chưa test được do SMTP server UAT đang bảo trì.' },
    { status: 'PASSED', actual: 'Tìm kiếm không dấu trả về đúng sản phẩm tiếng Việt.' },
    { status: 'NOT_EXECUTED', actual: '' },
    {
      status: 'FAILED',
      actual: 'Callback IPN từ VNPay Sandbox trả về 500 Internal Server Error, đơn hàng giữ nguyên Pending.',
    },
    { status: 'NOT_EXECUTED', actual: '' },
  ];

  let failedResultId: string | null = null;
  let failedCaseCode: string | null = null;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const outcome = sampleOutcomes[i] || { status: 'NOT_EXECUTED', actual: '' };
    const code = `${webProject.code}-${c.seqNumber}`;
    const cSteps = (stepsByCase.get(c.id) ?? []).map((s) => ({
      stepOrder: s.stepOrder,
      action: s.action,
      data: s.data,
      expectedResult: s.expectedResult,
    }));

    const [resRow] = await db
      .insert(testRunResults)
      .values({
        runId: run.id,
        testCaseId: c.id,
        caseCode: code,
        caseVersion: c.currentVersion || 1,
        caseSnapshot: {
          title: c.title,
          suiteId: c.suiteId,
          suiteTitle: c.suiteId ? suiteMap.get(c.suiteId) ?? null : null,
          description: c.description,
          preconditions: c.preconditions,
          priority: c.priority as any,
          severity: c.severity as any,
          type: c.type as any,
          automationStatus: c.automationStatus as any,
          status: c.status as any,
          tags: Array.isArray(c.tags) ? c.tags : [],
          jiraIssueKeys: Array.isArray(c.jiraIssueKeys) ? c.jiraIssueKeys : [],
          steps: cSteps,
        },
        assigneeId: qaUser?.id ?? null,
        status: outcome.status,
        actualResult: outcome.actual,
        comment:
          outcome.status === 'FAILED'
            ? 'Đã log lỗi và gửi log IPN cho team Backend Payment kiểm tra.'
            : '',
        stepResults: cSteps.map((s) => ({
          stepOrder: s.stepOrder,
          status:
            outcome.status === 'PASSED'
              ? 'PASSED'
              : outcome.status === 'FAILED' && s.stepOrder === cSteps.length - 1
                ? 'FAILED'
                : outcome.status === 'FAILED'
                  ? 'PASSED'
                  : 'UNSET',
        })),
        plannedDate,
        executedBy: outcome.status !== 'NOT_EXECUTED' ? (qaUser?.id ?? null) : null,
        executedAt: outcome.status !== 'NOT_EXECUTED' ? new Date() : null,
        jiraBugKeys: outcome.status === 'FAILED' ? ['ECOM-512'] : [],
        evidence: [],
        position: i,
      })
      .returning();

    if (outcome.status === 'FAILED') {
      failedResultId = resRow.id;
      failedCaseCode = code;
    }
  }

  // 3. Sample Defect linked to the Failed result
  if (failedResultId) {
    await db.insert(defects).values({
      projectId: webProject.id,
      runId: run.id,
      runResultId: failedResultId,
      caseCode: failedCaseCode,
      title: '[VNPay QR] Callback IPN trả về HTTP 500 không cập nhật trạng thái Paid',
      description:
        'Khi hoàn tất thanh toán trên VNPay Sandbox, webhook IPN bị lỗi 500 NullPointerException ở PaymentController, dẫn tới đơn hàng kẹt ở trạng thái Pending Payment.',
      severity: 'HIGHEST',
      status: 'OPEN',
      jiraIssueKey: 'ECOM-512',
      jiraIssueUrl: 'https://your-company.atlassian.net/browse/ECOM-512',
      createdBy: qaUser?.id ?? null,
    });
  }

  return true;
}

export async function backfillRunExecutionHistory(db: AppDb): Promise<number> {
  const { testRunResultHistory, testRunResults, users } = await import('./schema');
  const { ne } = await import('drizzle-orm');

  const executed = await db
    .select()
    .from(testRunResults)
    .where(ne(testRunResults.status, 'NOT_EXECUTED'));
  if (executed.length === 0) return 0;

  const existing = await db
    .select({ runResultId: testRunResultHistory.runResultId })
    .from(testRunResultHistory);
  const existingSet = new Set(existing.map((e) => e.runResultId));

  const missing = executed.filter((r) => !existingSet.has(r.id));
  if (missing.length === 0) return 0;

  const allUsers = await db.select({ id: users.id, fullName: users.fullName }).from(users);
  const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

  for (const r of missing) {
    await db.insert(testRunResultHistory).values({
      runId: r.runId,
      runResultId: r.id,
      caseCode: r.caseCode,
      caseTitle: r.caseSnapshot?.title || r.caseCode,
      eventType: 'STATUS_CHANGED',
      fromStatus: 'NOT_EXECUTED',
      toStatus: r.status,
      summary: `Đánh dấu trạng thái ${r.status}`,
      actualResult: r.actualResult || '',
      comment: r.comment || '',
      actorId: r.executedBy,
      actorName: r.executedBy ? userMap.get(r.executedBy) ?? 'QA' : 'QA',
      createdAt: r.executedAt || new Date(),
    });
  }

  return missing.length;
}
