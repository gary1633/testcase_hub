import type {
  AutomationStatus,
  DefectSeverity,
  DefectStatus,
  ExecutionStatus,
  Priority,
  ProjectRole,
  Severity,
  TestCaseStatus,
  TestCaseType,
  TestRunStatus,
  UserRole,
  VersionAction,
  VersionState,
} from '@tcms/shared';

export const PRIORITY_STYLE: Record<Priority, { label: string; className: string; dot: string }> = {
  CRITICAL: {
    label: 'Critical',
    className: 'bg-rose-50 text-rose-700 border-rose-200/90',
    dot: 'bg-rose-500',
  },
  HIGH: {
    label: 'High',
    className: 'bg-amber-50 text-amber-800 border-amber-200/90',
    dot: 'bg-amber-500',
  },
  MEDIUM: {
    label: 'Medium',
    className: 'bg-sky-50 text-sky-700 border-sky-200/90',
    dot: 'bg-sky-500',
  },
  LOW: {
    label: 'Low',
    className: 'bg-slate-100 text-slate-600 border-slate-200/90',
    dot: 'bg-slate-400',
  },
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  BLOCKER: 'Blocker',
  CRITICAL: 'Critical',
  MAJOR: 'Major',
  NORMAL: 'Normal',
  MINOR: 'Minor',
  TRIVIAL: 'Trivial',
};

export const AUTOMATION_STYLE: Record<
  AutomationStatus,
  { label: string; className: string }
> = {
  AUTOMATED: {
    label: 'Automated',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
  },
  TO_BE_AUTOMATED: {
    label: 'To Automate',
    className: 'bg-brand-50 text-brand-700 border-brand-200',
  },
  MANUAL: {
    label: 'Manual',
    className: 'bg-slate-100/90 text-slate-600 border-slate-200',
  },
};

export const TYPE_LABEL: Record<TestCaseType, string> = {
  FUNCTIONAL: 'Functional',
  SMOKE: 'Smoke',
  REGRESSION: 'Regression',
  SECURITY: 'Security',
  PERFORMANCE: 'Performance',
  USABILITY: 'Usability',
  INTEGRATION: 'Integration',
  OTHER: 'Other',
};

export const STATUS_STYLE: Record<TestCaseStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
  },
  IN_REVIEW: {
    label: 'In Review',
    className: 'bg-sky-50 text-sky-700 border-sky-200/90',
  },
  DRAFT: {
    label: 'Draft',
    className: 'bg-amber-50 text-amber-800 border-amber-200/90',
  },
  DEPRECATED: {
    label: 'Deprecated',
    className: 'bg-slate-100 text-slate-500 border-slate-200',
  },
};

export const ROLE_STYLE: Record<UserRole | ProjectRole, { label: string; className: string }> = {
  ADMIN: { label: 'Admin', className: 'bg-brand-50 text-brand-700 border-brand-200' },
  QA_MANAGER: { label: 'QA Manager', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  QA_LEAD: { label: 'QA Lead', className: 'bg-purple-50 text-purple-800 border-purple-200' },
  QA: { label: 'QA Engineer', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  PM: { label: 'PM (View Only)', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  PO: { label: 'PO (View Only)', className: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export const TEAM_COLOR_STYLE: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  brand: {
    label: 'Tím Plum',
    className: 'bg-brand-50 text-brand-700 border-brand-200',
    dot: 'bg-brand-500',
  },
  ocean: {
    label: 'Xanh Ocean',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
  },
  emerald: {
    label: 'Xanh Ngọc',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  indigo: {
    label: 'Chàm Indigo',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
  },
  rose: {
    label: 'Hồng Rose',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  amber: {
    label: 'Cam Amber',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
  },
};

export function getTeamColorStyle(color?: string | null) {
  return TEAM_COLOR_STYLE[color || 'brand'] ?? TEAM_COLOR_STYLE.brand;
}

export const VERSION_STATE_STYLE: Record<VersionState, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
  },
  OUTDATED: {
    label: 'Outdated',
    className: 'bg-amber-50 text-amber-800 border-amber-200/90',
  },
  DELETED: {
    label: 'Deleted',
    className: 'bg-rose-50 text-rose-700 border-rose-200/90',
  },
};

export const VERSION_ACTION_STYLE: Record<VersionAction, { label: string; className: string }> = {
  CREATED: { label: 'Tạo mới', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  UPDATED: { label: 'Cập nhật', className: 'bg-brand-50 text-brand-700 border-brand-200' },
  RESTORED: { label: 'Khôi phục', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  BULK_UPDATED: {
    label: 'Sửa hàng loạt',
    className: 'bg-brand-50 text-brand-700 border-brand-200',
  },
  IMPORTED: { label: 'Import', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  CLONED: { label: 'Nhân bản', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  DELETED: { label: 'Đã xóa', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const EXECUTION_STATUS_STYLE: Record<
  ExecutionStatus,
  { label: string; short: string; className: string; dot: string; activeBtn: string }
> = {
  PASSED: {
    label: 'Passed',
    short: 'Pass',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    activeBtn: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
  },
  FAILED: {
    label: 'Failed',
    short: 'Fail',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    activeBtn: 'bg-rose-600 text-white border-rose-600 shadow-xs',
  },
  BLOCKED: {
    label: 'Blocked',
    short: 'Block',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    activeBtn: 'bg-amber-500 text-white border-amber-500 shadow-xs',
  },
  NOT_TEST: {
    label: 'Not Test',
    short: 'Not Test',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    dot: 'bg-slate-400',
    activeBtn: 'bg-slate-600 text-white border-slate-600 shadow-xs',
  },
  NOT_EXECUTED: {
    label: 'Not Executed',
    short: 'Chưa chạy',
    className: 'bg-white text-slate-500 border-slate-200',
    dot: 'bg-slate-300',
    activeBtn: 'bg-slate-800 text-white border-slate-800 shadow-xs',
  },
};

export const RUN_STATUS_STYLE: Record<TestRunStatus, { label: string; className: string }> = {
  IN_PROGRESS: {
    label: 'Đang chạy',
    className: 'bg-brand-50 text-brand-700 border-brand-200',
  },
  COMPLETED: {
    label: 'Hoàn tất',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  ABORTED: {
    label: 'Đã hủy',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

export const DEFECT_SEVERITY_STYLE: Record<
  DefectSeverity,
  { label: string; className: string; dot: string }
> = {
  HIGHEST: {
    label: 'Highest',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-600',
  },
  HIGH: {
    label: 'High',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
  },
  MEDIUM: {
    label: 'Medium',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
  },
  LOW: {
    label: 'Low',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
};

export const DEFECT_STATUS_STYLE: Record<DefectStatus, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  RESOLVED: { label: 'Resolved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CLOSED: { label: 'Closed', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getInitials(name: string): string {
  const cleaned = name.replace(/\([^)]*\)/g, ' ').trim();
  const parts = (cleaned || name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function safeExternalHttpUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // invalid URL
  }
  return null;
}
