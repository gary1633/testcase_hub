import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, GitCompareArrows, X } from 'lucide-react';
import type { TestCaseSnapshotDto, TestCaseVersionDto } from '@tcms/shared';
import { api } from '../lib/api';
import {
  AUTOMATION_STYLE,
  PRIORITY_STYLE,
  SEVERITY_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
  VERSION_STATE_STYLE,
} from '../lib/badges';
import { Select } from './Select';
import { useLanguage } from '../contexts/LanguageContext';

interface VersionCompareModalProps {
  projectId: string;
  caseCode: string;
  targetVersionId: string;
  onClose: () => void;
}

interface CompareRow {
  key: string;
  label: string;
  beforeVal: string;
  afterVal: string;
  changed: boolean;
  multiline?: boolean;
}

function fmt(v?: string | null): string {
  const s = (v ?? '').trim();
  return s || '—';
}

function fmtTags(arr?: string[], prefix = ''): string {
  if (!arr || arr.length === 0) return '—';
  return arr.map((x) => `${prefix}${x}`).join(', ');
}

function buildCompareRows(
  before: TestCaseSnapshotDto,
  after: TestCaseSnapshotDto,
  tx: (vi: string, en: string) => string,
): CompareRow[] {
  const uncategorized = tx('Chưa phân loại', 'Uncategorized');
  const raw: Array<{
    key: string;
    label: string;
    b: string;
    a: string;
    multiline?: boolean;
  }> = [
    { key: 'title', label: tx('Tiêu đề', 'Title'), b: fmt(before.title), a: fmt(after.title) },
    {
      key: 'suite',
      label: 'Test Suite',
      b: fmt(before.suiteTitle || uncategorized),
      a: fmt(after.suiteTitle || uncategorized),
    },
    {
      key: 'priority',
      label: 'Priority',
      b: PRIORITY_STYLE[before.priority]?.label || before.priority,
      a: PRIORITY_STYLE[after.priority]?.label || after.priority,
    },
    {
      key: 'severity',
      label: 'Severity',
      b: SEVERITY_LABEL[before.severity] || before.severity,
      a: SEVERITY_LABEL[after.severity] || after.severity,
    },
    {
      key: 'type',
      label: tx('Loại kiểm thử', 'Test Type'),
      b: TYPE_LABEL[before.type] || before.type,
      a: TYPE_LABEL[after.type] || after.type,
    },
    {
      key: 'automation',
      label: 'Automation',
      b: AUTOMATION_STYLE[before.automationStatus]?.label || before.automationStatus,
      a: AUTOMATION_STYLE[after.automationStatus]?.label || after.automationStatus,
    },
    {
      key: 'status',
      label: tx('Trạng thái', 'Status'),
      b: STATUS_STYLE[before.status]?.label || before.status,
      a: STATUS_STYLE[after.status]?.label || after.status,
    },
    {
      key: 'jira',
      label: 'Jira Keys',
      b: fmtTags(before.jiraIssueKeys),
      a: fmtTags(after.jiraIssueKeys),
    },
    {
      key: 'tags',
      label: 'Tags',
      b: fmtTags(before.tags, '#'),
      a: fmtTags(after.tags, '#'),
    },
    {
      key: 'preconditions',
      label: 'Pre-conditions',
      b: fmt(before.preconditions),
      a: fmt(after.preconditions),
      multiline: true,
    },
    {
      key: 'description',
      label: tx('Mô tả', 'Description'),
      b: fmt(before.description),
      a: fmt(after.description),
      multiline: true,
    },
  ];

  return raw.map((r) => ({
    key: r.key,
    label: r.label,
    beforeVal: r.b,
    afterVal: r.a,
    changed: r.b !== r.a,
    multiline: r.multiline,
  }));
}

