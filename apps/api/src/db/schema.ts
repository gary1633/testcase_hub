import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import type {
  FieldDiffDto,
  RunEvidenceDto,
  StepExecutionResultDto,
  TestCaseSnapshotDto,
} from '@tcms/shared';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    role: varchar('role', { length: 32 }).notNull().default('QA'),
    isActive: boolean('is_active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_uidx').on(table.email),
  }),
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    color: varchar('color', { length: 32 }).notNull().default('brand'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('teams_name_uidx').on(table.name),
  }),
);

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
    userIdx: index('team_members_user_idx').on(table.userId),
  }),
);

export const passwordResetRequests = pgTable(
  'password_reset_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    note: text('note').notNull().default(''),
    status: varchar('status', { length: 32 }).notNull().default('PENDING'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    statusCreatedIdx: index('password_reset_requests_status_idx').on(
      table.status,
      table.createdAt,
    ),
    userIdx: index('password_reset_requests_user_idx').on(table.userId),
  }),
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 16 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    caseCounter: integer('case_counter').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: uniqueIndex('projects_code_uidx').on(table.code),
  }),
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 32 }).notNull().default('QA'),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
    userIdx: index('project_members_user_idx').on(table.userId),
  }),
);

export const projectFavorites = pgTable(
  'project_favorites',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
    userIdx: index('project_favorites_user_idx').on(table.userId),
  }),
);

export interface JiraIntegrationRawConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  defaultIssueType: string;
}

export const projectIntegrations = pgTable(
  'project_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(), // 'jira'
    config: jsonb('config').$type<JiraIntegrationRawConfig>().notNull(),
    isEnabled: boolean('is_enabled').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectProviderIdx: uniqueIndex('project_integrations_proj_prov_uidx').on(
      table.projectId,
      table.provider,
    ),
  }),
);

export const projectWebhooks = pgTable(
  'project_webhooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull().default('SLACK'),
    webhookUrl: text('webhook_url').notNull().default(''),
    isEnabled: boolean('is_enabled').notNull().default(false),
    notifyOnRunCompleted: boolean('notify_on_run_completed').notNull().default(true),
    notifyOnHighDefect: boolean('notify_on_high_defect').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: uniqueIndex('project_webhooks_project_uidx').on(table.projectId),
  }),
);

export const projectApiTokens = pgTable(
  'project_api_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    tokenPrefix: varchar('token_prefix', { length: 24 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('project_api_tokens_hash_uidx').on(table.tokenHash),
    projectIdx: index('project_api_tokens_proj_idx').on(table.projectId),
  }),
);

export const suites = pgTable(
  'suites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => suites.id, {
      onDelete: 'cascade',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('suites_project_idx').on(table.projectId),
    parentIdx: index('suites_parent_idx').on(table.parentId),
  }),
);

export const testCases = pgTable(
  'test_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    suiteId: uuid('suite_id').references(() => suites.id, {
      onDelete: 'set null',
    }),
    seqNumber: integer('seq_number').notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description').notNull().default(''),
    preconditions: text('preconditions').notNull().default(''),
    priority: varchar('priority', { length: 32 }).notNull().default('MEDIUM'),
    severity: varchar('severity', { length: 32 }).notNull().default('NORMAL'),
    type: varchar('type', { length: 32 }).notNull().default('FUNCTIONAL'),
    automationStatus: varchar('automation_status', { length: 32 })
      .notNull()
      .default('MANUAL'),
    status: varchar('status', { length: 32 }).notNull().default('ACTIVE'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    jiraIssueKeys: jsonb('jira_issue_keys').$type<string[]>().notNull().default([]),
    position: integer('position').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectSeqIdx: uniqueIndex('test_cases_project_seq_uidx').on(
      table.projectId,
      table.seqNumber,
    ),
    projectSuiteIdx: index('test_cases_project_suite_idx').on(
      table.projectId,
      table.suiteId,
    ),
    projectPriorityIdx: index('test_cases_project_priority_idx').on(
      table.projectId,
      table.priority,
    ),
    projectAutomationIdx: index('test_cases_project_auto_idx').on(
      table.projectId,
      table.automationStatus,
    ),
    projectUpdatedIdx: index('test_cases_project_updated_idx').on(
      table.projectId,
      table.updatedAt,
    ),
  }),
);

