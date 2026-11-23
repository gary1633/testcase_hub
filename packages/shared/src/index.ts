export const USER_ROLES = ['ADMIN', 'QA_MANAGER', 'QA_LEAD', 'QA', 'PM', 'PO'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROJECT_ROLES = ['QA_LEAD', 'QA', 'PM', 'PO'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SEVERITIES = [
  'BLOCKER',
  'CRITICAL',
  'MAJOR',
  'NORMAL',
  'MINOR',
  'TRIVIAL',
] as const;
export type Severity = (typeof SEVERITIES)[number];

export const TEST_CASE_TYPES = [
  'FUNCTIONAL',
  'SMOKE',
  'REGRESSION',
  'SECURITY',
  'PERFORMANCE',
  'USABILITY',
  'INTEGRATION',
  'OTHER',
] as const;
export type TestCaseType = (typeof TEST_CASE_TYPES)[number];

export const AUTOMATION_STATUSES = [
  'MANUAL',
  'AUTOMATED',
  'TO_BE_AUTOMATED',
] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const TEST_CASE_STATUSES = ['ACTIVE', 'IN_REVIEW', 'DRAFT', 'DEPRECATED'] as const;
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

export interface UserTeamBadgeDto {
  id: string;
  name: string;
  color: string;
}

export interface TeamMemberItemDto {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  addedAt: string;
}

export interface TeamDto {
  id: string;
  name: string;
  description: string | null;
  color: string;
  memberCount: number;
  members: TeamMemberItemDto[];
  createdAt: string;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword?: boolean;
  teams?: UserTeamBadgeDto[];
  createdAt: string;
}

export type PasswordResetRequestStatus = 'PENDING' | 'COMPLETED' | 'DISMISSED';

export interface PasswordResetRequestDto {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  note: string;
  status: PasswordResetRequestStatus;
  resolvedByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ProjectSummaryDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  caseCounter: number;
  isArchived: boolean;
  isFavorite?: boolean;
  createdAt: string;
  myRole?: UserRole | ProjectRole;
  stats: {
    totalCases: number;
    automatedCases: number;
    suiteCount: number;
    memberCount: number;
  };
  jiraEnabled?: boolean;
  jiraBaseUrl?: string | null;
}

export interface ProjectMemberDto {
  userId: string;
  email: string;
  fullName: string;
  globalRole: UserRole;
  projectRole: ProjectRole;
  teams?: UserTeamBadgeDto[];
  addedAt: string;
}

export interface JiraIntegrationConfigDto {
  baseUrl: string;
  email: string;
  apiTokenMasked?: string;
  hasApiToken?: boolean;
  projectKey: string;
  defaultIssueType: string;
  isEnabled: boolean;
}

export interface SuiteDto {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  position: number;
  directCaseCount: number;
  totalCaseCount: number;
  children?: SuiteDto[];
}

export interface TestStepDto {
  id?: string;
  stepOrder: number;
  action: string;
  data: string;
  expectedResult: string;
  sharedStepId?: string | null;
  sharedStepTitle?: string | null;
}

export interface SharedStepItemDto {
  action: string;
  data: string;
  expectedResult: string;
}

export interface SharedStepDto {
  id: string;
  projectId: string;
  seqNumber: number;
  code: string;
  title: string;
  steps: SharedStepItemDto[];
  usedInCaseCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseCommentDto {
  id: string;
  testCaseId: string;
  content: string;
  authorId: string | null;
  authorName: string;
  authorRole: UserRole | null;
  createdAt: string;
}

export interface TrashItemDto {
  kind: 'CASE' | 'SUITE';
  id: string;
  code?: string;
  title: string;
  suiteTitle?: string | null;
  stepCount?: number;
  deletedByName: string | null;
  deletedAt: string;
}

export interface AttachmentDto {
  id: string;
  testCaseId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface TestCaseListItemDto {
  id: string;
  projectId: string;
  suiteId: string | null;
  suiteTitle?: string | null;
  seqNumber: number;
  code: string;
  currentVersion: number;
  title: string;
  priority: Priority;
  severity: Severity;
  type: TestCaseType;
  automationStatus: AutomationStatus;
  status: TestCaseStatus;
  tags: string[];
  jiraIssueKeys: string[];
  position: number;
  stepCount: number;
  attachmentCount: number;
  updatedAt: string;
}

export const VERSION_ACTIONS = [
  'CREATED',
  'UPDATED',
  'RESTORED',
  'DELETED',
  'BULK_UPDATED',
  'IMPORTED',
  'CLONED',
] as const;
export type VersionAction = (typeof VERSION_ACTIONS)[number];

export type VersionState = 'ACTIVE' | 'OUTDATED' | 'DELETED';

export interface FieldDiffDto {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

export interface TestCaseSnapshotDto {
  title: string;
  suiteId: string | null;
  suiteTitle: string | null;
  description: string;
  preconditions: string;
  priority: Priority;
  severity: Severity;
  type: TestCaseType;
  automationStatus: AutomationStatus;
  status: TestCaseStatus;
  tags: string[];
  jiraIssueKeys: string[];
  steps: Array<{ stepOrder: number; action: string; data: string; expectedResult: string }>;
}

export interface TestCaseVersionDto {
  id: string;
  projectId: string;
  testCaseId: string | null;
  caseCode: string;
  versionNumber: number;
  action: VersionAction;
  versionState: VersionState;
  summary: string;
  changes: FieldDiffDto[];
  snapshot: TestCaseSnapshotDto;
  changedBy: string | null;
  changedByName: string | null;
  createdAt: string;
}

export interface TestCaseDetailDto extends TestCaseListItemDto {
  description: string;
  preconditions: string;
  steps: TestStepDto[];
  attachments: AttachmentDto[];
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type BulkActionType =
  | 'MOVE'
  | 'DELETE'
  | 'UPDATE_PRIORITY'
  | 'UPDATE_AUTOMATION'
  | 'UPDATE_STATUS'
  | 'CLONE';

export interface ProjectStatsDto {
  totalCases: number;
  totalSuites: number;
  linkedJiraCases: number;
  byPriority: Record<Priority, number>;
  byAutomation: Record<AutomationStatus, number>;
  byType: Record<TestCaseType, number>;
  byStatus: Record<TestCaseStatus, number>;
  topSuites: Array<{ suiteId: string | null; title: string; count: number }>;
  recentRuns?: TestRunSummaryDto[];
  openDefectsCount?: number;
}

export const TEST_RUN_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'ABORTED'] as const;
export type TestRunStatus = (typeof TEST_RUN_STATUSES)[number];

export const EXECUTION_STATUSES = [
  'NOT_EXECUTED',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'NOT_TEST',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const DEFECT_SEVERITIES = ['HIGHEST', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const DEFECT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export interface TestPlanSummaryDto {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  caseCount: number;
  runCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestPlanDetailDto extends TestPlanSummaryDto {
  caseIds: string[];
}

export interface TestRunStatsDto {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notTest: number;
  notExecuted: number;
  passRate: number;
}

export type TestRunSource = 'MANUAL' | 'CI_CD';

export const WEBHOOK_PROVIDERS = ['SLACK', 'TEAMS', 'GOOGLE_CHAT', 'CUSTOM'] as const;
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];

export interface WebhookConfigDto {
  isEnabled: boolean;
  provider: WebhookProvider;
  webhookUrl: string;
  hasWebhookUrl: boolean;
  notifyOnRunCompleted: boolean;
  notifyOnHighDefect: boolean;
}

export interface CiTokenDto {
  id: string;
  name: string;
  tokenPrefix: string;
  createdByName: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedCiTokenDto extends CiTokenDto {
  token: string;
}

export interface CiIngestResultDto {
  runId: string;
  runTitle: string;
  format: 'playwright' | 'junit';
  totalTests: number;
  matchedCases: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface TestRunSummaryDto {
  id: string;
  projectId: string;
  planId: string | null;
  planTitle?: string | null;
  parentRunId?: string | null;
  source?: TestRunSource;
  title: string;
  description: string | null;
  environment: string;
  appVersion: string;
  plannedDate: string | null;
  jiraIssueKey: string | null;
  status: TestRunStatus;
  stats: TestRunStatsDto;
  defectCount: number;
  createdByName: string | null;
  startedAt: string;
  completedAt: string | null;
  lastJiraSyncedAt: string | null;
}

export interface RunEvidenceDto {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  url: string;
  uploadedAt: string;
}

export interface StepExecutionResultDto {
  stepOrder: number;
  status: 'UNSET' | 'PASSED' | 'FAILED' | 'BLOCKED';
  actualResult?: string;
}

export interface TestRunResultDto {
  id: string;
  runId: string;
  testCaseId: string | null;
  caseCode: string;
  caseVersion: number;
  caseSnapshot: TestCaseSnapshotDto;
  assigneeId: string | null;
  assigneeName: string | null;
  status: ExecutionStatus;
  actualResult: string;
  comment: string;
  stepResults: StepExecutionResultDto[];
  plannedDate: string | null;
  executedBy: string | null;
  executedByName: string | null;
  executedAt: string | null;
  jiraBugKeys: string[];
  evidence: RunEvidenceDto[];
  position: number;
}

export interface TestRunDetailDto extends TestRunSummaryDto {
  results: TestRunResultDto[];
  jiraBaseUrl?: string | null;
  jiraEnabled?: boolean;
}

export type RunHistoryEventType =
  | 'STATUS_CHANGED'
  | 'DETAILS_UPDATED'
  | 'EVIDENCE_ADDED'
  | 'BUG_LINKED';

export interface TestRunResultHistoryDto {
  id: string;
  runId: string;
  runResultId: string;
  caseCode: string;
  caseTitle: string;
  eventType: RunHistoryEventType;
  fromStatus: ExecutionStatus | null;
  toStatus: ExecutionStatus | null;
  summary: string;
  actualResult: string;
  comment: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface DefectDto {
  id: string;
  projectId: string;
  runId: string | null;
  runTitle?: string | null;
  runResultId: string | null;
  caseCode: string | null;
  title: string;
  description: string;
  stepsToReproduce: string;
  actualResult: string;
  expectedResult: string;
  priority: Priority;
  severity: DefectSeverity;
  status: DefectStatus;
  jiraIssueKey: string | null;
  jiraIssueUrl: string | null;
  evidence: RunEvidenceDto[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export function canEditCases(role?: string | null): boolean {
  return (
    role === 'ADMIN' ||
    role === 'QA_MANAGER' ||
    role === 'QA_LEAD' ||
    role === 'QA'
  );
}

export function canManageProject(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'QA_MANAGER' || role === 'QA_LEAD';
}

export function canViewAllProjects(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'QA_MANAGER';
}

export function canManageAllUsers(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'QA_MANAGER';
}

export function canCreateUsers(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'QA_MANAGER' || role === 'QA_LEAD';
}

export function creatableRolesFor(actorRole?: string | null): UserRole[] {
  if (actorRole === 'ADMIN') {
    return ['ADMIN', 'QA_MANAGER', 'QA_LEAD', 'QA', 'PM', 'PO'];
  }
  if (actorRole === 'QA_MANAGER') {
    return ['QA_MANAGER', 'QA_LEAD', 'QA', 'PM', 'PO'];
  }
  if (actorRole === 'QA_LEAD') {
    return ['QA_LEAD', 'QA', 'PM', 'PO'];
  }
  return [];
}

export function canResetPasswordFor(
  actorRole?: string | null,
  targetRole?: string | null,
): boolean {
  if (!actorRole || !targetRole) return false;
  if (actorRole === 'ADMIN') return true;
  if (actorRole === 'QA_MANAGER') return targetRole !== 'ADMIN';
  if (actorRole === 'QA_LEAD') return targetRole === 'QA';
  return false;
}

export interface GlobalSearchResultDto {
  projects: Array<{
    id: string;
    code: string;
    name: string;
    isArchived: boolean;
  }>;
  cases: Array<{
    id: string;
    projectId: string;
    projectCode: string;
    code: string;
    title: string;
    priority: Priority;
    status: TestCaseStatus;
  }>;
  runs: Array<{
    id: string;
    projectId: string;
    projectCode: string;
    title: string;
    environment: string;
    status: TestRunStatus;
  }>;
  defects: Array<{
    id: string;
    projectId: string;
    projectCode: string;
    caseCode: string | null;
    title: string;
    status: DefectStatus;
    severity: DefectSeverity;
    jiraIssueKey: string | null;
  }>;
}

export interface MyWorkAssignedRunItemDto {
  resultId: string;
  runId: string;
  runTitle: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  caseCode: string;
  caseTitle: string;
  status: ExecutionStatus;
  plannedDate: string | null;
  environment: string;
}

export interface MyWorkCaseItemDto {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  code: string;
  title: string;
  priority: Priority;
  status: TestCaseStatus;
  updatedAt: string;
}

export interface MyWorkDefectItemDto {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  caseCode: string | null;
  title: string;
  severity: DefectSeverity;
  status: DefectStatus;
  jiraIssueKey: string | null;
  createdAt: string;
}

export interface MyWorkDto {
  assignedRunItems: MyWorkAssignedRunItemDto[];
  pendingReviewCases: MyWorkCaseItemDto[];
  myDraftCases: MyWorkCaseItemDto[];
  openDefects: MyWorkDefectItemDto[];
}

export type RtmReadinessStatus = 'READY' | 'AT_RISK' | 'IN_PROGRESS' | 'NOT_RUN';

export interface RtmCaseEntryDto {
  id: string;
  code: string;
  title: string;
  priority: Priority;
  automationStatus: AutomationStatus;
  latestRunId: string | null;
  latestRunTitle: string | null;
  latestStatus: ExecutionStatus;
  openDefectCount: number;
}

export interface RtmRequirementDto {
  jiraKey: string;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  untested: number;
  openDefects: number;
  passRate: number;
  readiness: RtmReadinessStatus;
  cases: RtmCaseEntryDto[];
}

export interface ProjectRtmDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  jiraBaseUrl: string | null;
  totalRequirements: number;
  readyCount: number;
  atRiskCount: number;
  inProgressCount: number;
  notRunCount: number;
  casesWithoutRequirement: number;
  items: RtmRequirementDto[];
}
