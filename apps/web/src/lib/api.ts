import type {
  AttachmentDto,
  BulkActionType,
  CiTokenDto,
  CreatedCiTokenDto,
  DefectDto,
  DefectSeverity,
  DefectStatus,
  ExecutionStatus,
  GlobalSearchResultDto,
  JiraIntegrationConfigDto,
  MyWorkDto,
  PaginatedResponse,
  PasswordResetRequestDto,
  Priority,
  ProjectMemberDto,
  ProjectRole,
  ProjectRtmDto,
  ProjectStatsDto,
  ProjectSummaryDto,
  RunEvidenceDto,
  SharedStepDto,
  SharedStepItemDto,
  StepExecutionResultDto,
  SuiteDto,
  TestCaseCommentDto,
  TestCaseDetailDto,
  TestCaseListItemDto,
  TestCaseVersionDto,
  TestPlanDetailDto,
  TestPlanSummaryDto,
  TestRunDetailDto,
  TestRunResultDto,
  TestRunResultHistoryDto,
  TestRunStatus,
  TestRunSummaryDto,
  TeamDto,
  TrashItemDto,
  UserDto,
  UserRole,
  WebhookConfigDto,
  WebhookProvider,
} from '@tcms/shared';

const TOKEN_KEY = 'tcms_access_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null, persist = true): void {
  if (token) {
    if (persist) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  } else {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    setStoredToken(null);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.message === 'string') {
        message = data.message;
      } else if (Array.isArray(data?.message)) {
        message = data.message.join(', ');
      }
    } catch {
      // ignore json parse error
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface SuiteTreeResponse {
  tree: SuiteDto[];
  flat: SuiteDto[];
  totalProjectCases: number;
  uncategorizedCases: number;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: UserDto }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  loginWithGoogle: (credential: string) =>
    request<{ accessToken: string; user: UserDto }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),
  me: () => request<UserDto>('/auth/me'),
  updateMe: (payload: { fullName?: string; email?: string }) =>
    request<UserDto>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<UserDto>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  forgotPassword: (payload: { email: string; note?: string }) =>
    request<{ ok: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Users
  listUsers: () => request<UserDto[]>('/users'),
  createUser: (payload: {
    email: string;
    fullName: string;
    password: string;
    role: UserRole;
    mustChangePassword?: boolean;
    teamIds?: string[];
  }) =>
    request<UserDto>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateUser: (
    id: string,
    payload: {
      fullName?: string;
      role?: UserRole;
      isActive?: boolean;
      password?: string;
      mustChangePassword?: boolean;
    },
  ) =>
    request<UserDto>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  resetUserPassword: (
    id: string,
    payload: { newPassword: string; mustChangePassword?: boolean },
  ) =>
    request<{ ok: boolean; user: UserDto }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listPasswordResetRequests: () =>
    request<PasswordResetRequestDto[]>('/users/password-reset-requests'),
  dismissPasswordResetRequest: (requestId: string) =>
    request<{ ok: boolean }>(`/users/password-reset-requests/${requestId}/dismiss`, {
      method: 'PATCH',
    }),

  // Teams / Workstreams
  listTeams: () => request<TeamDto[]>('/teams'),
  createTeam: (payload: {
    name: string;
    description?: string | null;
    color?: string;
    memberIds?: string[];
  }) =>
    request<TeamDto>('/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateTeam: (
    id: string,
    payload: {
      name?: string;
      description?: string | null;
      color?: string;
      memberIds?: string[];
    },
  ) =>
    request<TeamDto>(`/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  addTeamMembers: (id: string, userIds: string[]) =>
    request<TeamDto>(`/teams/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    }),
  removeTeamMember: (id: string, userId: string) =>
    request<TeamDto>(`/teams/${id}/members/${userId}`, {
      method: 'DELETE',
    }),
  deleteTeam: (id: string) =>
    request<{ deleted: boolean }>(`/teams/${id}`, {
      method: 'DELETE',
    }),

  // Projects
  listProjects: (includeArchived = false) =>
    request<ProjectSummaryDto[]>(
      includeArchived ? '/projects?includeArchived=true' : '/projects',
    ),
  getProject: (id: string) => request<ProjectSummaryDto>(`/projects/${id}`),
  createProject: (payload: { code: string; name: string; description?: string }) =>
    request<ProjectSummaryDto>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProject: (
    id: string,
    payload: { name?: string; description?: string | null; isArchived?: boolean },
  ) =>
    request<ProjectSummaryDto>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/projects/${id}`, {
      method: 'DELETE',
    }),
  toggleFavoriteProject: (id: string, isFavorite?: boolean) =>
    request<{ projectId: string; isFavorite: boolean }>(`/projects/${id}/favorite`, {
      method: 'POST',
      body: JSON.stringify(isFavorite === undefined ? {} : { isFavorite }),
    }),
  getProjectStats: (id: string) => request<ProjectStatsDto>(`/projects/${id}/stats`),
  getProjectRtm: (id: string) => request<ProjectRtmDto>(`/projects/${id}/stats/rtm`),
  globalSearch: (q: string) =>
    request<GlobalSearchResultDto>(`/search?q=${encodeURIComponent(q)}`),
  getMyWork: () => request<MyWorkDto>('/my-work'),

  // Project Members
  listMembers: (projectId: string) =>
    request<ProjectMemberDto[]>(`/projects/${projectId}/members`),
  upsertMember: (projectId: string, payload: { userId: string; role?: ProjectRole }) =>
    request<ProjectMemberDto[]>(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  addMembersBulk: (projectId: string, userIds: string[]) =>
    request<{ added: number; members: ProjectMemberDto[] }>(
      `/projects/${projectId}/members/bulk`,
      {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      },
    ),
  addTeamToProject: (projectId: string, teamId: string) =>
    request<{ added: number; teamName: string; members: ProjectMemberDto[] }>(
      `/projects/${projectId}/members/team`,
      {
        method: 'POST',
        body: JSON.stringify({ teamId }),
      },
    ),
  removeMember: (projectId: string, userId: string) =>
    request<ProjectMemberDto[]>(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    }),

  // Jira Integration
  getJiraConfig: (projectId: string) =>
    request<JiraIntegrationConfigDto>(`/projects/${projectId}/integrations/jira`),
  saveJiraConfig: (
    projectId: string,
    payload: {
      baseUrl: string;
      email: string;
      apiToken?: string;
      projectKey: string;
      defaultIssueType: string;
      isEnabled: boolean;
    },
  ) =>
    request<JiraIntegrationConfigDto>(`/projects/${projectId}/integrations/jira`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  testJiraConnection: (projectId: string) =>
    request<{ ok: boolean; message: string; accountName?: string }>(
      `/projects/${projectId}/integrations/jira/test`,
      { method: 'POST' },
    ),

  // Suites
  listSuites: (projectId: string) =>
    request<SuiteTreeResponse>(`/projects/${projectId}/suites`),
  createSuite: (
    projectId: string,
    payload: { title: string; description?: string | null; parentId?: string | null },
  ) =>
    request<SuiteDto>(`/projects/${projectId}/suites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSuite: (
    projectId: string,
    suiteId: string,
    payload: {
      title?: string;
      description?: string | null;
      parentId?: string | null;
      position?: number;
      orderedSiblingIds?: string[];
    },
  ) =>
    request<SuiteDto>(`/projects/${projectId}/suites/${suiteId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  reorderSuites: (projectId: string, orderedIds: string[]) =>
    request<{ updated: number }>(`/projects/${projectId}/suites/reorder`, {
      method: 'POST',
      body: JSON.stringify({ orderedIds }),
    }),
  deleteSuite: (projectId: string, suiteId: string, deleteCases = false) =>
    request<{ deleted: boolean }>(
      `/projects/${projectId}/suites/${suiteId}?deleteCases=${deleteCases}`,
      { method: 'DELETE' },
    ),
  restoreSuite: (projectId: string, suiteId: string) =>
    request<{ restored: boolean }>(`/projects/${projectId}/suites/${suiteId}/restore`, {
      method: 'POST',
    }),
  permanentDeleteSuite: (projectId: string, suiteId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/suites/${suiteId}/permanent`, {
      method: 'DELETE',
    }),
  copySuiteToProject: (
    projectId: string,
    suiteId: string,
    payload: {
      targetProjectId: string;
      targetParentSuiteId?: string | null;
      includeSubSuites?: boolean;
      includeCases?: boolean;
    },
  ) =>
    request<{
      copiedSuitesCount: number;
      copiedCasesCount: number;
      targetProjectId: string;
      targetProjectName: string;
      targetProjectCode: string;
      rootSuiteId: string;
    }>(`/projects/${projectId}/suites/${suiteId}/copy-to-project`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Test Cases
  listCases: (projectId: string, params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== null) {
        qs.set(k, String(v));
      }
    }
    return request<PaginatedResponse<TestCaseListItemDto>>(
      `/projects/${projectId}/cases?${qs.toString()}`,
    );
  },
  getCase: (projectId: string, caseId: string) =>
    request<TestCaseDetailDto>(`/projects/${projectId}/cases/${caseId}`),
  createCase: (projectId: string, payload: Record<string, unknown>) =>
    request<TestCaseDetailDto>(`/projects/${projectId}/cases`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCase: (projectId: string, caseId: string, payload: Record<string, unknown>) =>
    request<TestCaseDetailDto>(`/projects/${projectId}/cases/${caseId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteCase: (projectId: string, caseId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/cases/${caseId}`, {
      method: 'DELETE',
    }),
  copyCasesToProject: (
    projectId: string,
    payload: {
      caseIds: string[];
      targetProjectId: string;
      targetSuiteId?: string | null;
    },
  ) =>
    request<{
      copiedCount: number;
      targetProjectId: string;
      targetProjectName: string;
      targetProjectCode: string;
      createdCases: Array<{ id: string; code: string; title: string }>;
    }>(`/projects/${projectId}/cases/copy-to-project`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listTrash: (projectId: string) =>
    request<TrashItemDto[]>(`/projects/${projectId}/cases/trash`),
  restoreCaseFromTrash: (projectId: string, caseId: string) =>
    request<TestCaseDetailDto>(`/projects/${projectId}/cases/${caseId}/restore-trash`, {
      method: 'POST',
    }),
  permanentDeleteCase: (projectId: string, caseId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/cases/${caseId}/permanent`, {
      method: 'DELETE',
    }),
  listCaseComments: (projectId: string, caseId: string) =>
    request<TestCaseCommentDto[]>(`/projects/${projectId}/cases/${caseId}/comments`),
  addCaseComment: (projectId: string, caseId: string, content: string) =>
    request<TestCaseCommentDto>(`/projects/${projectId}/cases/${caseId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  deleteCaseComment: (projectId: string, caseId: string, commentId: string) =>
    request<{ deleted: boolean }>(
      `/projects/${projectId}/cases/${caseId}/comments/${commentId}`,
      { method: 'DELETE' },
    ),

  // Shared Steps
  listSharedSteps: (projectId: string) =>
    request<SharedStepDto[]>(`/projects/${projectId}/shared-steps`),
  createSharedStep: (
    projectId: string,
    payload: { title: string; steps: SharedStepItemDto[] },
  ) =>
    request<SharedStepDto>(`/projects/${projectId}/shared-steps`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSharedStep: (
    projectId: string,
    sharedStepId: string,
    payload: { title?: string; steps?: SharedStepItemDto[] },
  ) =>
    request<SharedStepDto>(`/projects/${projectId}/shared-steps/${sharedStepId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSharedStep: (projectId: string, sharedStepId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/shared-steps/${sharedStepId}`, {
      method: 'DELETE',
    }),
  listCaseVersions: (projectId: string, caseId: string) =>
    request<TestCaseVersionDto[]>(`/projects/${projectId}/cases/${caseId}/versions`),
  listVersionsByCaseCode: (projectId: string, caseCode: string) =>
    request<TestCaseVersionDto[]>(
      `/projects/${projectId}/history/by-code/${encodeURIComponent(caseCode)}`,
    ),
  restoreCaseVersion: (projectId: string, caseId: string, versionId: string) =>
    request<TestCaseDetailDto>(
      `/projects/${projectId}/cases/${caseId}/versions/${versionId}/restore`,
      { method: 'POST' },
    ),
  listProjectHistory: (
    projectId: string,
    params: Record<string, string | number | undefined>,
  ) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    return request<PaginatedResponse<TestCaseVersionDto>>(
      `/projects/${projectId}/history?${qs.toString()}`,
    );
  },
  bulkCases: (
    projectId: string,
    payload: {
      action: BulkActionType;
      caseIds: string[];
      suiteId?: string | null;
      priority?: string;
      automationStatus?: string;
      status?: string;
    },
  ) =>
    request<{ affected: number }>(`/projects/${projectId}/cases/bulk`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  uploadAttachment: (projectId: string, caseId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<AttachmentDto>(`/projects/${projectId}/cases/${caseId}/attachments`, {
      method: 'POST',
      body: formData,
    });
  },
  deleteAttachment: (attachmentId: string) =>
    request<{ deleted: boolean }>(`/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),
  importFile: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ imported: number; createdSuites: number; skipped: number }>(
      `/projects/${projectId}/cases/import`,
      {
        method: 'POST',
        body: formData,
      },
    );
  },
  getTemplateUrl: (projectId: string) => {
    const qs = new URLSearchParams();
    const token = getStoredToken();
    if (token) qs.set('token', token);
    return `/api/projects/${projectId}/cases/template?${qs.toString()}`;
  },
  getExportUrl: (
    projectId: string,
    params: Record<string, string | undefined>,
    format: 'xlsx' | 'csv' = 'xlsx',
  ) => {
    const qs = new URLSearchParams();
    const token = getStoredToken();
    if (token) qs.set('token', token);
    qs.set('format', format);
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v);
    }
    return `/api/projects/${projectId}/cases/export?${qs.toString()}`;
  },
  getAttachmentUrl: (attachmentUrl: string) => {
    const token = getStoredToken();
    if (!token) return attachmentUrl;
    const sep = attachmentUrl.includes('?') ? '&' : '?';
    return `${attachmentUrl}${sep}token=${encodeURIComponent(token)}`;
  },

  // Test Plans (Phase 2)
  listPlans: (projectId: string) =>
    request<TestPlanSummaryDto[]>(`/projects/${projectId}/plans`),
  getPlan: (projectId: string, planId: string) =>
    request<TestPlanDetailDto>(`/projects/${projectId}/plans/${planId}`),
  createPlan: (
    projectId: string,
    payload: { title: string; description?: string; caseIds: string[] },
  ) =>
    request<TestPlanDetailDto>(`/projects/${projectId}/plans`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePlan: (
    projectId: string,
    planId: string,
    payload: { title?: string; description?: string | null; caseIds?: string[] },
  ) =>
    request<TestPlanDetailDto>(`/projects/${projectId}/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deletePlan: (projectId: string, planId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/plans/${planId}`, {
      method: 'DELETE',
    }),

  // Test Runs & Execution (Phase 2)
  listRuns: (projectId: string) =>
    request<TestRunSummaryDto[]>(`/projects/${projectId}/runs`),
  getRun: (projectId: string, runId: string) =>
    request<TestRunDetailDto>(`/projects/${projectId}/runs/${runId}`),
  createRun: (
    projectId: string,
    payload: {
      title: string;
      description?: string;
      environment?: string;
      appVersion?: string;
      plannedDate?: string;
      jiraIssueKey?: string;
      planId?: string | null;
      caseIds?: string[];
      defaultAssigneeId?: string | null;
    },
  ) =>
    request<TestRunDetailDto>(`/projects/${projectId}/runs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRun: (
    projectId: string,
    runId: string,
    payload: {
      title?: string;
      description?: string | null;
      environment?: string;
      appVersion?: string;
      plannedDate?: string | null;
      jiraIssueKey?: string | null;
      status?: TestRunStatus;
    },
  ) =>
    request<TestRunDetailDto>(`/projects/${projectId}/runs/${runId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteRun: (projectId: string, runId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/runs/${runId}`, {
      method: 'DELETE',
    }),
  updateRunResult: (
    projectId: string,
    runId: string,
    resultId: string,
    payload: {
      status?: ExecutionStatus;
      actualResult?: string;
      comment?: string;
      stepResults?: StepExecutionResultDto[];
      assigneeId?: string | null;
      plannedDate?: string | null;
      jiraBugKeys?: string[];
    },
  ) =>
    request<TestRunResultDto>(`/projects/${projectId}/runs/${runId}/results/${resultId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  listResultHistory: (projectId: string, runId: string, resultId: string) =>
    request<TestRunResultHistoryDto[]>(
      `/projects/${projectId}/runs/${runId}/results/${resultId}/history`,
    ),
  listRunHistory: (projectId: string, runId: string) =>
    request<TestRunResultHistoryDto[]>(`/projects/${projectId}/runs/${runId}/history`),
  uploadRunEvidence: (projectId: string, runId: string, resultId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<RunEvidenceDto>(
      `/projects/${projectId}/runs/${runId}/results/${resultId}/evidence`,
      { method: 'POST', body: formData },
    );
  },
  deleteRunEvidence: (projectId: string, runId: string, resultId: string, evidenceId: string) =>
    request<{ deleted: boolean }>(
      `/projects/${projectId}/runs/${runId}/results/${resultId}/evidence/${evidenceId}`,
      { method: 'DELETE' },
    ),
  createResultDefect: (
    projectId: string,
    runId: string,
    resultId: string,
    payload: {
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
  ) =>
    request<{ defect: DefectDto; jiraResult?: { ok: boolean; message: string } }>(
      `/projects/${projectId}/runs/${runId}/results/${resultId}/defect`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  syncRunToJira: (projectId: string, runId: string, jiraIssueKey?: string) =>
    request<{ ok: boolean; issueKey?: string; issueUrl?: string; message: string }>(
      `/projects/${projectId}/runs/${runId}/sync-jira`,
      { method: 'POST', body: JSON.stringify({ jiraIssueKey }) },
    ),
  bulkAssignRunResults: (
    projectId: string,
    runId: string,
    payload: { resultIds: string[]; assigneeId: string | null },
  ) =>
    request<{ updated: number }>(`/projects/${projectId}/runs/${runId}/bulk-assign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  rerunFromRun: (
    projectId: string,
    runId: string,
    payload: {
      statuses?: ExecutionStatus[];
      title?: string;
      environment?: string;
      appVersion?: string;
      jiraIssueKey?: string | null;
    },
  ) =>
    request<TestRunDetailDto>(`/projects/${projectId}/runs/${runId}/rerun`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getRunExportUrl: (projectId: string, runId: string) => {
    const qs = new URLSearchParams();
    const token = getStoredToken();
    if (token) qs.set('token', token);
    return `/api/projects/${projectId}/runs/${runId}/export?${qs.toString()}`;
  },

  // Defects (Phase 2)
  listDefects: (
    projectId: string,
    params?: {
      status?: DefectStatus;
      severity?: DefectSeverity;
      priority?: Priority;
      runId?: string;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.priority) qs.set('priority', params.priority);
    if (params?.runId) qs.set('runId', params.runId);
    const q = qs.toString();
    return request<DefectDto[]>(`/projects/${projectId}/defects${q ? `?${q}` : ''}`);
  },
  createDefect: (
    projectId: string,
    payload: {
      title: string;
      description?: string;
      stepsToReproduce?: string;
      actualResult?: string;
      expectedResult?: string;
      priority?: Priority;
      severity?: DefectSeverity;
      caseCode?: string | null;
      jiraIssueKey?: string | null;
      pushToJira?: boolean;
    },
  ) =>
    request<{ defect: DefectDto; jiraResult?: { ok: boolean; message: string } }>(
      `/projects/${projectId}/defects`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  updateDefect: (
    projectId: string,
    defectId: string,
    payload: {
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
  ) =>
    request<DefectDto>(`/projects/${projectId}/defects/${defectId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  uploadDefectEvidence: (projectId: string, defectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<RunEvidenceDto>(`/projects/${projectId}/defects/${defectId}/evidence`, {
      method: 'POST',
      body: formData,
    });
  },
  deleteDefectEvidence: (projectId: string, defectId: string, evidenceId: string) =>
    request<{ deleted: boolean }>(
      `/projects/${projectId}/defects/${defectId}/evidence/${evidenceId}`,
      { method: 'DELETE' },
    ),
  deleteDefect: (projectId: string, defectId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/defects/${defectId}`, {
      method: 'DELETE',
    }),

  // Public auth config (detects clean superadmin deploy vs demo mode, optional Google SSO & SMTP)
  getPublicConfig: () =>
    request<{
      demoMode: boolean;
      googleAuthEnabled: boolean;
      googleClientId: string | null;
      smtpEnabled: boolean;
    }>('/auth/public-config'),

  // Webhook Notifications (Slack / MS Teams / Google Chat)
  getWebhookConfig: (projectId: string) =>
    request<WebhookConfigDto>(`/projects/${projectId}/integrations/webhook`),
  saveWebhookConfig: (
    projectId: string,
    payload: {
      provider: WebhookProvider;
      webhookUrl?: string;
      isEnabled: boolean;
      notifyOnRunCompleted: boolean;
      notifyOnHighDefect: boolean;
    },
  ) =>
    request<WebhookConfigDto>(`/projects/${projectId}/integrations/webhook`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  testWebhookConnection: (projectId: string) =>
    request<{ ok: boolean; message: string }>(
      `/projects/${projectId}/integrations/webhook/test`,
      { method: 'POST' },
    ),

  // CI/CD API Tokens
  listCiTokens: (projectId: string) => request<CiTokenDto[]>(`/projects/${projectId}/ci-tokens`),
  createCiToken: (projectId: string, name: string) =>
    request<CreatedCiTokenDto>(`/projects/${projectId}/ci-tokens`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revokeCiToken: (projectId: string, tokenId: string) =>
    request<{ revoked: boolean }>(`/projects/${projectId}/ci-tokens/${tokenId}`, {
      method: 'DELETE',
    }),
};