export const sharedSteps = pgTable(
  'shared_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    seqNumber: integer('seq_number').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    steps: jsonb('steps')
      .$type<Array<{ action: string; data: string; expectedResult: string }>>()
      .notNull()
      .default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectSeqIdx: uniqueIndex('shared_steps_project_seq_uidx').on(
      table.projectId,
      table.seqNumber,
    ),
    projectIdx: index('shared_steps_project_idx').on(table.projectId),
  }),
);

export const testSteps = pgTable(
  'test_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    testCaseId: uuid('test_case_id')
      .notNull()
      .references(() => testCases.id, { onDelete: 'cascade' }),
    sharedStepId: uuid('shared_step_id').references(() => sharedSteps.id, {
      onDelete: 'set null',
    }),
    stepOrder: integer('step_order').notNull().default(0),
    action: text('action').notNull().default(''),
    data: text('data').notNull().default(''),
    expectedResult: text('expected_result').notNull().default(''),
  },
  (table) => ({
    caseOrderIdx: index('test_steps_case_order_idx').on(
      table.testCaseId,
      table.stepOrder,
    ),
    sharedStepIdx: index('test_steps_shared_step_idx').on(table.sharedStepId),
  }),
);

export const testCaseComments = pgTable(
  'test_case_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    testCaseId: uuid('test_case_id')
      .notNull()
      .references(() => testCases.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    caseCreatedIdx: index('test_case_comments_case_idx').on(
      table.testCaseId,
      table.createdAt,
    ),
  }),
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    testCaseId: uuid('test_case_id')
      .notNull()
      .references(() => testCases.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 255 }).notNull(),
    fileSize: integer('file_size').notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index('attachments_case_idx').on(table.testCaseId),
  }),
);

export const testCaseVersions = pgTable(
  'test_case_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    testCaseId: uuid('test_case_id').references(() => testCases.id, {
      onDelete: 'set null',
    }),
    caseCode: varchar('case_code', { length: 32 }).notNull(),
    versionNumber: integer('version_number').notNull(),
    action: varchar('action', { length: 32 }).notNull(),
    versionState: varchar('version_state', { length: 24 }).notNull().default('ACTIVE'),
    summary: text('summary').notNull().default(''),
    changes: jsonb('changes').$type<FieldDiffDto[]>().notNull().default([]),
    snapshot: jsonb('snapshot').$type<TestCaseSnapshotDto>().notNull(),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedByName: varchar('changed_by_name', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    caseVersionIdx: index('test_case_versions_case_ver_idx').on(
      table.testCaseId,
      table.versionNumber,
    ),
    projectCreatedIdx: index('test_case_versions_proj_created_idx').on(
      table.projectId,
      table.createdAt,
    ),
    projectCodeIdx: index('test_case_versions_proj_code_idx').on(
      table.projectId,
      table.caseCode,
    ),
  }),
);

export const testPlans = pgTable(
  'test_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('test_plans_project_idx').on(table.projectId),
  }),
);

export const testPlanCases = pgTable(
  'test_plan_cases',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => testPlans.id, { onDelete: 'cascade' }),
    testCaseId: uuid('test_case_id')
      .notNull()
      .references(() => testCases.id, { onDelete: 'cascade' }),
    defaultAssigneeId: uuid('default_assignee_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.planId, table.testCaseId] }),
  }),
);

