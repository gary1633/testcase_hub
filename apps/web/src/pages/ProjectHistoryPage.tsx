import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  GitCompareArrows,
  History,
  Search,
  User,
  X,
} from 'lucide-react';
import {
  VERSION_ACTIONS,
  type TestCaseVersionDto,
  type VersionAction,
  type VersionState,
} from '@tcms/shared';
import { api } from '../lib/api';
import {
  AUTOMATION_STYLE,
  PRIORITY_STYLE,
  SEVERITY_LABEL,
  TYPE_LABEL,
  VERSION_ACTION_STYLE,
  VERSION_STATE_STYLE,
} from '../lib/badges';
import { ProjectNav } from '../components/ProjectNav';
import { Select } from '../components/Select';
import { VersionCompareModal } from '../components/VersionCompareModal';
import { useLanguage } from '../contexts/LanguageContext';

export function ProjectHistoryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { tx, lang } = useLanguage();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const getActionLabel = (act: VersionAction) => {
    switch (act) {
      case 'CREATED':
        return tx('Tạo mới', 'Created');
      case 'UPDATED':
        return tx('Cập nhật', 'Updated');
      case 'RESTORED':
        return tx('Khôi phục', 'Restored');
      case 'BULK_UPDATED':
        return tx('Sửa hàng loạt', 'Bulk Updated');
      case 'IMPORTED':
        return tx('Import', 'Imported');
      case 'CLONED':
        return tx('Nhân bản', 'Cloned');
      case 'DELETED':
        return tx('Đã xóa', 'Deleted');
      default:
        return String(act);
    }
  };

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [versionState, setVersionState] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [page, setPage] = useState(1);
  const [previewVersion, setPreviewVersion] = useState<TestCaseVersionDto | null>(null);
  const [compareTarget, setCompareTarget] = useState<{
    caseCode: string;
    versionId: string;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['project-history', projectId, debouncedSearch, versionState, action, page],
    queryFn: () =>
      api.listProjectHistory(projectId!, {
        search: debouncedSearch || undefined,
        versionState: (versionState as VersionState) || undefined,
        action: (action as VersionAction) || undefined,
        page,
        pageSize: 30,
      }),
    enabled: Boolean(projectId),
  });

  if (!project) return <div className="p-8 text-sm text-slate-400">{tx('Đang tải...', 'Loading...')}</div>;

  const items = historyData?.items ?? [];
  const hasFilter = Boolean(debouncedSearch || versionState || action);

  return (
    <div className="flex-1 flex flex-col">
      <ProjectNav project={project} />

      <div className="max-w-7xl w-full mx-auto px-5 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink tracking-[-0.02em] flex items-center gap-2">
              <History className="w-5 h-5 text-brand-600" />
              {tx('Lịch sử thay đổi Test Cases toàn Dự án', 'Project Test Case Change History')}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {tx(
                'Theo dõi phiên bản Active / Outdated / Deleted và so sánh chi tiết Trước ↔ Sau.',
                'Track Active / Outdated / Deleted versions and compare Before ↔ After diffs.',
              )}
            </p>
          </div>

          <span className="text-xs font-mono tabular-nums text-slate-600 bg-white border border-hairline px-3 py-1.5 rounded-xl self-start sm:self-auto">
            {tx('Tổng cộng:', 'Total:')} <strong className="text-ink">{historyData?.total ?? 0}</strong>{' '}
            {tx('bản ghi', (historyData?.total ?? 0) === 1 ? 'record' : 'records')}
          </span>
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-hairline p-3.5 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={tx(
                `Tìm mã (${project.code}-1), tên test case, người sửa...`,
                `Search code (${project.code}-1), case title, editor...`,
              )}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-canvas border border-hairline rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>

          <Filter className="w-3.5 h-3.5 text-slate-400" />

          <Select
            value={versionState}
            onChange={(v) => {
              setVersionState(v);
              setPage(1);
            }}
            size="xs"
            className="py-1.5 min-w-[195px]"
            options={[
              { value: '', label: tx('Trạng thái phiên bản: Tất cả', 'Version State: All') },
              { value: 'ACTIVE', label: tx('Active (Bản hiện hành)', 'Active (Current)'), dotClassName: 'bg-emerald-500' },
              { value: 'OUTDATED', label: tx('Outdated (Bản cũ)', 'Outdated (Previous)'), dotClassName: 'bg-amber-500' },
              { value: 'DELETED', label: tx('Deleted (Đã xóa)', 'Deleted'), dotClassName: 'bg-rose-500' },
            ]}
          />

          <Select
            value={action}
            onChange={(v) => {
              setAction(v);
              setPage(1);
            }}
            size="xs"
            className="py-1.5 min-w-[155px]"
            options={[
              { value: '', label: tx('Hành động: Tất cả', 'Action: All') },
              ...VERSION_ACTIONS.map((act) => ({
                value: act,
                label: getActionLabel(act),
              })),
            ]}
          />

          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setDebouncedSearch('');
                setVersionState('');
                setAction('');
                setPage(1);
              }}
              className="text-xs font-medium text-brand-700 hover:underline px-1.5 cursor-pointer"
            >
              {tx('Xóa lọc', 'Clear filters')}
            </button>
          )}
        </div>

        {/* Visual Timeline History List */}
        <div className="bg-white rounded-2xl border border-hairline overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-slate-400">
              {tx('Đang tải lịch sử thay đổi...', 'Loading change history...')}
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              {tx(
                'Chưa có bản ghi lịch sử nào phù hợp bộ lọc.',
                'No history records match the current filters.',
              )}
            </div>
          ) : (
            <div className="divide-y divide-hairline/70">
              {items.map((ver) => {
                const stateStyle = VERSION_STATE_STYLE[ver.versionState];
                const actStyle = VERSION_ACTION_STYLE[ver.action];
                const railDotColor =
                  ver.versionState === 'ACTIVE'
                    ? 'bg-emerald-500 ring-emerald-100'
                    : ver.versionState === 'DELETED'
                      ? 'bg-rose-500 ring-rose-100'
                      : 'bg-amber-400 ring-amber-100';
                return (
                  <div
                    key={ver.id}
                    className="p-4 sm:px-5 hover:bg-canvas/70 transition-colors flex items-start gap-3.5"
                  >
                    <div className="pt-1.5 shrink-0">
                      <span className={`block w-2.5 h-2.5 rounded-full ring-4 ${railDotColor}`} />
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {ver.testCaseId ? (
                            <Link
                              to={`/projects/${projectId}/repository?caseId=${ver.testCaseId}`}
                              className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition-colors"
                            >
                              {ver.caseCode}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 line-through">
                              {ver.caseCode}
                            </span>
                          )}

                          <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-canvas text-slate-700 border border-hairline tabular-nums">
                            v{ver.versionNumber}
                          </span>

                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${stateStyle.className}`}
                          >
                            {stateStyle.label}
                          </span>

                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${actStyle.className}`}
                          >
                            {getActionLabel(ver.action)}
                          </span>

                          <span className="text-sm font-semibold text-ink truncate">
                            {ver.snapshot?.title || ver.summary}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setCompareTarget({
                                caseCode: ver.caseCode,
                                versionId: ver.id,
                              })
                            }
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                              ver.versionNumber > 1
                                ? 'text-brand-700 bg-brand-50 hover:bg-brand-100 border-brand-200'
                                : 'text-slate-600 bg-canvas hover:bg-brand-50 hover:text-brand-700 border-hairline hover:border-brand-200'
                            }`}
                            title={tx(
                              'So sánh sự thay đổi Trước / Sau giữa các phiên bản của Test Case này',
                              'Compare Before / After changes between versions of this Test Case',
                            )}
                          >
                            <GitCompareArrows className="w-3.5 h-3.5" />
                            {tx('So sánh Trước/Sau', 'Compare Diff')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewVersion(ver)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-brand-700 bg-white border border-hairline hover:border-brand-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {tx('Xem bản chụp', 'View Snapshot')}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span>{ver.summary}</span>
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {ver.changedByName || tx('Hệ thống', 'System')}
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(ver.createdAt).toLocaleString(locale)}
                        </span>
                      </div>

                      {ver.changes && ver.changes.length > 0 && (
                        <div className="bg-canvas border border-hairline rounded-xl p-2.5 space-y-1.5">
                          {ver.changes.map((diff, idx) => (
                            <div
                              key={`${diff.field}-${idx}`}
                              className="text-xs flex flex-wrap items-center gap-1.5"
                            >
                              <span className="font-semibold text-slate-700 min-w-[115px]">
                                {diff.label}:
                              </span>
                              <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/70 line-through max-w-xs truncate">
                                {diff.oldValue}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/70 font-medium max-w-xs truncate">
                                {diff.newValue}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {historyData && historyData.totalPages > 1 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                {tx('Trang', 'Page')} <strong>{historyData.page}</strong> / {historyData.totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= historyData.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side-by-Side Version Compare Modal */}
      {compareTarget && (
        <VersionCompareModal
          projectId={projectId!}
          caseCode={compareTarget.caseCode}
          targetVersionId={compareTarget.versionId}
          onClose={() => setCompareTarget(null)}
        />
      )}

      {/* Snapshot Preview Modal */}
      {previewVersion && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {previewVersion.caseCode}
                </span>
                <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                  v{previewVersion.versionNumber}
                </span>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                    VERSION_STATE_STYLE[previewVersion.versionState].className
                  }`}
                >
                  {VERSION_STATE_STYLE[previewVersion.versionState].label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVersion(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase">
                  {tx('Tiêu đề', 'Title')}
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">
                  {previewVersion.snapshot.title}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-slate-400 block">Suite</span>
                  <span className="font-medium text-slate-800">
                    {previewVersion.snapshot.suiteTitle || tx('Chưa phân loại', 'Uncategorized')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Priority</span>
                  <span className="font-medium text-slate-800">
                    {PRIORITY_STYLE[previewVersion.snapshot.priority]?.label ||
                      previewVersion.snapshot.priority}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Severity</span>
                  <span className="font-medium text-slate-800">
                    {SEVERITY_LABEL[previewVersion.snapshot.severity] ||
                      previewVersion.snapshot.severity}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Automation / Type</span>
                  <span className="font-medium text-slate-800">
                    {AUTOMATION_STYLE[previewVersion.snapshot.automationStatus]?.label} ·{' '}
                    {TYPE_LABEL[previewVersion.snapshot.type]}
                  </span>
                </div>
              </div>

              {previewVersion.snapshot.preconditions && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1">
                    Pre-conditions
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 whitespace-pre-wrap text-slate-700">
                    {previewVersion.snapshot.preconditions}
                  </div>
                </div>
              )}

              {previewVersion.snapshot.description && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1">
                    {tx('Mô tả', 'Description')}
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 whitespace-pre-wrap text-slate-700">
                    {previewVersion.snapshot.description}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                  {tx(
                    `Các bước thực hiện (${previewVersion.snapshot.steps?.length ?? 0})`,
                    `Test Steps (${previewVersion.snapshot.steps?.length ?? 0})`,
                  )}
                </div>
                {previewVersion.snapshot.steps?.length ? (
                  <div className="space-y-2">
                    {previewVersion.snapshot.steps.map((s, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1"
                      >
                        <div className="font-semibold text-indigo-700">
                          {tx(`Bước ${idx + 1}`, `Step ${idx + 1}`)}
                        </div>
                        <div>
                          <span className="text-slate-400">Action:</span> {s.action || '—'}
                        </div>
                        {s.data && (
                          <div>
                            <span className="text-slate-400">Input:</span> {s.data}
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400">Expected:</span>{' '}
                          {s.expectedResult || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400">
                    {tx('Không có bước thực hiện.', 'No test steps.')}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span>
                {previewVersion.changedByName || tx('Hệ thống', 'System')} ·{' '}
                {new Date(previewVersion.createdAt).toLocaleString(locale)}
              </span>
              <button
                type="button"
                onClick={() => setPreviewVersion(null)}
                className="px-3.5 py-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium cursor-pointer"
              >
                {tx('Đóng', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
