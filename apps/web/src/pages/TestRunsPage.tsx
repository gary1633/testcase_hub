import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bug,
  Download,
  Link2,
  Play,
  PlayCircle,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { canEditCases } from '@tcms/shared';
import { api } from '../lib/api';
import { RUN_STATUS_STYLE } from '../lib/badges';
import { ProjectNav } from '../components/ProjectNav';
import { Select } from '../components/Select';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useLanguage } from '../contexts/LanguageContext';

export function TestRunsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { tx, lang } = useLanguage();

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [environment, setEnvironment] = useState('UAT');
  const [appVersion, setAppVersion] = useState('2.1.0');
  const [jiraIssueKey, setJiraIssueKey] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['runs', projectId],
    queryFn: () => api.listRuns(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['plans', projectId],
    queryFn: () => api.listPlans(projectId!),
    enabled: Boolean(projectId && showCreate),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createRun(projectId!, {
        title,
        environment,
        appVersion,
        jiraIssueKey: jiraIssueKey || undefined,
        planId: selectedPlanId || null,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      setShowCreate(false);
      toast.success(tx(`Đã khởi tạo Test Run "${created.title}"`, `Created Test Run "${created.title}"`));
      navigate(`/projects/${projectId}/runs/${created.id}`);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : tx('Lỗi tạo Test Run', 'Failed to create Test Run');
      setFormError(msg);
      toast.error(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (runId: string) => api.deleteRun(projectId!, runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      toast.success(tx('Đã xóa Test Run', 'Deleted Test Run'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể xóa Test Run', 'Failed to delete Test Run')),
  });

  const rerunMut = useMutation({
    mutationFn: (sourceRun: (typeof runs)[number]) =>
      api.rerunFromRun(projectId!, sourceRun.id, {
        statuses: ['FAILED', 'BLOCKED'],
        title: `[Re-run] ${sourceRun.title}`,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      toast.success(tx(`Đã tạo Run chạy lại "${created.title}"`, `Created re-run "${created.title}"`));
      navigate(`/projects/${projectId}/runs/${created.id}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể tạo Run chạy lại', 'Failed to create re-run')),
  });

  if (!project) return <div className="p-8 text-sm text-slate-400">{tx('Đang tải...', 'Loading...')}</div>;
  const canEdit = canEditCases(project.myRole);
  const getRunStatusLabel = (status: keyof typeof RUN_STATUS_STYLE) =>
    status === 'IN_PROGRESS'
      ? tx('Đang chạy', 'In Progress')
      : status === 'COMPLETED'
        ? tx('Hoàn tất', 'Completed')
        : tx('Đã hủy', 'Aborted');

  return (
    <div className="flex-1 flex flex-col">
      <ProjectNav project={project} />

      <div className="max-w-7xl w-full mx-auto px-5 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink tracking-[-0.02em] flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-brand-600" />
              {tx('Test Runs (Đợt thực thi kiểm thử)', 'Test Runs')}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {tx(
                'Thực thi Passed / Failed / Blocked, tạo Bug Jira, đẩy tiến độ lên Jira và xuất Excel Vikki đủ 12/12 cột.',
                'Execute Passed / Failed / Blocked cases, create Jira bugs, sync progress to Jira, and export 12-column Vikki Excel reports.',
              )}
            </p>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setTitle(`Test Run — ${new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}`);
                setFormError(null);
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl shadow-xs shadow-brand-600/20 transition-all cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              {tx('Tạo Test Run', 'Create Test Run')}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-white rounded-2xl border border-hairline animate-pulse" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-hairline p-14 text-center">
            <PlayCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-ink">{tx('Chưa có Test Run nào', 'No Test Runs yet')}</p>
            <p className="text-sm text-slate-500 mt-1">
              {tx(
                'Tạo đợt chạy kiểm thử mới từ Test Plan hoặc từ toàn bộ Test Case trong dự án.',
                'Create a new test run from a Test Plan or from all Test Cases in this project.',
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {runs.map((run) => {
              const s = run.stats;
              const pctPass = s.total > 0 ? (s.passed / s.total) * 100 : 0;
              const pctFail = s.total > 0 ? (s.failed / s.total) * 100 : 0;
              const pctBlock = s.total > 0 ? (s.blocked / s.total) * 100 : 0;
              const pctNotTest = s.total > 0 ? (s.notTest / s.total) * 100 : 0;
              const stStyle = RUN_STATUS_STYLE[run.status];

              return (
                <div
                  key={run.id}
                  className="bg-white rounded-2xl border border-hairline hover:border-brand-300 transition-all p-5"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/projects/${projectId}/runs/${run.id}`}
                          className="text-base font-bold text-ink hover:text-brand-700 transition-colors"
                        >
                          {run.title}
                        </Link>
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${stStyle.className}`}
                        >
                          {getRunStatusLabel(run.status)}
                        </span>
                        {run.source === 'CI_CD' && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                            CI/CD
                          </span>
                        )}
                        {run.parentRunId && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F5EBFA] text-[#851FB6] border border-[#E9D5FF]">
                            Re-run
                          </span>
                        )}
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-canvas border border-hairline text-slate-600">
                          {run.environment} · v{run.appVersion}
                        </span>
                        {run.jiraIssueKey && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                            <Link2 className="w-3 h-3" />
                            {run.jiraIssueKey}
                          </span>
                        )}
                      </div>

                      {/* Segmented Multi-Color Progress Bar */}
                      <div className="max-w-2xl">
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                          {pctPass > 0 && (
                            <div
                              className="bg-emerald-500 h-full"
                              style={{ width: `${pctPass}%` }}
                              title={`Passed: ${s.passed}`}
                            />
                          )}
                          {pctFail > 0 && (
                            <div
                              className="bg-rose-500 h-full"
                              style={{ width: `${pctFail}%` }}
                              title={`Failed: ${s.failed}`}
                            />
                          )}
                          {pctBlock > 0 && (
                            <div
                              className="bg-amber-400 h-full"
                              style={{ width: `${pctBlock}%` }}
                              title={`Blocked: ${s.blocked}`}
                            />
                          )}
                          {pctNotTest > 0 && (
                            <div
                              className="bg-slate-400 h-full"
                              style={{ width: `${pctNotTest}%` }}
                              title={`Not Test: ${s.notTest}`}
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-1.5 tabular-nums">
                          <span className="text-slate-600">
                            {tx('Tổng:', 'Total:')} <strong className="text-ink">{s.total}</strong>
                          </span>
                          <span className="text-emerald-700 font-medium">
                            Passed: <strong>{s.passed}</strong>
                          </span>
                          <span className="text-rose-700 font-medium">
                            Failed: <strong>{s.failed}</strong>
                          </span>
                          <span className="text-amber-700 font-medium">
                            Blocked: <strong>{s.blocked}</strong>
                          </span>
                          <span className="text-slate-500">
                            {tx('Chưa chạy:', 'Pending:')} <strong>{s.notExecuted}</strong>
                          </span>
                          <span className="font-semibold text-brand-700">
                            Pass Rate: {s.passRate}%
                          </span>
                          {run.defectCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                              <Bug className="w-3.5 h-3.5" />
                              {run.defectCount} {tx('Bug', run.defectCount === 1 ? 'Bug' : 'Bugs')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={api.getRunExportUrl(projectId!, run.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl transition-colors"
                        title={tx('Xuất phiếu kiểm thử Vikki đủ 12/12 cột & DRAW_BUG', 'Export 12-column Vikki test report & DRAW_BUG')}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {tx('Excel Vikki (12 cột)', 'Vikki Excel (12 cols)')}
                      </a>
                      <Link
                        to={`/projects/${projectId}/runs/${run.id}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-xs transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {canEdit ? tx('Thực thi', 'Execute') : tx('Xem chi tiết', 'View Details')}
                      </Link>
                      {canEdit && s.failed + s.blocked > 0 && (
                        <button
                          type="button"
                          disabled={rerunMut.isPending}
                          onClick={() => rerunMut.mutate(run)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
                          title={tx(
                            `Tạo Run mới chỉ chứa ${s.failed + s.blocked} case Failed/Blocked`,
                            `Create a new Run with ${s.failed + s.blocked} Failed/Blocked cases`,
                          )}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {tx(`Chạy lại Lỗi (${s.failed + s.blocked})`, `Re-run Failed (${s.failed + s.blocked})`)}
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm({
                              title: tx(`Xóa Test Run "${run.title}"?`, `Delete Test Run "${run.title}"?`),
                              description: tx(
                                'Toàn bộ kết quả chạy và bằng chứng trong đợt chạy này sẽ bị xóa vĩnh viễn.',
                                'All execution results and evidence in this test run will be permanently deleted.',
                              ),
                              confirmText: tx('Xóa Test Run', 'Delete Test Run'),
                              variant: 'danger',
                            });
                            if (ok) {
                              deleteMut.mutate(run.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title={tx('Xóa Test Run', 'Delete Test Run')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Test Run Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-[#11131A]/45 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-ink">
                {tx('Tạo đợt chạy kiểm thử (Test Run)', 'Create Test Run')}
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1 text-slate-400 hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFormError(null);
                createMut.mutate();
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Tên Test Run *', 'Test Run Name *')}
                </label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-hairline rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Nguồn Test Cases', 'Test Cases Source')}
                </label>
                <Select
                  value={selectedPlanId}
                  onChange={setSelectedPlanId}
                  size="md"
                  className="w-full"
                  options={[
                    {
                      value: '',
                      label: tx(
                        `Tất cả Test Cases trong dự án (${project.stats.totalCases})`,
                        `All Test Cases in project (${project.stats.totalCases})`,
                      ),
                    },
                    ...plans.map((p) => ({
                      value: p.id,
                      label: `Test Plan: ${p.title} (${p.caseCount} cases)`,
                    })),
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Môi trường', 'Environment')}
                  </label>
                  <input
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    placeholder="Staging / UAT / Prod"
                    className="w-full px-3 py-2 text-sm border border-hairline rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Phiên bản', 'Version')}
                  </label>
                  <input
                    value={appVersion}
                    onChange={(e) => setAppVersion(e.target.value)}
                    placeholder="2.1.0"
                    className="w-full px-3 py-2 text-sm font-mono border border-hairline rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Jira Story / Epic Key (để đẩy tiến độ lên Jira)', 'Jira Story / Epic Key (to sync progress to Jira)')}
                </label>
                <input
                  value={jiraIssueKey}
                  onChange={(e) => setJiraIssueKey(e.target.value.toUpperCase())}
                  placeholder={tx('VD: ECOM-100', 'e.g., ECOM-100')}
                  className="w-full px-3 py-2 text-sm font-mono border border-hairline rounded-xl"
                />
              </div>

              {formError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-canvas rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl cursor-pointer"
                >
                  {createMut.isPending ? tx('Đang tạo...', 'Creating...') : tx('Tạo & Thực thi', 'Create & Execute')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