export const testRuns = pgTable(
  'test_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => testPlans.id, { onDelete: 'set null' }),
    parentRunId: uuid('parent_run_id').references((): AnyPgColumn => testRuns.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    environment: varchar('environment', { length: 64 }).notNull().default('Staging'),
    appVersion: varchar('app_version', { length: 64 }).notNull().default('1.0.0'),
    plannedDate: varchar('planned_date', { length: 32 }),
    jiraIssueKey: varchar('jira_issue_key', { length: 64 }),
    source: varchar('source', { length: 32 }).notNull().default('MANUAL'),
    status: varchar('status', { length: 32 }).notNull().default('IN_PROGRESS'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastJiraSyncedAt: timestamp('last_jira_synced_at', { withTimezone: true }),
  },
  (table) => ({
    projectIdx: index('test_runs_project_idx').on(table.projectId, table.startedAt),
  }),
);

export const testRunResults = pgTable(
  'test_run_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    testCaseId: uuid('test_case_id').references(() => testCases.id, {
      onDelete: 'set null',
    }),
    caseCode: varchar('case_code', { length: 32 }).notNull(),
    caseVersion: integer('case_version').notNull().default(1),
    caseSnapshot: jsonb('case_snapshot').$type<TestCaseSnapshotDto>().notNull(),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 32 }).notNull().default('NOT_EXECUTED'),
    actualResult: text('actual_result').notNull().default(''),
    comment: text('comment').notNull().default(''),
    stepResults: jsonb('step_results').$type<StepExecutionResultDto[]>().notNull().default([]),
    plannedDate: varchar('planned_date', { length: 32 }),
    executedBy: uuid('executed_by').references(() => users.id, { onDelete: 'set null' }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    jiraBugKeys: jsonb('jira_bug_keys').$type<string[]>().notNull().default([]),
    evidence: jsonb('evidence').$type<RunEvidenceDto[]>().notNull().default([]),
    position: integer('position').notNull().default(0),
  },
  (table) => ({
    runIdx: index('test_run_results_run_idx').on(table.runId, table.position),
    runStatusIdx: index('test_run_results_status_idx').on(table.runId, table.status),
  }),
);

export const testRunResultHistory = pgTable(
  'test_run_result_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    runResultId: uuid('run_result_id')
      .notNull()
      .references(() => testRunResults.id, { onDelete: 'cascade' }),
    caseCode: varchar('case_code', { length: 32 }).notNull(),
    caseTitle: varchar('case_title', { length: 500 }).notNull(),
    eventType: varchar('event_type', { length: 32 }).notNull().default('STATUS_CHANGED'),
    fromStatus: varchar('from_status', { length: 32 }),
    toStatus: varchar('to_status', { length: 32 }),
    summary: text('summary').notNull().default(''),
    actualResult: text('actual_result').notNull().default(''),
    comment: text('comment').notNull().default(''),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    resultCreatedIdx: index('test_run_result_history_res_idx').on(
      table.runResultId,
      table.createdAt,
    ),
    runCreatedIdx: index('test_run_result_history_run_idx').on(table.runId, table.createdAt),
  }),
);

export const defects = pgTable(
  'defects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => testRuns.id, { onDelete: 'set null' }),
    runResultId: uuid('run_result_id').references(() => testRunResults.id, {
      onDelete: 'set null',
    }),
    caseCode: varchar('case_code', { length: 32 }),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description').notNull().default(''),
    stepsToReproduce: text('steps_to_reproduce').notNull().default(''),
    actualResult: text('actual_result').notNull().default(''),
    expectedResult: text('expected_result').notNull().default(''),
    priority: varchar('priority', { length: 24 }).notNull().default('MEDIUM'),
    severity: varchar('severity', { length: 24 }).notNull().default('HIGH'),
    status: varchar('status', { length: 24 }).notNull().default('OPEN'),
    jiraIssueKey: varchar('jira_issue_key', { length: 64 }),
    jiraIssueUrl: varchar('jira_issue_url', { length: 500 }),
    evidence: jsonb('evidence').$type<RunEvidenceDto[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('defects_project_idx').on(table.projectId, table.createdAt),
    runIdx: index('defects_run_idx').on(table.runId),
  }),
);
