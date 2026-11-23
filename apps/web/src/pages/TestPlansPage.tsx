import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  FileText,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { canEditCases, type TestPlanSummaryDto } from '@tcms/shared';
import { api } from '../lib/api';
import { PRIORITY_STYLE } from '../lib/badges';
import { ProjectNav } from '../components/ProjectNav';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useLanguage } from '../contexts/LanguageContext';

export function TestPlansPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { tx, lang } = useLanguage();

  const [showEditor, setShowEditor] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [caseSearch, setCaseSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Launch Run from Plan modal
  const [launchPlan, setLaunchPlan] = useState<TestPlanSummaryDto | null>(null);
  const [runTitle, setRunTitle] = useState('');
  const [runEnv, setRunEnv] = useState('UAT');
  const [runVersion, setRunVersion] = useState('2.1.0');
  const [runJiraKey, setRunJiraKey] = useState('');

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans', projectId],
    queryFn: () => api.listPlans(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: casesPage } = useQuery({
    queryKey: ['cases-for-plan-picker', projectId],
    queryFn: () => api.listCases(projectId!, { page: 1, pageSize: 200 }),
    enabled: Boolean(projectId && showEditor),
  });

  const savePlanMut = useMutation({
    mutationFn: async () => {
      const caseIds = Array.from(selectedCaseIds);
      if (editingPlanId) {
        return api.updatePlan(projectId!, editingPlanId, { title, description, caseIds });
      }
      return api.createPlan(projectId!, { title, description, caseIds });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['plans', projectId] });
      setShowEditor(false);
      toast.success(
        editingPlanId
          ? tx(`Đã cập nhật Test Plan "${saved.title}"`, `Updated Test Plan "${saved.title}"`)
          : tx(`Đã tạo Test Plan "${saved.title}"`, `Created Test Plan "${saved.title}"`),
      );
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : tx('Lỗi lưu Test Plan', 'Failed to save Test Plan');
      setFormError(msg);
      toast.error(msg);
    },
  });

  const deletePlanMut = useMutation({
    mutationFn: (planId: string) => api.deletePlan(projectId!, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', projectId] });
      toast.success(tx('Đã xóa Test Plan', 'Deleted Test Plan'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể xóa Test Plan', 'Failed to delete Test Plan')),
  });

  const launchRunMut = useMutation({
    mutationFn: () =>
      api.createRun(projectId!, {
        title: runTitle,
        environment: runEnv,
        appVersion: runVersion,
        jiraIssueKey: runJiraKey || undefined,
        planId: launchPlan!.id,
      }),
    onSuccess: (createdRun) => {
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['plans', projectId] });
      setLaunchPlan(null);
      toast.success(tx(`Đã tạo Test Run "${createdRun.title}"`, `Created Test Run "${createdRun.title}"`));
      navigate(`/projects/${projectId}/runs/${createdRun.id}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể tạo Test Run', 'Failed to create Test Run')),
  });

  if (!project) return <div className="p-8 text-sm text-slate-400">{tx('Đang tải...', 'Loading...')}</div>;
  const canEdit = canEditCases(project.myRole);
  const allCases = casesPage?.items ?? [];
  const filteredCases = allCases.filter(
    (c) =>
      c.title.toLowerCase().includes(caseSearch.toLowerCase()) ||
      c.code.toLowerCase().includes(caseSearch.toLowerCase()) ||
      (c.suiteTitle || '').toLowerCase().includes(caseSearch.toLowerCase()),
  );

  const openCreateModal = () => {
    setEditingPlanId(null);
    setTitle('');
    setDescription('');
    setSelectedCaseIds(new Set());
    setCaseSearch('');
    setFormError(null);
    setShowEditor(true);
  };

  const openEditModal = async (plan: TestPlanSummaryDto) => {
    setFormError(null);
    const detail = await api.getPlan(projectId!, plan.id);
    setEditingPlanId(detail.id);
    setTitle(detail.title);
    setDescription(detail.description || '');
    setSelectedCaseIds(new Set(detail.caseIds));
    setCaseSearch('');
    setShowEditor(true);
  };

  const openLaunchModal = (plan: TestPlanSummaryDto) => {
    setLaunchPlan(plan);
    setRunTitle(`${plan.title} — ${new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}`);
    setRunEnv('UAT');
    setRunVersion('2.1.0');
    setRunJiraKey('');
  };

  const toggleCase = (id: string) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col">
      <ProjectNav project={project} />

      <div className="max-w-7xl w-full mx-auto px-5 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink tracking-[-0.02em] flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-brand-600" />
              Test Plans
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {tx(
                'Lưu sẵn các bộ Test Case mẫu (Smoke, Regression, Release) để khởi chạy Test Run nhanh.',
                'Save reusable Test Case templates (Smoke, Regression, Release) to quickly launch Test Runs.',
              )}
            </p>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl shadow-xs shadow-brand-600/20 transition-all cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              {tx('Tạo Test Plan', 'Create Test Plan')}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-40 bg-white rounded-2xl border border-hairline animate-pulse" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-2xl border border-hairline p-14 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-ink">{tx('Chưa có Test Plan nào', 'No Test Plans yet')}</p>
            <p className="text-sm text-slate-500 mt-1">
              {tx(
                'Tạo Test Plan để gom nhóm các Test Case chạy lặp lại theo từng Sprint / Release.',
                'Create a Test Plan to group recurring Test Cases by Sprint or Release.',
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-white rounded-2xl border border-hairline hover:border-brand-300 transition-all p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-bold text-ink leading-snug">{plan.title}</h2>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(plan)}
                          title={tx('Chỉnh sửa Plan', 'Edit Plan')}
                          className="p-1.5 text-slate-400 hover:text-brand-700 hover:bg-brand-50 rounded-lg cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm({
                              title: tx(`Xóa Test Plan "${plan.title}"?`, `Delete Test Plan "${plan.title}"?`),
                              description: tx(
                                'Chỉ xóa danh sách kế hoạch này, các Test Case gốc trong Kho Test Case vẫn được giữ nguyên.',
                                'Only this plan will be deleted; the original Test Cases in the Repository will remain intact.',
                              ),
                              confirmText: tx('Xóa Test Plan', 'Delete Test Plan'),
                              variant: 'danger',
                            });
                            if (ok) {
                              deletePlanMut.mutate(plan.id);
                            }
                          }}
                          title={tx('Xóa Plan', 'Delete Plan')}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    {plan.description || tx('Chưa có mô tả cho bộ kiểm thử này.', 'No description for this test plan yet.')}
                  </p>
                </div>

                <div className="pt-3.5 border-t border-hairline/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-xs text-slate-600 tabular-nums">
                    <span className="inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-canvas border border-hairline">
                      <FileText className="w-3.5 h-3.5 text-brand-600" />
                      <strong>{plan.caseCount}</strong> cases
                    </span>
                    <span className="text-slate-500">
                      {tx('Đã chạy', 'Executed')} <strong className="text-ink">{plan.runCount}</strong>{' '}
                      {tx('lượt', plan.runCount === 1 ? 'run' : 'runs')}
                    </span>
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openLaunchModal(plan)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {tx('Chạy Test Run', 'Run Test Run')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Test Plan Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-[#11131A]/45 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
            <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">
                {editingPlanId ? tx('Chỉnh sửa Test Plan', 'Edit Test Plan') : tx('Tạo Test Plan mới', 'Create New Test Plan')}
              </h2>
              <button
                type="button"
                onClick={() => setShowEditor(false)}
                className="p-1.5 text-slate-400 hover:text-ink rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFormError(null);
                savePlanMut.mutate();
              }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Tên Test Plan *', 'Test Plan Name *')}
                  </label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={tx('VD: Release v2.2 — Smoke & Payment Regression', 'e.g., Release v2.2 — Smoke & Payment Regression')}
                    className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Mô tả', 'Description')}
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={tx('Mục tiêu và phạm vi kiểm thử...', 'Testing objectives and scope...')}
                    className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:border-brand-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700">
                      {tx(`Chọn Test Cases (${selectedCaseIds.size} đã chọn) *`, `Select Test Cases (${selectedCaseIds.size} selected) *`)}
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedCaseIds(new Set(filteredCases.map((c) => c.id)))}
                        className="text-brand-700 hover:underline cursor-pointer"
                      >
                        {tx(`Chọn tất cả (${filteredCases.length})`, `Select all (${filteredCases.length})`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCaseIds(new Set())}
                        className="text-slate-500 hover:underline cursor-pointer"
                      >
                        {tx('Bỏ chọn', 'Clear selection')}
                      </button>
                    </div>
                  </div>

                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={caseSearch}
                      onChange={(e) => setCaseSearch(e.target.value)}
                      placeholder={tx('Tìm mã case, tiêu đề hoặc tên suite...', 'Search by case code, title, or suite name...')}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-canvas border border-hairline rounded-lg focus:bg-white focus:outline-none focus:border-brand-600"
                    />
                  </div>

                  <div className="border border-hairline rounded-xl max-h-60 overflow-y-auto divide-y divide-hairline/70">
                    {filteredCases.map((tc) => {
                      const checked = selectedCaseIds.has(tc.id);
                      return (
                        <label
                          key={tc.id}
                          className={`flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors ${
                            checked ? 'bg-brand-50/60' : 'hover:bg-canvas'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCase(tc.id)}
                            className="rounded border-slate-300 accent-brand-600"
                          />
                          <span className="font-mono font-semibold text-brand-700 shrink-0">
                            {tc.code}
                          </span>
                          <span className="flex-1 truncate text-ink font-medium">{tc.title}</span>
                          {tc.suiteTitle && (
                            <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                              {tc.suiteTitle}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${
                              PRIORITY_STYLE[tc.priority].className
                            }`}
                          >
                            {PRIORITY_STYLE[tc.priority].label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {formError && (
                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    {formError}
                  </div>
                )}
              </div>

              <div className="px-5 py-3.5 border-t border-hairline flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-canvas rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savePlanMut.isPending || selectedCaseIds.size === 0}
                  className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl cursor-pointer"
                >
                  {savePlanMut.isPending ? tx('Đang lưu...', 'Saving...') : tx('Lưu Test Plan', 'Save Test Plan')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Launch Run Modal */}
      {launchPlan && (
        <div className="fixed inset-0 bg-[#11131A]/45 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-ink">
                {tx('Khởi chạy Test Run từ Plan', 'Launch Test Run from Plan')}
              </h2>
              <button
                type="button"
                onClick={() => setLaunchPlan(null)}
                className="p-1 text-slate-400 hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                launchRunMut.mutate();
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Tên đợt chạy (Test Run) *', 'Test Run Title *')}
                </label>
                <input
                  required
                  value={runTitle}
                  onChange={(e) => setRunTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-hairline rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Môi trường', 'Environment')}
                  </label>
                  <input
                    value={runEnv}
                    onChange={(e) => setRunEnv(e.target.value)}
                    placeholder="Staging / UAT / Prod"
                    className="w-full px-3 py-2 text-sm border border-hairline rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Phiên bản build', 'Build Version')}
                  </label>
                  <input
                    value={runVersion}
                    onChange={(e) => setRunVersion(e.target.value)}
                    placeholder={tx('VD: 2.1.0', 'e.g., 2.1.0')}
                    className="w-full px-3 py-2 text-sm font-mono border border-hairline rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Jira Ticket Key (để đẩy tiến độ lên Jira)', 'Jira Ticket Key (to sync progress to Jira)')}
                </label>
                <input
                  value={runJiraKey}
                  onChange={(e) => setRunJiraKey(e.target.value.toUpperCase())}
                  placeholder={tx('VD: ECOM-100', 'e.g., ECOM-100')}
                  className="w-full px-3 py-2 text-sm font-mono border border-hairline rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLaunchPlan(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-canvas rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={launchRunMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  {launchRunMut.isPending ? tx('Đang khởi tạo...', 'Launching...') : tx('Bắt đầu chạy', 'Start Run')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