export function VersionCompareModal({
  projectId,
  caseCode,
  targetVersionId,
  onClose,
}: VersionCompareModalProps) {
  const { tx, lang } = useLanguage();
  const dateLocale = lang === 'en' ? 'en-US' : 'vi-VN';

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['versions-by-code', projectId, caseCode],
    queryFn: () => api.listVersionsByCaseCode(projectId, caseCode),
  });

  // Sort ascending by versionNumber for intuitive pickers
  const sortedAsc = useMemo(
    () => [...versions].sort((a, b) => a.versionNumber - b.versionNumber),
    [versions],
  );

  const [beforeId, setBeforeId] = useState<string>('');
  const [afterId, setAfterId] = useState<string>('');
  const [onlyChanged, setOnlyChanged] = useState(false);

  useEffect(() => {
    if (sortedAsc.length === 0) return;
    const targetIdx = sortedAsc.findIndex((v) => v.id === targetVersionId);
    if (targetIdx > 0) {
      setBeforeId(sortedAsc[targetIdx - 1].id);
      setAfterId(sortedAsc[targetIdx].id);
    } else if (sortedAsc.length >= 2) {
      setBeforeId(sortedAsc[0].id);
      setAfterId(sortedAsc[sortedAsc.length - 1].id);
    } else {
      setBeforeId(sortedAsc[0].id);
      setAfterId(sortedAsc[0].id);
    }
  }, [sortedAsc, targetVersionId]);

  const beforeVer: TestCaseVersionDto | undefined = sortedAsc.find((v) => v.id === beforeId);
  const afterVer: TestCaseVersionDto | undefined = sortedAsc.find((v) => v.id === afterId);

  const fieldRows = useMemo(() => {
    if (!beforeVer || !afterVer) return [];
    return buildCompareRows(beforeVer.snapshot, afterVer.snapshot, tx);
  }, [beforeVer, afterVer, tx]);

  const stepDiffs = useMemo(() => {
    if (!beforeVer || !afterVer) return [];
    const bSteps = beforeVer.snapshot.steps ?? [];
    const aSteps = afterVer.snapshot.steps ?? [];
    const maxLen = Math.max(bSteps.length, aSteps.length);
    const out: Array<{
      index: number;
      before?: { action: string; data: string; expectedResult: string };
      after?: { action: string; data: string; expectedResult: string };
      status: 'added' | 'removed' | 'modified' | 'unchanged';
    }> = [];

    for (let i = 0; i < maxLen; i++) {
      const b = bSteps[i];
      const a = aSteps[i];
      if (!b && a) {
        out.push({ index: i, after: a, status: 'added' });
      } else if (b && !a) {
        out.push({ index: i, before: b, status: 'removed' });
      } else if (b && a) {
        const same =
          (b.action || '').trim() === (a.action || '').trim() &&
          (b.data || '').trim() === (a.data || '').trim() &&
          (b.expectedResult || '').trim() === (a.expectedResult || '').trim();
        out.push({ index: i, before: b, after: a, status: same ? 'unchanged' : 'modified' });
      }
    }
    return out;
  }, [beforeVer, afterVer]);

  const changedFieldCount = fieldRows.filter((r) => r.changed).length;
  const changedStepCount = stepDiffs.filter((s) => s.status !== 'unchanged').length;
  const visibleFields = onlyChanged ? fieldRows.filter((r) => r.changed) : fieldRows;
  const visibleSteps = onlyChanged ? stepDiffs.filter((s) => s.status !== 'unchanged') : stepDiffs;

  return (
    <div className="fixed inset-0 bg-[#11131A]/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
      <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <GitCompareArrows className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                  {caseCode}
                </span>
                <h2 className="text-base font-bold text-ink tracking-[-0.01em] truncate">
                  {tx('So sánh phiên bản (Trước ↔ Sau)', 'Compare Versions (Before ↔ After)')}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {tx(
                  `${changedFieldCount} trường thông tin thay đổi · ${changedStepCount} bước thay đổi`,
                  `${changedFieldCount} fields changed · ${changedStepCount} steps changed`,
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={tx('Đóng', 'Close')}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Version Picker Toolbar */}
        {!isLoading && sortedAsc.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                  {tx('Trước', 'Before')}
                </span>
                <Select
                  value={beforeId}
                  onChange={setBeforeId}
                  size="xs"
                  className="py-1.5"
                  options={sortedAsc.map((v) => ({
                    value: v.id,
                    label: `v${v.versionNumber} (${VERSION_STATE_STYLE[v.versionState].label}) — ${new Date(v.createdAt).toLocaleString(dateLocale)}`,
                  }))}
                />
              </div>

              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  {tx('Sau', 'After')}
                </span>
                <Select
                  value={afterId}
                  onChange={setAfterId}
                  size="xs"
                  className="py-1.5"
                  options={sortedAsc.map((v) => ({
                    value: v.id,
                    label: `v${v.versionNumber} (${VERSION_STATE_STYLE[v.versionState].label}) — ${new Date(v.createdAt).toLocaleString(dateLocale)}`,
                  }))}
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyChanged}
                onChange={(e) => setOnlyChanged(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 cursor-pointer"
              />
              {tx('Chỉ hiện mục có thay đổi', 'Show only changed items')}
            </label>
          </div>
        )}

        {/* Diff Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              {tx('Đang tải dữ liệu so sánh phiên bản...', 'Loading version comparison...')}
            </div>
          ) : sortedAsc.length < 2 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Test Case <strong>{caseCode}</strong>{' '}
              {tx(
                'hiện mới chỉ có 1 phiên bản (v1), chưa có phiên bản khác để so sánh.',
                'currently only has 1 version (v1); there is no other version to compare.',
              )}
            </div>
          ) : beforeVer && afterVer ? (
            <>
              {/* Metadata side-by-side table */}
              <div>
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2.5">
                  {tx('Thông tin Test Case', 'Test Case Information')}
                </h3>
                {visibleFields.length === 0 ? (
                  <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl p-4 text-center">
                    {tx(
                      `Không có thay đổi ở các trường thông tin chung giữa v${beforeVer.versionNumber} và v${afterVer.versionNumber}.`,
                      `No changes in general fields between v${beforeVer.versionNumber} and v${afterVer.versionNumber}.`,
                    )}
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold text-slate-500 uppercase">
                        <tr>
                          <th className="w-36 px-3.5 py-2.5">{tx('Trường', 'Field')}</th>
                          <th className="w-[42%] px-3.5 py-2.5 text-rose-700 bg-rose-50/40">
                            {tx('Trước', 'Before')} — v{beforeVer.versionNumber} (
                            {VERSION_STATE_STYLE[beforeVer.versionState].label})
                          </th>
                          <th className="w-[42%] px-3.5 py-2.5 text-emerald-700 bg-emerald-50/40">
                            {tx('Sau', 'After')} — v{afterVer.versionNumber} (
                            {VERSION_STATE_STYLE[afterVer.versionState].label})
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleFields.map((row) => (
                          <tr key={row.key}>
                            <td className="px-3.5 py-2.5 font-semibold text-slate-700 bg-slate-50/50 align-top">
                              {row.label}
                              {row.changed && (
                                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />
                              )}
                            </td>
                            <td
                              className={`px-3.5 py-2.5 align-top ${
                                row.multiline ? 'whitespace-pre-wrap' : ''
                              } ${
                                row.changed
                                  ? 'bg-rose-50/60 text-rose-900'
                                  : 'text-slate-600'
                              }`}
                            >
                              {row.beforeVal}
                            </td>
                            <td
                              className={`px-3.5 py-2.5 align-top ${
                                row.multiline ? 'whitespace-pre-wrap' : ''
                              } ${
                                row.changed
                                  ? 'bg-emerald-50/60 text-emerald-900 font-medium'
                                  : 'text-slate-600'
                              }`}
                            >
                              {row.afterVal}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Steps side-by-side comparison */}
              <div>
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2.5">
                  {tx('Các bước thực hiện', 'Test Steps')} ({beforeVer.snapshot.steps?.length ?? 0}{' '}
                  {tx('bước', 'steps')} → {afterVer.snapshot.steps?.length ?? 0}{' '}
                  {tx('bước', 'steps')})
                </h3>

                {visibleSteps.length === 0 ? (
                  <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl p-4 text-center">
                    {onlyChanged
                      ? tx('Không có bước thực hiện nào thay đổi.', 'No test steps changed.')
                      : tx('Chưa có bước thực hiện nào.', 'No test steps yet.')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleSteps.map((st) => {
                      const badge =
                        st.status === 'added'
                          ? {
                              label: tx('+ Thêm bước', '+ Added'),
                              cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            }
                          : st.status === 'removed'
                            ? {
                                label: tx('− Đã xóa bước', '− Removed'),
                                cls: 'bg-rose-50 text-rose-700 border-rose-200',
                              }
                            : st.status === 'modified'
                              ? {
                                  label: tx('Đã chỉnh sửa', 'Modified'),
                                  cls: 'bg-amber-50 text-amber-700 border-amber-200',
                                }
                              : {
                                  label: tx('Không đổi', 'Unchanged'),
                                  cls: 'bg-slate-100 text-slate-500 border-slate-200',
                                };

                      const actionChanged =
                        (st.before?.action || '').trim() !== (st.after?.action || '').trim();
                      const dataChanged =
                        (st.before?.data || '').trim() !== (st.after?.data || '').trim();
                      const expectedChanged =
                        (st.before?.expectedResult || '').trim() !==
                        (st.after?.expectedResult || '').trim();

                      return (
                        <div
                          key={st.index}
                          className="border border-slate-200 rounded-xl overflow-hidden"
                        >
                          <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                            <span className="font-semibold text-indigo-700">
                              {tx('Bước', 'Step')} {st.index + 1}
                            </span>
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 text-xs">
                            {/* Left: Before step */}
                            <div
                              className={`p-3 space-y-1.5 ${
                                st.status === 'removed' ? 'bg-rose-50/50' : 'bg-white'
                              }`}
                            >
                              {!st.before ? (
                                <span className="text-slate-400 italic">
                                  {tx('— (Không có ở bản cũ)', '— (Not in previous version)')}
                                </span>
                              ) : (
                                <>
                                  <div
                                    className={`p-1.5 rounded ${
                                      actionChanged ? 'bg-rose-50 text-rose-900' : ''
                                    }`}
                                  >
                                    <span className="text-[11px] font-semibold text-slate-500 block">
                                      Action:
                                    </span>
                                    <span className="whitespace-pre-wrap">
                                      {st.before.action || '—'}
                                    </span>
                                  </div>
                                  {(st.before.data || dataChanged) && (
                                    <div
                                      className={`p-1.5 rounded ${
                                        dataChanged ? 'bg-rose-50 text-rose-900' : ''
                                      }`}
                                    >
                                      <span className="text-[11px] font-semibold text-slate-500 block">
                                        Input Data:
                                      </span>
                                      <span className="whitespace-pre-wrap">
                                        {st.before.data || '—'}
                                      </span>
                                    </div>
                                  )}
                                  <div
                                    className={`p-1.5 rounded ${
                                      expectedChanged ? 'bg-rose-50 text-rose-900' : ''
                                    }`}
                                  >
                                    <span className="text-[11px] font-semibold text-slate-500 block">
                                      Expected Result:
                                    </span>
                                    <span className="whitespace-pre-wrap">
                                      {st.before.expectedResult || '—'}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Right: After step */}
                            <div
                              className={`p-3 space-y-1.5 ${
                                st.status === 'added' ? 'bg-emerald-50/50' : 'bg-white'
                              }`}
                            >
                              {!st.after ? (
                                <span className="text-slate-400 italic">
                                  {tx('— (Đã bị xóa)', '— (Removed)')}
                                </span>
                              ) : (
                                <>
                                  <div
                                    className={`p-1.5 rounded ${
                                      actionChanged ? 'bg-emerald-50 text-emerald-900 font-medium' : ''
                                    }`}
                                  >
                                    <span className="text-[11px] font-semibold text-slate-500 block">
                                      Action:
                                    </span>
                                    <span className="whitespace-pre-wrap">
                                      {st.after.action || '—'}
                                    </span>
                                  </div>
                                  {(st.after.data || dataChanged) && (
                                    <div
                                      className={`p-1.5 rounded ${
                                        dataChanged ? 'bg-emerald-50 text-emerald-900 font-medium' : ''
                                      }`}
                                    >
                                      <span className="text-[11px] font-semibold text-slate-500 block">
                                        Input Data:
                                      </span>
                                      <span className="whitespace-pre-wrap">
                                        {st.after.data || '—'}
                                      </span>
                                    </div>
                                  )}
                                  <div
                                    className={`p-1.5 rounded ${
                                      expectedChanged
                                        ? 'bg-emerald-50 text-emerald-900 font-medium'
                                        : ''
                                    }`}
                                  >
                                    <span className="text-[11px] font-semibold text-slate-500 block">
                                      Expected Result:
                                    </span>
                                    <span className="whitespace-pre-wrap">
                                      {st.after.expectedResult || '—'}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          {beforeVer && afterVer ? (
            <span>
              {tx('Trước:', 'Before:')}{' '}
              <strong>{beforeVer.changedByName || tx('Hệ thống', 'System')}</strong> (v
              {beforeVer.versionNumber}) · {tx('Sau:', 'After:')}{' '}
              <strong>{afterVer.changedByName || tx('Hệ thống', 'System')}</strong> (v
              {afterVer.versionNumber})
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg cursor-pointer"
          >
            {tx('Đóng', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
