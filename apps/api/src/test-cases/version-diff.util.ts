import type { FieldDiffDto, TestCaseSnapshotDto } from '@tcms/shared';

function fmt(val: string | null | undefined): string {
  const s = (val ?? '').trim();
  return s || '—';
}

function fmtArr(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return '—';
  return arr.join(', ');
}

function stepsSignature(
  steps: Array<{ action: string; data: string; expectedResult: string }>,
): string {
  return JSON.stringify(
    steps.map((s) => ({
      a: (s.action || '').trim(),
      d: (s.data || '').trim(),
      e: (s.expectedResult || '').trim(),
    })),
  );
}

export function computeSnapshotDiff(
  before: TestCaseSnapshotDto,
  after: TestCaseSnapshotDto,
): FieldDiffDto[] {
  const diffs: FieldDiffDto[] = [];

  const check = (field: string, label: string, oldVal: string, newVal: string) => {
    if (oldVal !== newVal) {
      diffs.push({ field, label, oldValue: oldVal, newValue: newVal });
    }
  };

  check('title', 'Tiêu đề', fmt(before.title), fmt(after.title));
  check('suiteId', 'Test Suite', fmt(before.suiteTitle), fmt(after.suiteTitle));
  check('priority', 'Priority', fmt(before.priority), fmt(after.priority));
  check('severity', 'Severity', fmt(before.severity), fmt(after.severity));
  check('type', 'Loại kiểm thử', fmt(before.type), fmt(after.type));
  check('automationStatus', 'Automation', fmt(before.automationStatus), fmt(after.automationStatus));
  check('status', 'Trạng thái', fmt(before.status), fmt(after.status));
  check('preconditions', 'Pre-conditions', fmt(before.preconditions), fmt(after.preconditions));
  check('description', 'Mô tả', fmt(before.description), fmt(after.description));
  check('tags', 'Tags', fmtArr(before.tags), fmtArr(after.tags));
  check('jiraIssueKeys', 'Jira Keys', fmtArr(before.jiraIssueKeys), fmtArr(after.jiraIssueKeys));

  if (stepsSignature(before.steps) !== stepsSignature(after.steps)) {
    diffs.push({
      field: 'steps',
      label: 'Các bước thực hiện',
      oldValue: `${before.steps.length} bước`,
      newValue: `${after.steps.length} bước`,
    });
  }

  return diffs;
}

export function buildDiffSummary(diffs: FieldDiffDto[], versionNumber: number): string {
  if (diffs.length === 0) return `Lưu phiên bản v${versionNumber}`;
  const labels = diffs.slice(0, 3).map((d) => d.label);
  const suffix = diffs.length > 3 ? ` và ${diffs.length - 3} trường khác` : '';
  return `Cập nhật ${labels.join(', ')}${suffix} (v${versionNumber})`;
}
