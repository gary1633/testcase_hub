import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  FileSpreadsheet,
  Filter,
  FolderInput,
  Layers,
  ListChecks,
  Paperclip,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AUTOMATION_STATUSES,
  PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_CASE_TYPES,
  canEditCases,
  canManageProject,
  type AutomationStatus,
  type Priority,
  type SuiteDto,
  type TestCaseStatus,
  type TestCaseType,
} from '@tcms/shared';
import { api } from '../lib/api';
import { AUTOMATION_STYLE, PRIORITY_STYLE, STATUS_STYLE, TYPE_LABEL } from '../lib/badges';
import { ProjectNav } from '../components/ProjectNav';
import { Select } from '../components/Select';
import {
  SuiteTree,
  collectDescendantIds,
  type SuiteMovePayload,
} from '../components/SuiteTree';
import { TestCaseDrawer } from '../components/TestCaseDrawer';
import { SharedStepsModal } from '../components/SharedStepsModal';
import { TrashModal } from '../components/TrashModal';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function RepositoryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { tx } = useLanguage();

  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [priority, setPriority] = useState<string>('');
  const [automationStatus, setAutomationStatus] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [jiraKey, setJiraKey] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [drawerCaseId, setDrawerCaseId] = useState<string | 'new' | null>(() =>
    searchParams.get('caseId'),
  );

  // Nhóm 1 & 2 modals
  const [showSharedSteps, setShowSharedSteps] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showQuickPlan, setShowQuickPlan] = useState(false);
  const [quickPlanTitle, setQuickPlanTitle] = useState('');
  const [quickPlanDesc, setQuickPlanDesc] = useState('');
  const [showQuickRun, setShowQuickRun] = useState(false);
  const [quickRunTitle, setQuickRunTitle] = useState('');
  const [quickRunEnv, setQuickRunEnv] = useState('Staging');
  const [quickRunVer, setQuickRunVer] = useState('');
  const [quickRunJira, setQuickRunJira] = useState('');

  useEffect(() => {
    const paramCaseId = searchParams.get('caseId');
    if (paramCaseId) {
      setDrawerCaseId(paramCaseId);
    }
  }, [searchParams]);

  // Suite modal state
  const [suiteModal, setSuiteModal] = useState<{
    mode: 'create' | 'rename';
    parentId?: string | null;
    suite?: SuiteDto;
  } | null>(null);
  const [suiteTitle, setSuiteTitle] = useState('');
  const [suiteDesc, setSuiteDesc] = useState('');
  const [suiteParentId, setSuiteParentId] = useState<string>('');

  // Import CSV modal state
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Bulk Move modal
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [bulkMoveSuiteId, setBulkMoveSuiteId] = useState<string>('');

  // Cross-project Duplicate (Copy to Project) modal
  const [copyModal, setCopyModal] = useState<
    | { kind: 'cases'; caseIds: string[]; label: string }
    | { kind: 'suite'; suite: SuiteDto }
    | null
  >(null);
  const [copyTargetProjectId, setCopyTargetProjectId] = useState<string>('');
  const [copyTargetSuiteId, setCopyTargetSuiteId] = useState<string>('');
  const [copyIncludeSubSuites, setCopyIncludeSubSuites] = useState(true);
  const [copyIncludeCases, setCopyIncludeCases] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setSelectedCaseIds(new Set());
  }, [selectedSuiteId, page, debouncedSearch, priority, automationStatus, type, statusFilter, jiraKey]);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: suiteData } = useQuery({
    queryKey: ['suites', projectId],
    queryFn: () => api.listSuites(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: trashItems = [] } = useQuery({
    queryKey: ['trash', projectId],
    queryFn: () => api.listTrash(projectId!),
    enabled: Boolean(projectId) && canEditCases(project?.myRole),
  });

  const { data: accessibleProjects = [] } = useQuery({
    queryKey: ['projects', user?.id, false],
    queryFn: () => api.listProjects(false),
    enabled: Boolean(user?.id),
  });

  const writableProjects = accessibleProjects.filter(
    (p) => !p.isArchived && canEditCases(p.myRole),
  );

  const { data: targetSuiteData, isLoading: targetSuitesLoading } = useQuery({
    queryKey: ['suites', copyTargetProjectId],
    queryFn: () => api.listSuites(copyTargetProjectId),
    enabled: Boolean(copyModal && copyTargetProjectId),
  });

  const { data: casesData, isLoading: casesLoading } = useQuery({
    queryKey: [
      'cases',
      projectId,
      selectedSuiteId,
      debouncedSearch,
      priority,
      automationStatus,
      type,
      statusFilter,
      jiraKey,
      page,
      pageSize,
    ],
    queryFn: () =>
      api.listCases(projectId!, {
        suiteId: selectedSuiteId || undefined,
        includeSubSuites: true,
        search: debouncedSearch || undefined,
        priority: priority || undefined,
        automationStatus: automationStatus || undefined,
        type: type || undefined,
        status: statusFilter || undefined,
        jiraKey: jiraKey || undefined,
        page,
        pageSize,
      }),
    enabled: Boolean(projectId),
  });

  const createSuiteMut = useMutation({
    mutationFn: (payload: { title: string; description?: string; parentId?: string | null }) =>
      api.createSuite(projectId!, payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      setSuiteModal(null);
      toast.success(tx(`Đã tạo Suite "${created.title}"`, `Created Suite "${created.title}"`));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể tạo Suite', 'Failed to create Suite')),
  });

  const renameSuiteMut = useMutation({
    mutationFn: ({
      id,
      title,
      description,
      parentId,
    }: {
      id: string;
      title: string;
      description?: string;
      parentId?: string | null;
    }) => api.updateSuite(projectId!, id, { title, description, parentId }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      setSuiteModal(null);
      toast.success(tx(`Đã cập nhật Suite "${updated.title}"`, `Updated Suite "${updated.title}"`));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể sửa Suite', 'Failed to update Suite')),
  });

  const deleteSuiteMut = useMutation({
    mutationFn: (suiteId: string) => api.deleteSuite(projectId!, suiteId, false),
    onSuccess: (_res, deletedId) => {
      if (selectedSuiteId === deletedId) setSelectedSuiteId(null);
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      toast.success(tx('Đã chuyển Test Suite vào Thùng rác', 'Moved Test Suite to Trash'));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể xóa Suite', 'Failed to delete Suite')),
  });

  const moveSuiteMut = useMutation({
    mutationFn: (payload: SuiteMovePayload) =>
      api.updateSuite(projectId!, payload.suiteId, {
        parentId: payload.parentId,
        orderedSiblingIds: payload.orderedSiblingIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      toast.success(tx('Đã cập nhật cấu trúc Test Suite', 'Updated Test Suite structure'));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể di chuyển Suite', 'Failed to move Suite')),
  });

  const bulkMut = useMutation({
    mutationFn: (payload: Parameters<typeof api.bulkCases>[1]) => api.bulkCases(projectId!, payload),
    onSuccess: (res, vars) => {
      setSelectedCaseIds(new Set());
      setShowBulkMove(false);
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-history', projectId] });
      const label =
        vars.action === 'DELETE'
          ? tx(
              `Đã chuyển ${res.affected} test case vào Thùng rác`,
              `Moved ${res.affected} test cases to Trash`,
            )
          : vars.action === 'CLONE'
            ? tx(`Đã nhân bản ${res.affected} test case`, `Cloned ${res.affected} test cases`)
            : vars.action === 'MOVE'
              ? tx(
                  `Đã chuyển ${res.affected} test case sang Suite mới`,
                  `Moved ${res.affected} test cases to the selected Suite`,
                )
              : tx(`Đã cập nhật ${res.affected} test case`, `Updated ${res.affected} test cases`);
      toast.success(label);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : tx('Thao tác hàng loạt thất bại', 'Bulk action failed'),
      ),
  });

  const createPlanFromSelectedMut = useMutation({
    mutationFn: () =>
      api.createPlan(projectId!, {
        title: quickPlanTitle.trim(),
        description: quickPlanDesc.trim() || undefined,
        caseIds: Array.from(selectedCaseIds),
      }),
    onSuccess: (plan) => {
      setShowQuickPlan(false);
      setSelectedCaseIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['plans', projectId] });
      toast.success(
        tx(
          `Đã tạo Test Plan "${plan.title}" với ${selectedCaseIds.size} case`,
          `Created Test Plan "${plan.title}" with ${selectedCaseIds.size} cases`,
        ),
      );
      navigate(`/projects/${projectId}/plans`);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : tx('Tạo Test Plan thất bại', 'Failed to create Test Plan'),
      ),
  });

  const createRunFromSelectedMut = useMutation({
    mutationFn: () =>
      api.createRun(projectId!, {
        title: quickRunTitle.trim(),
        environment: quickRunEnv.trim() || 'Staging',
        appVersion: quickRunVer.trim() || undefined,
        jiraIssueKey: quickRunJira.trim() || undefined,
        caseIds: Array.from(selectedCaseIds),
      }),
    onSuccess: (run) => {
      setShowQuickRun(false);
      setSelectedCaseIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      toast.success(tx(`Đã khởi tạo Test Run "${run.title}"`, `Started Test Run "${run.title}"`));
      navigate(`/projects/${projectId}/runs/${run.id}`);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : tx('Tạo Test Run thất bại', 'Failed to create Test Run'),
      ),
  });

  const importMut = useMutation({
    mutationFn: (file: File) => api.importFile(projectId!, file),
    onSuccess: (res) => {
      const msg = tx(
        `Đã import thành công ${res.imported} test case (tạo mới ${res.createdSuites} suite, bỏ qua ${res.skipped} dòng trống).`,
        `Successfully imported ${res.imported} test cases (created ${res.createdSuites} suites, skipped ${res.skipped} empty rows).`,
      );
      setImportResult(msg);
      toast.success(
        tx(
          `Đã import ${res.imported} test case thành công!`,
          `Successfully imported ${res.imported} test cases!`,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : tx('Không xác định', 'Unknown error');
      const errText = tx(`Lỗi import: ${msg}`, `Import error: ${msg}`);
      setImportResult(errText);
      toast.error(errText);
    },
  });

  const copyCasesToProjectMut = useMutation({
    mutationFn: (payload: {
      caseIds: string[];
      targetProjectId: string;
      targetSuiteId?: string | null;
    }) => api.copyCasesToProject(projectId!, payload),
    onSuccess: (res) => {
      setCopyModal(null);
      setSelectedCaseIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['cases', res.targetProjectId] });
      queryClient.invalidateQueries({ queryKey: ['suites', res.targetProjectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(
        tx(
          `Đã nhân bản ${res.copiedCount} Test Case sang dự án ${res.targetProjectCode} (${res.targetProjectName})`,
          `Duplicated ${res.copiedCount} Test Cases to project ${res.targetProjectCode} (${res.targetProjectName})`,
        ),
      );
    },
    onError: (err) =>
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Nhân bản Test Case sang dự án thất bại', 'Failed to duplicate Test Cases to project'),
      ),
  });

  const copySuiteToProjectMut = useMutation({
    mutationFn: (payload: {
      suiteId: string;
      targetProjectId: string;
      targetParentSuiteId?: string | null;
      includeSubSuites: boolean;
      includeCases: boolean;
    }) =>
      api.copySuiteToProject(projectId!, payload.suiteId, {
        targetProjectId: payload.targetProjectId,
        targetParentSuiteId: payload.targetParentSuiteId,
        includeSubSuites: payload.includeSubSuites,
        includeCases: payload.includeCases,
      }),
    onSuccess: (res) => {
      setCopyModal(null);
      queryClient.invalidateQueries({ queryKey: ['cases', res.targetProjectId] });
      queryClient.invalidateQueries({ queryKey: ['suites', res.targetProjectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(
        tx(
          `Đã nhân bản ${res.copiedSuitesCount} Suite & ${res.copiedCasesCount} Test Case sang dự án ${res.targetProjectCode} (${res.targetProjectName})`,
          `Duplicated ${res.copiedSuitesCount} Suites & ${res.copiedCasesCount} Test Cases to project ${res.targetProjectCode} (${res.targetProjectName})`,
        ),
      );
    },
    onError: (err) =>
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Nhân bản Test Suite sang dự án thất bại', 'Failed to duplicate Test Suite to project'),
      ),
  });

  const openCopyModal = (
    next: { kind: 'cases'; caseIds: string[]; label: string } | { kind: 'suite'; suite: SuiteDto },
  ) => {
    const defaultTarget =
      writableProjects.find((p) => p.id !== projectId)?.id ?? writableProjects[0]?.id ?? '';
    setCopyTargetProjectId(defaultTarget);
    setCopyTargetSuiteId('');
    setCopyIncludeSubSuites(true);
    setCopyIncludeCases(true);
    setCopyModal(next);
  };

  if (!project) {
    return (
      <div className="p-8 text-sm text-slate-400">
        {tx('Đang tải thông tin dự án...', 'Loading project...')}
      </div>
    );
  }

  const canEdit = canEditCases(project.myRole);
  const canManage = canManageProject(project.myRole);
  const cases = casesData?.items ?? [];
  const allOnPageSelected = cases.length > 0 && cases.every((c) => selectedCaseIds.has(c.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedCaseIds(new Set());
    } else {
      setSelectedCaseIds(new Set(cases.map((c) => c.id)));
    }
  };

  const toggleCase = (id: string) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasActiveFilter = Boolean(
    debouncedSearch || priority || automationStatus || type || statusFilter || jiraKey,
  );

  const selectedSuiteTitle =
    selectedSuiteId === null
      ? tx('Tất cả Test Cases', 'All Test Cases')
      : selectedSuiteId === 'uncategorized'
        ? tx('Chưa phân loại', 'Uncategorized')
        : suiteData?.flat.find((s) => s.id === selectedSuiteId)?.title || 'Test Suite';

  const exportExcelUrl = api.getExportUrl(
    projectId!,
    {
      suiteId: selectedSuiteId || undefined,
      search: debouncedSearch || undefined,
      priority: priority || undefined,
      automationStatus: automationStatus || undefined,
    },
    'xlsx',
  );
  const templateExcelUrl = api.getTemplateUrl(projectId!);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ProjectNav project={project} />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Pane: Suite Tree */}
        <SuiteTree
          tree={suiteData?.tree ?? []}
          totalProjectCases={suiteData?.totalProjectCases ?? 0}
          uncategorizedCases={suiteData?.uncategorizedCases ?? 0}
          selectedSuiteId={selectedSuiteId}
          canEdit={canEdit}
          onSelect={(id) => {
            setSelectedSuiteId(id);
            setPage(1);
          }}
          onCreateSuite={(parentId) => {
            setSuiteTitle('');
            setSuiteDesc('');
            setSuiteParentId(parentId ?? '');
            setSuiteModal({ mode: 'create', parentId });
          }}
          onRenameSuite={(suite) => {
            setSuiteTitle(suite.title);
            setSuiteDesc(suite.description || '');
            setSuiteParentId(suite.parentId ?? '');
            setSuiteModal({ mode: 'rename', suite });
          }}
          onDeleteSuite={async (suite) => {
            const ok = await confirm({
              title: tx(`Xóa Test Suite "${suite.title}"?`, `Delete Test Suite "${suite.title}"?`),
              description: tx(
                'Suite sẽ được chuyển vào Thùng rác. Các Test Case bên trong vẫn được giữ lại và chuyển về mục "Chưa phân loại".',
                'The Suite will be moved to Trash. Test Cases inside will be preserved and moved to "Uncategorized".',
              ),
              confirmText: tx('Chuyển vào Thùng rác', 'Move to Trash'),
              variant: 'danger',
            });
            if (ok) {
              deleteSuiteMut.mutate(suite.id);
            }
          }}
          onMoveSuite={(payload) => moveSuiteMut.mutate(payload)}
          onCopySuite={
            writableProjects.length > 0
              ? (suite) => openCopyModal({ kind: 'suite', suite })
              : undefined
          }
        />

        {/* Center Pane: Test Case Repository Table */}
        <div className="flex-1 flex flex-col min-w-0 bg-canvas">
          {/* Toolbar */}
          <div className="bg-white border-b border-hairline px-5 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="text-base font-bold text-ink tracking-[-0.01em] truncate">
                  {selectedSuiteTitle}
                </h1>
                <span className="text-xs font-mono tabular-nums text-slate-600 bg-canvas border border-hairline px-2 py-0.5 rounded-full">
                  {casesData?.total ?? 0} cases
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowSharedSteps(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Shared Steps
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowTrash(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-hairline hover:bg-canvas rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                    {tx('Thùng rác', 'Trash')}
                    {trashItems.length > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded-full bg-rose-100 text-rose-700 font-mono text-[10px] font-bold">
                        {trashItems.length}
                      </span>
                    )}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setImportResult(null);
                      setShowImport(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-hairline hover:bg-canvas rounded-lg transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    Import Excel
                  </button>
                )}
                <a
                  href={exportExcelUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Excel (.xlsx)
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setDrawerCaseId('new')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-xs shadow-brand-600/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {tx('Tạo Test Case', 'New Test Case')}
                  </button>
                )}
              </div>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={tx(
                    `Tìm theo mã (${project.code}-12), tiêu đề, tag, Jira...`,
                    `Search by code (${project.code}-12), title, tag, Jira...`,
                  )}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-canvas border border-hairline rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-colors"
                />
              </div>

              <div className="flex items-center gap-1.5 text-slate-400">
                <Filter className="w-3.5 h-3.5" />
              </div>

              <Select
                value={priority}
                onChange={(v) => {
                  setPriority(v);
                  setPage(1);
                }}
                size="xs"
                className="py-1.5 min-w-[132px]"
                options={[
                  { value: '', label: tx('Priority: Tất cả', 'Priority: All') },
                  ...PRIORITIES.map((p) => ({
                    value: p,
                    label: PRIORITY_STYLE[p].label,
                    dotClassName: PRIORITY_STYLE[p].dot,
                  })),
                ]}
              />

              <Select
                value={automationStatus}
                onChange={(v) => {
                  setAutomationStatus(v);
                  setPage(1);
                }}
                size="xs"
                className="py-1.5 min-w-[148px]"
                options={[
                  { value: '', label: tx('Automation: Tất cả', 'Automation: All') },
                  ...AUTOMATION_STATUSES.map((a) => ({
                    value: a,
                    label: AUTOMATION_STYLE[a].label,
                  })),
                ]}
              />

              <Select
                value={type}
                onChange={(v) => {
                  setType(v);
                  setPage(1);
                }}
                size="xs"
                className="py-1.5 min-w-[128px]"
                options={[
                  { value: '', label: tx('Type: Tất cả', 'Type: All') },
                  ...TEST_CASE_TYPES.map((t) => ({
                    value: t,
                    label: TYPE_LABEL[t],
                  })),
                ]}
              />

              <Select
                value={statusFilter}
                onChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
                size="xs"
                className="py-1.5 min-w-[138px]"
                options={[
                  { value: '', label: tx('Trạng thái: Tất cả', 'Status: All') },
                  ...TEST_CASE_STATUSES.map((s) => ({
                    value: s,
                    label: STATUS_STYLE[s].label,
                  })),
                ]}
              />

              <input
                value={jiraKey}
                onChange={(e) => {
                  setJiraKey(e.target.value);
                  setPage(1);
                }}
                placeholder={tx('Lọc Jira Key...', 'Filter Jira Key...')}
                className="w-32 px-2.5 py-1.5 text-xs font-mono bg-white border border-hairline rounded-lg focus:outline-none focus:border-brand-600"
              />

              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedSearch('');
                    setPriority('');
                    setAutomationStatus('');
                    setType('');
                    setStatusFilter('');
                    setJiraKey('');
                    setPage(1);
                  }}
                  className="text-xs font-medium text-brand-700 hover:underline px-1.5 cursor-pointer"
                >
                  {tx('Xóa lọc', 'Clear filters')}
                </button>
              )}
            </div>

            {/* Elevated Dark-Ink Bulk Actions Bar (Linear/Figma feel) */}
            {canEdit && selectedCaseIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[#11131A] text-white rounded-xl shadow-md text-xs">
                <span className="font-semibold flex items-center gap-2">
                  <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-md bg-brand-600 text-white font-mono text-[11px]">
                    {selectedCaseIds.size}
                  </span>
                  {tx('test case đang chọn', 'selected test cases')}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkMoveSuiteId('');
                      setShowBulkMove(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <FolderInput className="w-3.5 h-3.5" /> {tx('Chuyển Suite', 'Move to Suite')}
                  </button>

                  <Select
                    value=""
                    placeholder={tx('Đổi Priority...', 'Change Priority...')}
                    size="xs"
                    variant="dark"
                    onChange={(v) => {
                      if (!v) return;
                      bulkMut.mutate({
                        action: 'UPDATE_PRIORITY',
                        caseIds: Array.from(selectedCaseIds),
                        priority: v as Priority,
                      });
                    }}
                    options={PRIORITIES.map((p) => ({
                      value: p,
                      label: PRIORITY_STYLE[p].label,
                      dotClassName: PRIORITY_STYLE[p].dot,
                    }))}
                  />

                  <Select
                    value=""
                    placeholder={tx('Đổi Automation...', 'Change Automation...')}
                    size="xs"
                    variant="dark"
                    onChange={(v) => {
                      if (!v) return;
                      bulkMut.mutate({
                        action: 'UPDATE_AUTOMATION',
                        caseIds: Array.from(selectedCaseIds),
                        automationStatus: v as AutomationStatus,
                      });
                    }}
                    options={AUTOMATION_STATUSES.map((a) => ({
                      value: a,
                      label: AUTOMATION_STYLE[a].label,
                    }))}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      bulkMut.mutate({
                        action: 'CLONE',
                        caseIds: Array.from(selectedCaseIds),
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> {tx('Nhân bản', 'Clone')}
                  </button>

                  {writableProjects.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        openCopyModal({
                          kind: 'cases',
                          caseIds: Array.from(selectedCaseIds),
                          label: tx(
                            `${selectedCaseIds.size} Test Case đang chọn`,
                            `${selectedCaseIds.size} selected Test Cases`,
                          ),
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-600/90 hover:bg-brand-600 text-white rounded-lg transition-colors cursor-pointer font-medium"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />{' '}
                      {tx('Copy sang dự án khác', 'Copy to project')}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setQuickPlanTitle(`Plan ${selectedSuiteTitle} (${selectedCaseIds.size} cases)`);
                      setQuickPlanDesc('');
                      setShowQuickPlan(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />{' '}
                    {tx('Tạo Test Plan', 'Create Test Plan')}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setQuickRunTitle(`Run ${selectedSuiteTitle} (${selectedCaseIds.size} cases)`);
                      setQuickRunEnv('Staging');
                      setQuickRunVer('');
                      setQuickRunJira('');
                      setShowQuickRun(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" /> {tx('Chạy Test Run', 'Run Test Run')}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm({
                        title: tx(
                          `Chuyển ${selectedCaseIds.size} Test Case vào Thùng rác?`,
                          `Move ${selectedCaseIds.size} Test Cases to Trash?`,
                        ),
                        description: tx(
                          'Bạn vẫn có thể mở mục Thùng rác để khôi phục lại toàn bộ các Test Case này khi cần.',
                          'You can still open Trash to restore all of these Test Cases whenever needed.',
                        ),
                        confirmText: tx('Chuyển vào Thùng rác', 'Move to Trash'),
                        variant: 'danger',
                      });
                      if (ok) {
                        bulkMut.mutate({
                          action: 'DELETE',
                          caseIds: Array.from(selectedCaseIds),
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {tx('Xóa', 'Delete')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  {canEdit && (
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="w-24 px-3 py-2.5">{tx('Mã', 'Code')}</th>
                  <th className="px-3 py-2.5">{tx('Tiêu đề Test Case', 'Test Case Title')}</th>
                  <th className="w-28 px-3 py-2.5">Priority</th>
                  <th className="w-28 px-3 py-2.5">Automation</th>
                  <th className="w-28 px-3 py-2.5 hidden xl:table-cell">Type</th>
                  <th className="w-36 px-3 py-2.5 hidden lg:table-cell">Jira Keys</th>
                  <th className="w-20 px-3 py-2.5 text-right">Steps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {casesLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                      {tx('Đang tải danh sách test case...', 'Loading test cases...')}
                    </td>
                  </tr>
                ) : cases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <p className="text-slate-600 font-medium">
                        {tx('Không tìm thấy Test Case nào', 'No Test Cases found')}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {hasActiveFilter
                          ? tx(
                              'Thử thay đổi điều kiện lọc hoặc từ khóa tìm kiếm.',
                              'Try adjusting your filters or search query.',
                            )
                          : tx(
                              'Bấm "Tạo Test Case" hoặc "Import Excel" để bắt đầu.',
                              'Click "New Test Case" or "Import Excel" to get started.',
                            )}
                      </p>
                    </td>
                  </tr>
                ) : (
                  cases.map((tc) => {
                    const isChecked = selectedCaseIds.has(tc.id);
                    const prio = PRIORITY_STYLE[tc.priority];
                    const auto = AUTOMATION_STYLE[tc.automationStatus];
                    return (
                      <tr
                        key={tc.id}
                        onClick={() => setDrawerCaseId(tc.id)}
                        className={`cursor-pointer transition-colors ${
                          drawerCaseId === tc.id
                            ? 'bg-brand-50/75'
                            : isChecked
                              ? 'bg-brand-50/40'
                              : 'hover:bg-canvas/90'
                        }`}
                      >
                        {canEdit && (
                          <td
                            className="px-4 py-3"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCase(tc.id);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="rounded border-slate-300 accent-brand-600 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-3 py-3 font-mono text-xs font-semibold text-brand-700 whitespace-nowrap tabular-nums">
                          <span>{tc.code}</span>
                          <span
                            title={tx(
                              `Phiên bản hiện tại: v${tc.currentVersion || 1} (Active)`,
                              `Current version: v${tc.currentVersion || 1} (Active)`,
                            )}
                            className="ml-1.5 text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-canvas text-slate-500 border border-hairline"
                          >
                            v{tc.currentVersion || 1}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 line-clamp-1">
                              {tc.title}
                            </span>
                            {tc.status !== 'ACTIVE' && (
                              <span
                                className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.2 rounded-full border ${STATUS_STYLE[tc.status as TestCaseStatus]?.className ?? ''}`}
                              >
                                {STATUS_STYLE[tc.status as TestCaseStatus]?.label ?? tc.status}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {tc.suiteTitle && (
                              <span className="text-[11px] text-slate-400">{tc.suiteTitle}</span>
                            )}
                            {tc.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${prio.className}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
                            {prio.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${auto.className}`}
                          >
                            {auto.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 hidden xl:table-cell whitespace-nowrap">
                          {TYPE_LABEL[tc.type as TestCaseType]}
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {tc.jiraIssueKeys.slice(0, 2).map((k) => (
                              <span
                                key={k}
                                className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                              >
                                {k}
                              </span>
                            ))}
                            {tc.jiraIssueKeys.length > 2 && (
                              <span className="text-[10px] text-slate-400">
                                +{tc.jiraIssueKeys.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <ListChecks className="w-3.5 h-3.5 text-slate-400" />
                            {tc.stepCount}
                          </span>
                          {tc.attachmentCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 ml-2 text-slate-400">
                              <Paperclip className="w-3 h-3" />
                              {tc.attachmentCount}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="bg-white border-t border-slate-200 px-5 py-2.5 flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>{tx('Hiển thị', 'Show')}</span>
              <Select
                value={String(pageSize)}
                onChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
                size="xs"
                options={[25, 50, 100, 200].map((n) => ({
                  value: String(n),
                  label: tx(`${n} / trang`, `${n} / page`),
                }))}
              />
              <span className="text-slate-400">
                · {tx('Tổng cộng', 'Total')}{' '}
                <strong className="text-slate-700">{casesData?.total ?? 0}</strong>{' '}
                {tx('test case', 'test cases')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span>
                {tx('Trang', 'Page')} <strong>{casesData?.page ?? 1}</strong> /{' '}
                {casesData?.totalPages ?? 1}
              </span>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= (casesData?.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Slide-Over Drawer */}
      <TestCaseDrawer
        projectId={projectId!}
        caseId={drawerCaseId}
        defaultSuiteId={selectedSuiteId}
        suitesFlat={suiteData?.flat ?? []}
        jiraBaseUrl={project.jiraBaseUrl}
        canEdit={canEdit}
        canManage={canManage}
        onCopyToProject={
          writableProjects.length > 0
            ? (tc) =>
                openCopyModal({
                  kind: 'cases',
                  caseIds: [tc.id],
                  label: `${tc.code} · ${tc.title}`,
                })
            : undefined
        }
        onClose={() => {
          setDrawerCaseId(null);
          if (searchParams.has('caseId')) {
            searchParams.delete('caseId');
            setSearchParams(searchParams, { replace: true });
          }
        }}
        onSaved={() => {}}
      />

      {showSharedSteps && (
        <SharedStepsModal
          projectId={projectId!}
          canEdit={canEdit}
          onClose={() => setShowSharedSteps(false)}
        />
      )}

      {canEdit && showTrash && (
        <TrashModal
          projectId={projectId!}
          canEdit={canEdit}
          canManage={canManage}
          onClose={() => setShowTrash(false)}
        />
      )}

      {/* Quick Create Test Plan from selected cases */}
      {showQuickPlan && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                {tx(
                  `Tạo Test Plan từ ${selectedCaseIds.size} Test Case đã chọn`,
                  `Create Test Plan from ${selectedCaseIds.size} selected Test Cases`,
                )}
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickPlan(false)}
                aria-label={tx('Đóng', 'Close')}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickPlanTitle.trim()) return;
                createPlanFromSelectedMut.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Tên Test Plan *', 'Test Plan Name *')}
                </label>
                <input
                  required
                  autoFocus
                  value={quickPlanTitle}
                  onChange={(e) => setQuickPlanTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Mô tả phạm vi (tùy chọn)', 'Scope description (optional)')}
                </label>
                <textarea
                  rows={2}
                  value={quickPlanDesc}
                  onChange={(e) => setQuickPlanDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickPlan(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createPlanFromSelectedMut.isPending}
                  className="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {createPlanFromSelectedMut.isPending
                    ? tx('Đang tạo...', 'Creating...')
                    : tx('Tạo Test Plan', 'Create Test Plan')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Launch Test Run from selected cases */}
      {showQuickRun && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                {tx(
                  `Chạy Test Run cho ${selectedCaseIds.size} Test Case đã chọn`,
                  `Launch Test Run for ${selectedCaseIds.size} selected Test Cases`,
                )}
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickRun(false)}
                aria-label={tx('Đóng', 'Close')}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickRunTitle.trim()) return;
                createRunFromSelectedMut.mutate();
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Tên Test Run *', 'Test Run Name *')}
                </label>
                <input
                  required
                  autoFocus
                  value={quickRunTitle}
                  onChange={(e) => setQuickRunTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Môi trường', 'Environment')}
                  </label>
                  <input
                    value={quickRunEnv}
                    onChange={(e) => setQuickRunEnv(e.target.value)}
                    placeholder="Staging / UAT / Prod"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Build / Version
                  </label>
                  <input
                    value={quickRunVer}
                    onChange={(e) => setQuickRunVer(e.target.value)}
                    placeholder={tx('VD: v2.5.0', 'e.g. v2.5.0')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Jira Key (tùy chọn)', 'Jira Key (optional)')}
                </label>
                <input
                  value={quickRunJira}
                  onChange={(e) => setQuickRunJira(e.target.value)}
                  placeholder={tx('VD: ECOM-400', 'e.g. ECOM-400')}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowQuickRun(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createRunFromSelectedMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {createRunFromSelectedMut.isPending
                    ? tx('Đang khởi tạo...', 'Starting...')
                    : tx('Bắt đầu Run', 'Start Run')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suite Create/Rename Modal */}
      {suiteModal &&
        (() => {
          const forbiddenIds =
            suiteModal.mode === 'rename' && suiteModal.suite
              ? collectDescendantIds(suiteModal.suite)
              : new Set<string>();
          const parentOptions = [
            {
              value: '',
              label: tx('— Suite gốc (Không thuộc suite nào) —', '— Root Suite (No parent) —'),
            },
            ...(suiteData?.flat ?? [])
              .filter((s) => !forbiddenIds.has(s.id))
              .map((s) => ({
                value: s.id,
                label: s.parentId ? `↳ ${s.title}` : s.title,
              })),
          ];

          return (
            <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    {suiteModal.mode === 'create'
                      ? suiteParentId
                        ? tx('Tạo Sub-Suite mới', 'New Sub-Suite')
                        : tx('Tạo Test Suite mới', 'New Test Suite')
                      : tx('Chỉnh sửa Test Suite', 'Edit Test Suite')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSuiteModal(null)}
                    aria-label={tx('Đóng', 'Close')}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!suiteTitle.trim()) return;
                    if (suiteModal.mode === 'create') {
                      createSuiteMut.mutate({
                        title: suiteTitle,
                        description: suiteDesc,
                        parentId: suiteParentId || null,
                      });
                    } else if (suiteModal.suite) {
                      renameSuiteMut.mutate({
                        id: suiteModal.suite.id,
                        title: suiteTitle,
                        description: suiteDesc,
                        parentId: suiteParentId || null,
                      });
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {tx('Tên Suite *', 'Suite Name *')}
                    </label>
                    <input
                      required
                      autoFocus
                      value={suiteTitle}
                      onChange={(e) => setSuiteTitle(e.target.value)}
                      placeholder={tx(
                        'VD: Authentication, Checkout Flow...',
                        'e.g. Authentication, Checkout Flow...',
                      )}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {tx('Thuộc Suite cha (Parent Suite)', 'Parent Suite')}
                    </label>
                    <Select
                      value={suiteParentId}
                      onChange={setSuiteParentId}
                      size="md"
                      className="w-full"
                      options={parentOptions}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {tx('Mô tả', 'Description')}
                    </label>
                    <textarea
                      rows={2}
                      value={suiteDesc}
                      onChange={(e) => setSuiteDesc(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSuiteModal(null)}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      {tx('Hủy', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg cursor-pointer"
                    >
                      {tx('Lưu Suite', 'Save Suite')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

      {/* Bulk Move Modal */}
      {showBulkMove && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-3">
              {tx(
                `Di chuyển ${selectedCaseIds.size} test case sang Suite khác`,
                `Move ${selectedCaseIds.size} test cases to another Suite`,
              )}
            </h2>
            <div className="mb-4">
              <Select
                value={bulkMoveSuiteId}
                onChange={setBulkMoveSuiteId}
                size="md"
                className="w-full"
                options={[
                  {
                    value: '',
                    label: tx('— Chưa phân loại (No Suite) —', '— Uncategorized (No Suite) —'),
                  },
                  ...(suiteData?.flat ?? []).map((s) => ({
                    value: s.id,
                    label: s.parentId ? `↳ ${s.title}` : s.title,
                  })),
                ]}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkMove(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                {tx('Hủy', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() =>
                  bulkMut.mutate({
                    action: 'MOVE',
                    caseIds: Array.from(selectedCaseIds),
                    suiteId: bulkMoveSuiteId || null,
                  })
                }
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer"
              >
                {tx('Di chuyển', 'Move')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel / CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                {tx(
                  'Import Test Cases (Mẫu Vikki Excel / CSV)',
                  'Import Test Cases (Vikki Excel Template / CSV)',
                )}
              </h2>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                aria-label={tx('Đóng', 'Close')}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                <div className="font-semibold text-slate-800">
                  {tx(
                    'File mẫu chuẩn Vikki: PHIẾU KIỂM THỬ NGHIỆP VỤ',
                    'Vikki Standard Template: BUSINESS TEST SHEET',
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {tx(
                    'Giữ nguyên 100% logo Vikki, màu sắc, bảng Kết quả kiểm thử và sheet DRAW_BUG.',
                    'Preserves 100% of Vikki logo, colors, Test Results table, and DRAW_BUG sheet.',
                  )}
                </div>
              </div>
              <a
                href={templateExcelUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 rounded-lg shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                {tx('Tải file mẫu', 'Download Template')}
              </a>
            </div>

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              {tx('Hệ thống tự động đọc các cột', 'Automatically reads columns')}{' '}
              <code className="bg-slate-100 px-1 rounded">Testcase ID</code>,{' '}
              <code className="bg-slate-100 px-1 rounded">Tên testcase</code>,{' '}
              <code className="bg-slate-100 px-1 rounded">Các bước thực hiện</code>,{' '}
              <code className="bg-slate-100 px-1 rounded">Kết quả mong đợi</code>,{' '}
              <code className="bg-slate-100 px-1 rounded">Dữ liệu test</code>,{' '}
              <code className="bg-slate-100 px-1 rounded">Mức độ ưu tiên</code>,{' '}
              <code className="bg-slate-100 px-1 rounded">Ghi chú</code>{' '}
              {tx(
                'và tự tạo Suite cha/con từ các dòng nhóm tính năng.',
                'and automatically creates parent/sub-suites from feature group rows.',
              )}
            </p>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-6 cursor-pointer bg-slate-50/70 transition-colors">
              <Upload className="w-7 h-7 text-indigo-500 mb-2" />
              <span className="text-sm font-medium text-slate-700">
                {importMut.isPending
                  ? tx('Đang xử lý file...', 'Processing file...')
                  : tx(
                      'Chọn file Excel (.xlsx) hoặc .csv từ máy tính',
                      'Choose an Excel (.xlsx) or .csv file from your computer',
                    )}
              </span>
              <span className="text-xs text-slate-400 mt-1">
                {tx(
                  'Hỗ trợ .xlsx (mẫu FinX có Logo) và .csv · Tối đa 15 MB',
                  'Supports .xlsx (FinX template with Logo) and .csv · Max 15 MB',
                )}
              </span>
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importMut.mutate(file);
                  e.target.value = '';
                }}
              />
            </label>

            {importResult && (
              <div className="mt-3 text-xs p-3 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                {importResult}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                {tx('Đóng', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Project Duplicate Modal (Test Cases or Test Suite) */}
      {copyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!copyTargetProjectId) return;
              if (copyModal.kind === 'cases') {
                copyCasesToProjectMut.mutate({
                  caseIds: copyModal.caseIds,
                  targetProjectId: copyTargetProjectId,
                  targetSuiteId: copyTargetSuiteId || null,
                });
              } else {
                copySuiteToProjectMut.mutate({
                  suiteId: copyModal.suite.id,
                  targetProjectId: copyTargetProjectId,
                  targetParentSuiteId: copyTargetSuiteId || null,
                  includeSubSuites: copyIncludeSubSuites,
                  includeCases: copyIncludeCases,
                });
              }
            }}
            className="bg-white rounded-2xl shadow-xl border border-hairline w-full max-w-lg p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center shrink-0">
                  <ArrowRightLeft className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-ink">
                    {copyModal.kind === 'suite'
                      ? tx('Nhân bản Test Suite sang dự án khác', 'Duplicate Test Suite to Another Project')
                      : tx('Nhân bản Test Case sang dự án khác', 'Duplicate Test Case to Another Project')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[340px]">
                    {tx('Nguồn:', 'Source:')}{' '}
                    <span className="font-semibold text-slate-700">
                      {copyModal.kind === 'suite' ? copyModal.suite.title : copyModal.label}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCopyModal(null)}
                aria-label={tx('Đóng', 'Close')}
                className="p-1 text-slate-400 hover:text-ink rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {writableProjects.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                {tx(
                  'Bạn chưa có quyền chỉnh sửa (QA / QA Lead / Admin) tại bất kỳ dự án đang hoạt động nào.',
                  'You do not have edit permissions (QA / QA Lead / Admin) in any active project.',
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {tx('Dự án đích *', 'Target Project *')}
                    </label>
                    <Select
                      value={copyTargetProjectId}
                      onChange={(val) => {
                        setCopyTargetProjectId(val);
                        setCopyTargetSuiteId('');
                      }}
                      placeholder={tx('Chọn dự án đích...', 'Select target project...')}
                      options={writableProjects.map((p) => ({
                        value: p.id,
                        label: `[${p.code}] ${p.name}${p.id === projectId ? tx(' (Dự án hiện tại)', ' (Current project)') : ''}`,
                      }))}
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      {tx(
                        'Chỉ hiển thị các dự án bạn là thành viên và có quyền thêm/sửa Test Case.',
                        'Only shows active projects where you are a member with edit permissions.',
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {copyModal.kind === 'suite'
                        ? tx('Đặt dưới Suite cha (tùy chọn)', 'Parent Suite in target project (optional)')
                        : tx('Suite đích trong dự án đích', 'Target Suite in target project')}
                    </label>
                    <Select
                      value={copyTargetSuiteId}
                      onChange={setCopyTargetSuiteId}
                      disabled={!copyTargetProjectId || targetSuitesLoading}
                      options={[
                        {
                          value: '',
                          label: targetSuitesLoading
                            ? tx('Đang tải danh sách Suite...', 'Loading suites...')
                            : copyModal.kind === 'suite'
                              ? tx('— Đặt ở cấp gốc (Root Suite) —', '— Place at Root level —')
                              : tx('— Chưa phân loại (Uncategorized) —', '— Uncategorized —'),
                        },
                        ...(targetSuiteData?.flat ?? []).map((s) => ({
                          value: s.id,
                          label: `${s.parentId ? '↳ ' : ''}${s.title}`,
                        })),
                      ]}
                    />
                  </div>

                  {copyModal.kind === 'suite' && (
                    <div className="rounded-xl border border-hairline bg-canvas p-3.5 space-y-2.5">
                      <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={copyIncludeSubSuites}
                          onChange={(e) => setCopyIncludeSubSuites(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                        <span>
                          <strong className="font-semibold text-ink">
                            {tx('Bao gồm tất cả Sub-suite con', 'Include all child sub-suites')}
                          </strong>
                          <span className="block text-[11px] text-slate-500">
                            {tx(
                              'Giữ nguyên cấu trúc cây thư mục phân cấp ở dự án đích.',
                              'Preserve the nested folder tree hierarchy in the target project.',
                            )}
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={copyIncludeCases}
                          onChange={(e) => setCopyIncludeCases(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                        <span>
                          <strong className="font-semibold text-ink">
                            {tx(
                              'Bao gồm toàn bộ Test Case & Steps bên trong',
                              'Include all Test Cases & Steps inside',
                            )}
                          </strong>
                          <span className="block text-[11px] text-slate-500">
                            {tx(
                              'Tự động cấp mã Test Case mới theo dự án đích và chuyển Shared Steps thành các bước độc lập.',
                              'Automatically assigns new Test Case codes in the target project and detaches Shared Steps into standalone steps.',
                            )}
                          </span>
                        </span>
                      </label>
                    </div>
                  )}

                  {copyModal.kind === 'cases' && copyTargetProjectId && copyTargetProjectId !== projectId && (
                    <div className="text-[11px] text-slate-500 bg-canvas border border-hairline rounded-lg px-3 py-2">
                      {tx(
                        'Các Test Case nhân bản sẽ tự động được cấp mã mới theo dự án đích; nếu có dùng Shared Steps, hệ thống sẽ tự bung thành các bước độc lập để tránh lỗi liên kết.',
                        'Duplicated Test Cases will automatically receive new codes in the target project; any Shared Steps will be expanded into standalone steps to avoid broken links.',
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
                  <button
                    type="button"
                    onClick={() => setCopyModal(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-canvas rounded-lg cursor-pointer"
                  >
                    {tx('Hủy', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !copyTargetProjectId ||
                      copyCasesToProjectMut.isPending ||
                      copySuiteToProjectMut.isPending
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg shadow-xs transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copyCasesToProjectMut.isPending || copySuiteToProjectMut.isPending
                      ? tx('Đang nhân bản...', 'Duplicating...')
                      : tx('Nhân bản ngay', 'Duplicate Now')}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
