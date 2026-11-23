import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  FileText,
  History,
  Image,
  Keyboard,
  Link2,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  DEFECT_SEVERITIES,
  EXECUTION_STATUSES,
  PRIORITIES,
  canEditCases,
  type DefectSeverity,
  type ExecutionStatus,
  type Priority,
  type StepExecutionResultDto,
  type TestRunResultDto,
} from '@tcms/shared';
import { api } from '../lib/api';
import {
  DEFECT_SEVERITY_STYLE,
  EXECUTION_STATUS_STYLE,
  PRIORITY_STYLE,
  RUN_STATUS_STYLE,
  formatBytes,
  safeExternalHttpUrl,
} from '../lib/badges';
import { exportRunReport } from '../lib/runReportExport';
import { ProjectNav } from '../components/ProjectNav';
import { Select } from '../components/Select';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const SHORTCUT_MAP: Record<string, ExecutionStatus> = {
  p: 'PASSED',
  f: 'FAILED',
  b: 'BLOCKED',
  n: 'NOT_TEST',
  u: 'NOT_EXECUTED',
};

export function TestRunDetailPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { tx, lang } = useLanguage();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const getRunStatusLabel = (status: keyof typeof RUN_STATUS_STYLE) =>
    status === 'IN_PROGRESS'
      ? tx('Đang chạy', 'In Progress')
      : status === 'COMPLETED'
        ? tx('Hoàn tất', 'Completed')
        : tx('Đã hủy', 'Aborted');
  const getExecShort = (st: ExecutionStatus) =>
    st === 'NOT_EXECUTED' ? tx('Chưa chạy', 'Pending') : EXECUTION_STATUS_STYLE[st].short;

  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [onlyMine, setOnlyMine] = useState(false);

  // Bulk assign mode
  const [assignMode, setAssignMode] = useState(false);
  const [selectedAssignIds, setSelectedAssignIds] = useState<Set<string>>(new Set());
  const [bulkAssigneeId, setBulkAssigneeId] = useState<string>('');

  // Re-run Failed/Blocked modal
  const [showRerunModal, setShowRerunModal] = useState(false);
  const [rerunTitle, setRerunTitle] = useState('');
  const [rerunEnv, setRerunEnv] = useState('');
  const [rerunVersion, setRerunVersion] = useState('');
  const [rerunStatuses, setRerunStatuses] = useState<ExecutionStatus[]>(['FAILED', 'BLOCKED']);

  // Single Run Report export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

  // Active execution editor local draft
  const [actualResult, setActualResult] = useState('');
  const [comment, setComment] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [stepResults, setStepResults] = useState<StepExecutionResultDto[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Create Bug / Push Jira modal
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugTitle, setBugTitle] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugActual, setBugActual] = useState('');
  const [bugExpected, setBugExpected] = useState('');
  const [bugPriority, setBugPriority] = useState<Priority>('HIGH');
  const [bugSeverity, setBugSeverity] = useState<DefectSeverity>('HIGH');
  const [bugJiraKey, setBugJiraKey] = useState('');
  const [bugPushJira, setBugPushJira] = useState(false);
  const [bugEvidenceFiles, setBugEvidenceFiles] = useState<File[]>([]);

  // Sync Jira modal
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncJiraKey, setSyncJiraKey] = useState('');
  const [bannerNotice, setBannerNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Full Run History Drawer
  const [showRunHistory, setShowRunHistory] = useState(false);
  const [runHistorySearch, setRunHistorySearch] = useState('');

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: run, isLoading } = useQuery({
    queryKey: ['run-detail', projectId, runId],
    queryFn: () => api.getRun(projectId!, runId!),
    enabled: Boolean(projectId && runId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => api.listMembers(projectId!),
    enabled: Boolean(projectId),
  });

  const filteredResults = useMemo(() => {
    if (!run) return [];
    return run.results.filter((r) => {
      if (onlyMine && r.assigneeId !== user?.id) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !r.caseCode.toLowerCase().includes(q) &&
          !r.caseSnapshot.title.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [run, search, statusFilter, onlyMine, user?.id]);

  // Select first item automatically
  useEffect(() => {
    if (!run || run.results.length === 0) return;
    if (!selectedResultId || !run.results.some((r) => r.id === selectedResultId)) {
      setSelectedResultId(run.results[0].id);
    }
  }, [run, selectedResultId]);

  const activeResult: TestRunResultDto | undefined = run?.results.find(
    (r) => r.id === selectedResultId,
  );

  const { data: resultHistory = [] } = useQuery({
    queryKey: ['run-result-history', projectId, runId, selectedResultId],
    queryFn: () => api.listResultHistory(projectId!, runId!, selectedResultId!),
    enabled: Boolean(projectId && runId && selectedResultId),
  });

  const { data: runHistory = [], isLoading: runHistoryLoading } = useQuery({
    queryKey: ['run-history', projectId, runId],
    queryFn: () => api.listRunHistory(projectId!, runId!),
    enabled: Boolean(projectId && runId && showRunHistory),
  });

  // Hydrate editor fields when switching active case
  useEffect(() => {
    if (!activeResult) return;
    setActualResult(activeResult.actualResult || '');
    setComment(activeResult.comment || '');
    setPlannedDate(activeResult.plannedDate || run?.plannedDate || '');
    setAssigneeId(activeResult.assigneeId || '');
    const stepsLen = activeResult.caseSnapshot.steps?.length ?? 0;
    const map = new Map(activeResult.stepResults.map((s) => [s.stepOrder, s]));
    const hydrated: StepExecutionResultDto[] = [];
    for (let i = 0; i < stepsLen; i++) {
      hydrated.push(map.get(i) ?? { stepOrder: i, status: 'UNSET' });
    }
    setStepResults(hydrated);
  }, [activeResult?.id, activeResult?.status, activeResult?.actualResult]);

  const canEdit = canEditCases(project?.myRole);

  const updateResultMut = useMutation({
    mutationFn: (payload: Parameters<typeof api.updateRunResult>[3]) =>
      api.updateRunResult(projectId!, runId!, activeResult!.id, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['run-detail', projectId, runId] });
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['run-result-history', projectId, runId, activeResult?.id],
      });
      queryClient.invalidateQueries({ queryKey: ['run-history', projectId, runId] });
      setSavedNotice(tx('Đã lưu kết quả', 'Result saved'));
      setTimeout(() => setSavedNotice(null), 1800);
      toast.success(
        tx(
          `Đã lưu ${updated.caseCode}: ${EXECUTION_STATUS_STYLE[updated.status]?.label || updated.status}`,
          `Saved ${updated.caseCode}: ${EXECUTION_STATUS_STYLE[updated.status]?.label || updated.status}`,
        ),
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể lưu kết quả', 'Failed to save result')),
  });

  const updateRunMut = useMutation({
    mutationFn: (payload: Parameters<typeof api.updateRun>[2]) =>
      api.updateRun(projectId!, runId!, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['run-detail', projectId, runId] });
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      toast.success(
        updated.status === 'COMPLETED'
          ? tx('Đã đánh dấu hoàn tất Test Run!', 'Marked Test Run as completed!')
          : tx('Đã cập nhật trạng thái Test Run', 'Updated Test Run status'),
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể cập nhật Test Run', 'Failed to update Test Run')),
  });

  const uploadEvidenceMut = useMutation({
    mutationFn: (file: File) => api.uploadRunEvidence(projectId!, runId!, activeResult!.id, file),
    onSuccess: (ev) => {
      queryClient.invalidateQueries({ queryKey: ['run-detail', projectId, runId] });
      queryClient.invalidateQueries({
        queryKey: ['run-result-history', projectId, runId, activeResult?.id],
      });
      queryClient.invalidateQueries({ queryKey: ['run-history', projectId, runId] });
      setSavedNotice(tx('Đã đính kèm ảnh bằng chứng', 'Evidence attached'));
      setTimeout(() => setSavedNotice(null), 2000);
      toast.success(tx(`Đã đính kèm bằng chứng "${ev.fileName}"`, `Attached evidence "${ev.fileName}"`));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể tải bằng chứng', 'Failed to upload evidence')),
  });

  const deleteEvidenceMut = useMutation({
    mutationFn: (evidenceId: string) =>
      api.deleteRunEvidence(projectId!, runId!, activeResult!.id, evidenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['run-detail', projectId, runId] });
      toast.success(tx('Đã xóa tệp bằng chứng', 'Deleted evidence file'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể xóa bằng chứng', 'Failed to delete evidence')),
  });

  const createBugMut = useMutation({
    mutationFn: async () => {
      const res = await api.createResultDefect(projectId!, runId!, activeResult!.id, {
        title: bugTitle,
        description: bugDesc,
        stepsToReproduce: bugSteps,
        actualResult: bugActual,
        expectedResult: bugExpected,
        priority: bugPriority,
        severity: bugSeverity,
        jiraIssueKey: bugJiraKey || null,
        pushToJira: bugPushJira,
      });
      for (const file of bugEvidenceFiles) {
        try {
          await api.uploadDefectEvidence(projectId!, res.defect.id, file);
        } catch {
          // continue uploading remaining evidence files
        }
      }
      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['run-detail', projectId, runId] });
      queryClient.invalidateQueries({ queryKey: ['defects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['run-result-history', projectId, runId, activeResult?.id],
      });
      queryClient.invalidateQueries({ queryKey: ['run-history', projectId, runId] });
      setShowBugModal(false);
      setBugEvidenceFiles([]);
      if (res.jiraResult) {
        setBannerNotice({ ok: res.jiraResult.ok, text: res.jiraResult.message });
        if (res.jiraResult.ok) toast.success(res.jiraResult.message);
        else toast.error(res.jiraResult.message);
      } else {
        const msg = tx(
          `Đã tạo Defect cho ${activeResult?.caseCode} thành công!`,
          `Created Defect for ${activeResult?.caseCode} successfully!`,
        );
        setBannerNotice({ ok: true, text: msg });
        toast.success(msg);
      }
      setTimeout(() => setBannerNotice(null), 6000);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể tạo Defect', 'Failed to create Defect')),
  });

  const bulkAssignMut = useMutation({
    mutationFn: () =>
      api.bulkAssignRunResults(projectId!, runId!, {
        resultIds: Array.from(selectedAssignIds),
        assigneeId: bulkAssigneeId || null,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['run-detail', projectId, runId] });
      queryClient.invalidateQueries({ queryKey: ['run-history', projectId, runId] });
      setSelectedAssignIds(new Set());
      setAssignMode(false);
      toast.success(tx(`Đã phân công ${res.updated} test case`, `Assigned ${res.updated} test cases`));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Phân công hàng loạt thất bại', 'Bulk assignment failed')),
  });

  const rerunMut = useMutation({
    mutationFn: () =>
      api.rerunFromRun(projectId!, runId!, {
        statuses: rerunStatuses,
        title: rerunTitle.trim() || undefined,
        environment: rerunEnv.trim() || undefined,
        appVersion: rerunVersion.trim() || undefined,
      }),
    onSuccess: (created) => {
      setShowRerunModal(false);
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      toast.success(tx(`Đã tạo Test Run chạy lại "${created.title}"`, `Created re-run "${created.title}"`));
      navigate(`/projects/${projectId}/runs/${created.id}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể tạo Run chạy lại', 'Failed to create re-run')),
  });

  const syncJiraMut = useMutation({
    mutationFn: () => api.syncRunToJira(projectId!, runId!, syncJiraKey || undefined),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['run-detail', projectId, runId] });
      queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
      setShowSyncModal(false);
      setBannerNotice({ ok: res.ok, text: res.message });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      setTimeout(() => setBannerNotice(null), 6500);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể đồng bộ Jira', 'Failed to sync with Jira')),
  });

  // Keyboard shortcuts (P/F/B/N/U, ArrowUp/ArrowDown) when not typing in an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showBugModal || showSyncModal) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (filteredResults.length === 0) return;
        e.preventDefault();
        const curIdx = filteredResults.findIndex((r) => r.id === selectedResultId);
        const nextIdx =
          e.key === 'ArrowDown'
            ? Math.min(filteredResults.length - 1, curIdx + 1)
            : Math.max(0, curIdx - 1);
        setSelectedResultId(filteredResults[nextIdx].id);
        return;
      }

      if (canEdit && activeResult) {
        const mapped = SHORTCUT_MAP[e.key.toLowerCase()];
        if (mapped) {
          e.preventDefault();
          updateResultMut.mutate({
            status: mapped,
            actualResult,
            comment,
            stepResults,
            plannedDate: plannedDate || null,
            assigneeId: assigneeId || null,
          });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canEdit,
    activeResult,
    filteredResults,
    selectedResultId,
    actualResult,
    comment,
    stepResults,
    plannedDate,
    assigneeId,
    showBugModal,
    showSyncModal,
  ]);

  // Ctrl+V screenshot paste support (never intercepts typing/pasting text inside form fields)
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!canEdit || !activeResult || showBugModal) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const named = new File(
            [file],
            `${activeResult.caseCode}-evidence-${Date.now()}.png`,
            { type: file.type },
          );
          uploadEvidenceMut.mutate(named);
        }
        break;
      }
    }
  };

  const handleBugEvidencePaste = (e: React.ClipboardEvent) => {
    if (!activeResult) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          const named = new File(
            [file],
            `${activeResult.caseCode}-evidence-${Date.now()}.png`,
            { type: file.type },
          );
          setBugEvidenceFiles((prev) => [...prev, named]);
          toast.success(tx(`Đã dán ảnh bằng chứng "${named.name}"`, `Pasted evidence image "${named.name}"`));
        }
        break;
      }
    }
  };

  if (!project || isLoading || !run) {
    return (
      <div className="p-8 text-sm text-slate-400">
        {tx('Đang tải màn hình thực thi Test Run...', 'Loading Test Run execution workspace...')}
      </div>
    );
  }

  const s = run.stats;
  const pctPass = s.total > 0 ? (s.passed / s.total) * 100 : 0;
  const pctFail = s.total > 0 ? (s.failed / s.total) * 100 : 0;
  const pctBlock = s.total > 0 ? (s.blocked / s.total) * 100 : 0;
  const pctNotTest = s.total > 0 ? (s.notTest / s.total) * 100 : 0;

  const openBugModalForActive = () => {
    if (!activeResult) return;
    const snap = activeResult.caseSnapshot;
    const stepsText = (snap.steps || [])
      .map((st, idx) => `${idx + 1}. ${st.action}${st.data ? ` [Data: ${st.data}]` : ''}`)
      .join('\n');
    const expectedText = (snap.steps || [])
      .map((st, idx) => `${idx + 1}. ${st.expectedResult}`)
      .join('\n');
    setBugTitle(`[${activeResult.caseCode}] ${snap.title}`);
    setBugDesc(comment || activeResult.comment || '');
    setBugSteps(stepsText);
    setBugExpected(expectedText);
    setBugActual(actualResult || activeResult.actualResult || '');
    setBugPriority(snap.priority || 'MEDIUM');
    setBugSeverity(
      snap.priority === 'CRITICAL'
        ? 'HIGHEST'
        : snap.priority === 'HIGH'
          ? 'HIGH'
          : 'MEDIUM',
    );
    setBugJiraKey('');
    setBugPushJira(Boolean(run.jiraEnabled));
    setBugEvidenceFiles([]);
    setShowBugModal(true);
  };

  const handleQuickStatus = (newStatus: ExecutionStatus) => {
    if (!canEdit || !activeResult) return;
    updateResultMut.mutate({
      status: newStatus,
      actualResult,
      comment,
      stepResults,
      plannedDate: plannedDate || null,
      assigneeId: assigneeId || null,
    });
  };

  const toggleStepStatus = (stepOrder: number, st: 'PASSED' | 'FAILED' | 'BLOCKED') => {
    if (!canEdit) return;
    setStepResults((prev) =>
      prev.map((item) =>
        item.stepOrder === stepOrder
          ? { ...item, status: item.status === st ? 'UNSET' : st }
          : item,
      ),
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" onPaste={handlePaste}>
      <ProjectNav project={project} />

      {/* Top Execution Run Bar */}
      <div className="bg-white border-b border-hairline px-5 py-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <Link
              to={`/projects/${projectId}/runs`}
              className="p-1.5 rounded-lg text-slate-500 hover:text-ink hover:bg-canvas transition-colors"
              title={tx('Quay lại danh sách Test Runs', 'Back to Test Runs')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-base font-bold text-ink truncate">{run.title}</h1>
            {run.source === 'CI_CD' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                CI/CD
              </span>
            )}
            {run.parentRunId && (
              <Link
                to={`/projects/${projectId}/runs/${run.parentRunId}`}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F5EBFA] text-[#851FB6] border border-[#E9D5FF] hover:bg-[#EEDCF8]"
                title={tx('Xem Test Run gốc', 'View parent Test Run')}
              >
                Re-run
              </Link>
            )}
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                RUN_STATUS_STYLE[run.status].className
              }`}
            >
              {getRunStatusLabel(run.status)}
            </span>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-canvas border border-hairline text-slate-600">
              {run.environment} · v{run.appVersion}
            </span>
            {run.jiraIssueKey && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                <Link2 className="w-3 h-3" />
                {run.jiraIssueKey}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRunHistory(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-hairline hover:bg-canvas rounded-lg transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-brand-600" />
              {tx('Lịch sử đợt chạy', 'Run History')}
            </button>
            <div className={showExportMenu ? 'relative z-30' : 'relative'}>
              <button
                type="button"
                disabled={exportingReport}
                onClick={() => setShowExportMenu((prev) => !prev)}
                className="relative z-30 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-hairline hover:bg-canvas rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5 text-[#851FB6]" />
                {exportingReport ? tx('Đang xuất...', 'Exporting...') : tx('Tải báo cáo Run', 'Export Run Report')}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {showExportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute right-0 mt-1 z-30 w-44 rounded-xl border border-hairline bg-white shadow-lg p-1 text-xs">
                  <button
                    type="button"
                    onClick={async () => {
                      setShowExportMenu(false);
                      setExportingReport(true);
                      try {
                        await exportRunReport('pdf', project, run, user?.fullName);
                        toast.success(tx('Đã xuất báo cáo Run PDF', 'Exported Run PDF report'));
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : tx('Xuất PDF thất bại', 'PDF export failed'));
                      } finally {
                        setExportingReport(false);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-canvas text-left text-slate-700 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-600" />
                    {tx('Xuất PDF (.pdf)', 'Export PDF (.pdf)')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowExportMenu(false);
                      setExportingReport(true);
                      try {
                        await exportRunReport('html', project, run, user?.fullName);
                        toast.success(tx('Đã xuất báo cáo Run HTML', 'Exported Run HTML report'));
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : tx('Xuất HTML thất bại', 'HTML export failed'));
                      } finally {
                        setExportingReport(false);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-canvas text-left text-slate-700 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#851FB6]" />
                    {tx('Xuất HTML (.html)', 'Export HTML (.html)')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowExportMenu(false);
                      setExportingReport(true);
                      try {
                        await exportRunReport('image', project, run, user?.fullName);
                        toast.success(tx('Đã xuất ảnh báo cáo Run (.png)', 'Exported Run PNG image'));
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : tx('Xuất PNG thất bại', 'PNG export failed'));
                      } finally {
                        setExportingReport(false);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-canvas text-left text-slate-700 cursor-pointer"
                  >
                    <Image className="w-3.5 h-3.5 text-sky-600" />
                    {tx('Xuất ảnh PNG (.png)', 'Export PNG (.png)')}
                  </button>
                  </div>
                </>
              )}
            </div>
            <a
              href={api.getRunExportUrl(projectId!, run.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {tx('Xuất Excel Vikki (12 cột)', 'Export Vikki Excel (12 cols)')}
            </a>
            {canEdit && (s.failed + s.blocked + s.notTest + s.notExecuted > 0) && (
              <button
                type="button"
                onClick={() => {
                  const defaultStatuses: ExecutionStatus[] = [];
                  if (s.failed > 0) defaultStatuses.push('FAILED');
                  if (s.blocked > 0) defaultStatuses.push('BLOCKED');
                  if (defaultStatuses.length === 0) {
                    defaultStatuses.push('FAILED', 'BLOCKED');
                  }
                  setRerunStatuses(defaultStatuses);
                  setRerunTitle(`[Re-run] ${run.title}`);
                  setRerunEnv(run.environment);
                  setRerunVersion(run.appVersion);
                  setShowRerunModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {tx(`Chạy lại Lỗi/Blocked (${s.failed + s.blocked})`, `Re-run Failed/Blocked (${s.failed + s.blocked})`)}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setSyncJiraKey(run.jiraIssueKey || '');
                  setShowSyncModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {tx('Đẩy tiến độ Jira', 'Sync to Jira')}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  updateRunMut.mutate({
                    status: run.status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED',
                  })
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  run.status === 'COMPLETED'
                    ? 'bg-canvas text-slate-700 border border-hairline hover:bg-slate-200/60'
                    : 'bg-brand-600 hover:bg-brand-700 text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {run.status === 'COMPLETED' ? tx('Mở lại Run', 'Reopen Run') : tx('Hoàn tất Run', 'Complete Run')}
              </button>
            )}
          </div>
        </div>

        {/* Live Multi-Color Progress Strip */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden flex">
            {pctPass > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${pctPass}%` }} />}
            {pctFail > 0 && <div className="bg-rose-500 h-full" style={{ width: `${pctFail}%` }} />}
            {pctBlock > 0 && <div className="bg-amber-400 h-full" style={{ width: `${pctBlock}%` }} />}
            {pctNotTest > 0 && <div className="bg-slate-400 h-full" style={{ width: `${pctNotTest}%` }} />}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums shrink-0">
            <span className="font-semibold text-brand-700">Pass Rate: {s.passRate}%</span>
            <span className="text-emerald-700">Pass: <strong>{s.passed}</strong></span>
            <span className="text-rose-700">Fail: <strong>{s.failed}</strong></span>
            <span className="text-amber-700">Block: <strong>{s.blocked}</strong></span>
            <span className="text-slate-500">
              {tx('Còn lại:', 'Remaining:')} <strong>{s.notExecuted}</strong>/{s.total}
            </span>
          </div>
        </div>

        {bannerNotice && (
          <div
            className={`text-xs font-medium px-3.5 py-2 rounded-xl border ${
              bannerNotice.ok
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {bannerNotice.text}
          </div>
        )}
      </div>

      {/* Main 2-Pane Execution Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Queue */}
        <aside className="w-80 lg:w-96 shrink-0 bg-white border-r border-hairline flex flex-col min-h-0">
          <div className="p-3 border-b border-hairline space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tx('Tìm mã hoặc tên case...', 'Search by case code or title...')}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-canvas border border-hairline rounded-lg focus:bg-white focus:outline-none focus:border-brand-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter('')}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-md cursor-pointer ${
                  statusFilter === '' && !onlyMine
                    ? 'bg-ink text-white'
                    : 'bg-canvas text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {tx(`Tất cả (${run.results.length})`, `All (${run.results.length})`)}
              </button>
              <button
                type="button"
                onClick={() => setOnlyMine((prev) => !prev)}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md cursor-pointer ${
                  onlyMine
                    ? 'bg-[#851FB6] text-white'
                    : 'bg-[#FAF7FC] text-[#851FB6] border border-[#E9D5FF] hover:bg-[#F5EBFA]'
                }`}
                title={tx('Chỉ hiển thị các test case được giao cho tôi', 'Show only test cases assigned to me')}
              >
                <UserCheck className="w-3 h-3" />
                {tx(
                  `Của tôi (${run.results.filter((r) => r.assigneeId === user?.id).length})`,
                  `Mine (${run.results.filter((r) => r.assigneeId === user?.id).length})`,
                )}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setAssignMode((prev) => !prev);
                    setSelectedAssignIds(new Set());
                  }}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md cursor-pointer ${
                    assignMode
                      ? 'bg-ink text-white'
                      : 'bg-canvas text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  {tx('Gán việc', 'Assign')}
                </button>
              )}
              {EXECUTION_STATUSES.map((st) => {
                const cnt = run.results.filter((r) => r.status === st).length;
                if (cnt === 0 && statusFilter !== st) return null;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === st ? '' : st)}
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-md cursor-pointer ${
                      statusFilter === st
                        ? 'bg-brand-600 text-white'
                        : 'bg-canvas text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    {getExecShort(st)} ({cnt})
                  </button>
                );
              })}
            </div>

            {assignMode && canEdit && (
              <div className="rounded-xl bg-[#11131A] p-2.5 text-white space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold">
                    {tx(`Đã chọn ${selectedAssignIds.size} case để gán`, `Selected ${selectedAssignIds.size} cases to assign`)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedAssignIds.size === filteredResults.length) {
                        setSelectedAssignIds(new Set());
                      } else {
                        setSelectedAssignIds(new Set(filteredResults.map((r) => r.id)));
                      }
                    }}
                    className="text-[#E9D5FF] hover:underline cursor-pointer"
                  >
                    {selectedAssignIds.size === filteredResults.length
                      ? tx('Bỏ chọn hết', 'Deselect all')
                      : tx('Chọn hết danh sách', 'Select all listed')}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={bulkAssigneeId}
                      onChange={setBulkAssigneeId}
                      size="xs"
                      variant="dark"
                      className="w-full"
                      options={[
                        { value: '', label: tx('— Bỏ phân công —', '— Unassign —') },
                        ...members.map((m) => ({
                          value: m.userId,
                          label: m.fullName,
                        })),
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={selectedAssignIds.size === 0 || bulkAssignMut.isPending}
                    onClick={() => bulkAssignMut.mutate()}
                    className="px-2.5 py-1 rounded-lg bg-[#851FB6] hover:bg-[#70169C] disabled:opacity-50 text-[11px] font-semibold text-white cursor-pointer shrink-0"
                  >
                    {bulkAssignMut.isPending ? tx('Đang gán...', 'Assigning...') : tx('Áp dụng', 'Apply')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-hairline/70">
            {filteredResults.map((res) => {
              const active = res.id === selectedResultId;
              const st = EXECUTION_STATUS_STYLE[res.status];
              const isChecked = selectedAssignIds.has(res.id);
              return (
                <div
                  key={res.id}
                  onClick={() => setSelectedResultId(res.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedResultId(res.id);
                    }
                  }}
                  className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer border-l-2 ${
                    active
                      ? 'bg-brand-50/70 border-brand-600'
                      : 'hover:bg-canvas border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {assignMode && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => {
                            setSelectedAssignIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(res.id)) next.delete(res.id);
                              else next.add(res.id);
                              return next;
                            });
                          }}
                          className="rounded border-slate-300 accent-[#851FB6] cursor-pointer shrink-0"
                        />
                      )}
                      <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                      <span className="font-mono text-xs font-semibold text-brand-700 shrink-0">
                        {res.caseCode}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        v{res.caseVersion}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full border shrink-0 ${st.className}`}
                    >
                      {getExecShort(res.status)}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-ink mt-1 line-clamp-2 leading-snug">
                    {res.caseSnapshot.title}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-slate-400">
                    <span className="truncate">
                      {res.caseSnapshot.suiteTitle || tx('Chưa phân loại', 'Uncategorized')}
                      {res.assigneeName ? ` · 👤 ${res.assigneeName}` : ''}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {res.jiraBugKeys.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-rose-600 font-mono text-[10px]">
                          <Bug className="w-3 h-3" />
                          {res.jiraBugKeys.length}
                        </span>
                      )}
                      {res.evidence.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-slate-500 text-[10px]">
                          <Paperclip className="w-3 h-3" />
                          {res.evidence.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {canEdit && (
            <div className="px-3.5 py-2 border-t border-hairline bg-canvas text-[11px] text-slate-500 flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span>
                {tx('Phím tắt:', 'Shortcuts:')} <strong>P</strong> Pass · <strong>F</strong> Fail ·{' '}
                <strong>B</strong> Block · <strong>↑/↓</strong> {tx('chuyển', 'navigate')}
              </span>
            </div>
          )}
        </aside>

        {/* Right Active Case Execution Pane */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-canvas">
          {!activeResult ? (
            <div className="p-12 text-center text-sm text-slate-400">
              {tx(
                'Chọn một Test Case bên trái để thực thi kiểm thử.',
                'Select a Test Case on the left to execute.',
              )}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-5">
              {/* Header Card */}
              <div className="bg-white rounded-2xl border border-hairline p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                        {activeResult.caseCode}
                      </span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-canvas border border-hairline text-slate-600">
                        Snapshot v{activeResult.caseVersion}
                      </span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          PRIORITY_STYLE[activeResult.caseSnapshot.priority].className
                        }`}
                      >
                        {PRIORITY_STYLE[activeResult.caseSnapshot.priority].label}
                      </span>
                      {activeResult.caseSnapshot.jiraIssueKeys.map((k) => (
                        <span
                          key={k}
                          className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                    <h2 className="text-lg font-bold text-ink leading-snug pt-0.5">
                      {activeResult.caseSnapshot.title}
                    </h2>
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={openBugModalForActive}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                      <Bug className="w-3.5 h-3.5" />
                      {tx('Tạo Bug / Đẩy Jira', 'Create Bug / Push Jira')}
                    </button>
                  )}
                </div>

                {/* 1-Click Status Buttons */}
                <div className="pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {EXECUTION_STATUSES.map((st) => {
                      const info = EXECUTION_STATUS_STYLE[st];
                      const isCurrent = activeResult.status === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={!canEdit || updateResultMut.isPending}
                          onClick={() => handleQuickStatus(st)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer disabled:opacity-60 ${
                            isCurrent
                              ? info.activeBtn
                              : 'bg-white text-slate-700 border-hairline hover:bg-canvas'
                          }`}
                        >
                          {info.label}
                        </button>
                      );
                    })}
                  </div>
                  {savedNotice && (
                    <span className="text-xs font-medium text-emerald-700">{savedNotice}</span>
                  )}
                </div>

                {/* Linked Jira Bugs */}
                {activeResult.jiraBugKeys.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
                    <span className="text-slate-500 font-medium">{tx('Bugs liên kết:', 'Linked Bugs:')}</span>
                    {activeResult.jiraBugKeys.map((bk) => {
                      const href = run.jiraBaseUrl
                        ? safeExternalHttpUrl(`${run.jiraBaseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(bk)}`)
                        : null;
                      return (
                        <span
                          key={bk}
                          className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200"
                        >
                          <Bug className="w-3 h-3" />
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              {bk}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            bk
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {activeResult.caseSnapshot.preconditions && (
                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/70 text-xs text-amber-950">
                    <span className="font-semibold block mb-0.5">
                      {tx('Điều kiện tiên quyết:', 'Preconditions:')}
                    </span>
                    <span className="whitespace-pre-wrap">
                      {activeResult.caseSnapshot.preconditions}
                    </span>
                  </div>
                )}
              </div>

              {/* Steps Checklist */}
              <div className="bg-white rounded-2xl border border-hairline p-5 space-y-3">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  {tx(
                    `Các bước thực hiện (${activeResult.caseSnapshot.steps?.length ?? 0})`,
                    `Test Steps (${activeResult.caseSnapshot.steps?.length ?? 0})`,
                  )}
                </h3>
                {activeResult.caseSnapshot.steps?.length ? (
                  <div className="space-y-2.5">
                    {activeResult.caseSnapshot.steps.map((step, idx) => {
                      const stepState = stepResults.find((x) => x.stepOrder === idx)?.status || 'UNSET';
                      return (
                        <div
                          key={idx}
                          className={`rounded-xl border p-3.5 text-xs space-y-2 transition-colors ${
                            stepState === 'PASSED'
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : stepState === 'FAILED'
                                ? 'bg-rose-50/40 border-rose-200'
                                : stepState === 'BLOCKED'
                                  ? 'bg-amber-50/40 border-amber-200'
                                  : 'bg-canvas/70 border-hairline'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-brand-700">
                              {tx(`Bước ${idx + 1}`, `Step ${idx + 1}`)}
                            </span>
                            {canEdit && (
                              <div className="flex items-center gap-1">
                                {(['PASSED', 'FAILED', 'BLOCKED'] as const).map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => toggleStepStatus(idx, st)}
                                    className={`px-2 py-0.5 text-[11px] font-medium rounded-md border cursor-pointer ${
                                      stepState === st
                                        ? st === 'PASSED'
                                          ? 'bg-emerald-600 text-white border-emerald-600'
                                          : st === 'FAILED'
                                            ? 'bg-rose-600 text-white border-rose-600'
                                            : 'bg-amber-500 text-white border-amber-500'
                                        : 'bg-white text-slate-600 border-hairline hover:bg-canvas'
                                    }`}
                                  >
                                    {st === 'PASSED' ? 'Pass' : st === 'FAILED' ? 'Fail' : 'Block'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                            <div>
                              <span className="text-[11px] font-semibold text-slate-400 block">
                                Action
                              </span>
                              <p className="text-ink whitespace-pre-wrap mt-0.5">
                                {step.action || '—'}
                              </p>
                            </div>
                            <div>
                              <span className="text-[11px] font-semibold text-slate-400 block">
                                {tx('Dữ liệu test', 'Test Data')}
                              </span>
                              <p className="text-slate-700 whitespace-pre-wrap mt-0.5">
                                {step.data || '—'}
                              </p>
                            </div>
                            <div>
                              <span className="text-[11px] font-semibold text-slate-400 block">
                                {tx('Kết quả mong đợi', 'Expected Result')}
                              </span>
                              <p className="text-ink whitespace-pre-wrap mt-0.5">
                                {step.expectedResult || '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {tx('Test Case này chưa có bước chi tiết.', 'This Test Case has no detailed steps yet.')}
                  </p>
                )}
              </div>

              {/* Actual Result, Comment, Assignee & Evidence */}
              <div className="bg-white rounded-2xl border border-hairline p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    {tx('Ghi nhận Kết quả thực tế & Bằng chứng', 'Actual Result & Evidence')}
                  </h3>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={updateResultMut.isPending}
                      onClick={() =>
                        updateResultMut.mutate({
                          actualResult,
                          comment,
                          stepResults,
                          plannedDate: plannedDate || null,
                          assigneeId: assigneeId || null,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {tx('Lưu chi tiết', 'Save Details')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {tx('Người phụ trách (Assignee)', 'Assignee')}
                    </label>
                    <Select
                      disabled={!canEdit}
                      value={assigneeId}
                      onChange={setAssigneeId}
                      size="xs"
                      className="w-full py-1.5"
                      options={[
                        { value: '', label: tx('— Chưa phân công —', '— Unassigned —') },
                        ...members.map((m) => ({
                          value: m.userId,
                          label: m.fullName,
                        })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {tx('Kế hoạch thực hiện (dd-mm-yyyy)', 'Planned Execution Date (dd-mm-yyyy)')}
                    </label>
                    <input
                      disabled={!canEdit}
                      value={plannedDate}
                      onChange={(e) => setPlannedDate(e.target.value)}
                      placeholder={tx('VD: 20-11-2026', 'e.g., 20-11-2026')}
                      className="w-full px-3 py-1.5 text-xs font-mono border border-hairline rounded-lg disabled:bg-canvas"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {tx(
                      'Kết quả thực tế (Actual Result — sẽ tự map vào cột E file Excel Vikki)',
                      'Actual Result (auto-mapped to column E in Vikki Excel export)',
                    )}
                  </label>
                  <textarea
                    rows={3}
                    disabled={!canEdit}
                    value={actualResult}
                    onChange={(e) => setActualResult(e.target.value)}
                    placeholder={tx(
                      'Ghi nhận kết quả thực tế hệ thống trả về...',
                      'Record the actual result returned by the system...',
                    )}
                    className="w-full px-3 py-2 text-xs border border-hairline rounded-xl focus:outline-none focus:border-brand-600 disabled:bg-canvas"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {tx('Ghi chú (Notes)', 'Notes')}
                  </label>
                  <textarea
                    rows={2}
                    disabled={!canEdit}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={tx('Ghi chú thêm cho Dev / PM...', 'Additional notes for Dev / PM...')}
                    className="w-full px-3 py-2 text-xs border border-hairline rounded-xl focus:outline-none focus:border-brand-600 disabled:bg-canvas"
                  />
                </div>

                {/* Evidence Upload & Ctrl+V Paste */}
                <div className="pt-3 border-t border-hairline">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5" />
                      {tx(
                        `Bằng chứng kiểm thử (${activeResult.evidence.length}) — hỗ trợ dán ảnh`,
                        `Test Evidence (${activeResult.evidence.length}) — supports pasting images`,
                      )}{' '}
                      <kbd className="px-1.5 py-0.5 text-[10px] bg-canvas border border-hairline rounded">
                        Ctrl+V
                      </kbd>
                    </span>
                    {canEdit && (
                      <label className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:bg-brand-50 px-2.5 py-1 rounded-lg cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadEvidenceMut.isPending ? tx('Đang tải...', 'Uploading...') : tx('Tải ảnh / log', 'Upload image / log')}
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadEvidenceMut.mutate(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>

                  {activeResult.evidence.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      {tx(
                        'Chưa có ảnh chụp màn hình hoặc tệp log đính kèm.',
                        'No screenshots or log files attached yet.',
                      )}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeResult.evidence.map((ev) => {
                        const url = api.getAttachmentUrl(ev.url);
                        const isImg = ev.mimeType.startsWith('image/');
                        return (
                          <div
                            key={ev.id}
                            className="flex items-center gap-2.5 p-2 rounded-xl border border-hairline bg-canvas/60"
                          >
                            {isImg ? (
                              <img
                                src={url}
                                alt={ev.fileName}
                                className="w-11 h-11 object-cover rounded-lg border border-hairline shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-ink hover:text-brand-700 truncate block"
                              >
                                {ev.fileName}
                              </a>
                              <span className="text-[11px] text-slate-400">
                                {formatBytes(ev.fileSize)}
                              </span>
                            </div>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => deleteEvidenceMut.mutate(ev.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {activeResult.executedAt && (
                  <div className="text-[11px] text-slate-400 pt-2 border-t border-hairline flex justify-between">
                    <span>
                      {tx('Thực hiện gần nhất bởi:', 'Last executed by:')}{' '}
                      {activeResult.executedByName || '—'}
                    </span>
                    <span className="tabular-nums">
                      {new Date(activeResult.executedAt).toLocaleString(locale)}
                    </span>
                  </div>
                )}
              </div>

              {/* Per-Case Execution History Timeline */}
              <div className="bg-white rounded-2xl border border-hairline p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-brand-600" />
                    {tx(
                      `Lịch sử thực thi của ${activeResult.caseCode} (${resultHistory.length})`,
                      `Execution History for ${activeResult.caseCode} (${resultHistory.length})`,
                    )}
                  </h3>
                </div>

                {resultHistory.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    {tx(
                      'Chưa có lịch sử đánh dấu trạng thái nào cho Test Case này trong đợt chạy.',
                      'No execution status history for this Test Case in this run yet.',
                    )}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {resultHistory.map((h) => {
                      const fromSt = h.fromStatus ? EXECUTION_STATUS_STYLE[h.fromStatus] : null;
                      const toSt = h.toStatus ? EXECUTION_STATUS_STYLE[h.toStatus] : null;
                      const dotCls =
                        h.eventType === 'BUG_LINKED'
                          ? 'bg-rose-500 ring-rose-100'
                          : h.eventType === 'EVIDENCE_ADDED'
                            ? 'bg-sky-500 ring-sky-100'
                            : h.toStatus === 'PASSED'
                              ? 'bg-emerald-500 ring-emerald-100'
                              : h.toStatus === 'FAILED'
                                ? 'bg-rose-500 ring-rose-100'
                                : h.toStatus === 'BLOCKED'
                                  ? 'bg-amber-400 ring-amber-100'
                                  : 'bg-slate-400 ring-slate-100';

                      return (
                        <div
                          key={h.id}
                          className="flex items-start gap-3 p-3 rounded-xl bg-canvas/80 border border-hairline text-xs"
                        >
                          <div className="pt-1 shrink-0">
                            <span className={`block w-2.5 h-2.5 rounded-full ring-4 ${dotCls}`} />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-ink inline-flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400" />
                                  {h.actorName || 'QA'}
                                </span>
                                {h.eventType === 'STATUS_CHANGED' && fromSt && toSt ? (
                                  <>
                                    <span className="text-slate-500">
                                      {tx('chuyển trạng thái', 'changed status')}
                                    </span>
                                    <span
                                      className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full border ${fromSt.className}`}
                                    >
                                      {fromSt.label}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400" />
                                    <span
                                      className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full border ${toSt.className}`}
                                    >
                                      {toSt.label}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-slate-700">{h.summary}</span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 tabular-nums inline-flex items-center gap-1 shrink-0">
                                <Clock className="w-3 h-3" />
                                {new Date(h.createdAt).toLocaleString(locale)}
                              </span>
                            </div>

                            {h.actualResult && (
                              <div className="text-[11px] text-slate-600 bg-white border border-hairline/80 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                                <span className="font-semibold text-slate-500">
                                  {tx('Thực tế:', 'Actual:')}
                                </span>{' '}
                                {h.actualResult}
                              </div>
                            )}
                            {h.comment && (
                              <div className="text-[11px] text-slate-500 italic">
                                {tx('Ghi chú:', 'Note:')} {h.comment}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Test Run History Drawer */}
      {showRunHistory && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-[#11131A]/35 backdrop-blur-[1px]"
            onClick={() => setShowRunHistory(false)}
          />
          <div className="animate-drawer relative z-50 w-full max-w-2xl bg-white h-full shadow-2xl border-l border-hairline flex flex-col">
            <div className="px-5 py-4 border-b border-hairline flex items-center justify-between bg-canvas/70">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <History className="w-4 h-4 text-brand-600" />
                  {tx('Lịch sử thực thi toàn đợt chạy', 'Full Run Execution History')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {tx(
                    'Theo dõi chi tiết ai đánh Passed / Failed / Blocked và vào thời điểm nào',
                    'Track who marked Passed / Failed / Blocked and when',
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRunHistory(false)}
                className="p-1.5 text-slate-400 hover:text-ink rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 border-b border-hairline">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={runHistorySearch}
                  onChange={(e) => setRunHistorySearch(e.target.value)}
                  placeholder={tx(
                    'Tìm theo mã case (WEB-7), tên case hoặc người thực hiện...',
                    'Search by case code (WEB-7), title, or executor...',
                  )}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-canvas border border-hairline rounded-lg focus:bg-white focus:outline-none focus:border-brand-600"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {runHistoryLoading ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  {tx('Đang tải lịch sử đợt chạy...', 'Loading run history...')}
                </div>
              ) : (
                (() => {
                  const filtered = runHistory.filter((h) => {
                    if (!runHistorySearch.trim()) return true;
                    const q = runHistorySearch.toLowerCase();
                    return (
                      h.caseCode.toLowerCase().includes(q) ||
                      h.caseTitle.toLowerCase().includes(q) ||
                      (h.actorName || '').toLowerCase().includes(q) ||
                      h.summary.toLowerCase().includes(q)
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-10 text-center text-sm text-slate-400">
                        {tx('Chưa có bản ghi lịch sử thực thi nào.', 'No execution history records yet.')}
                      </div>
                    );
                  }

                  return filtered.map((h) => {
                    const fromSt = h.fromStatus ? EXECUTION_STATUS_STYLE[h.fromStatus] : null;
                    const toSt = h.toStatus ? EXECUTION_STATUS_STYLE[h.toStatus] : null;
                    return (
                      <div
                        key={h.id}
                        className="p-3.5 rounded-xl bg-canvas/80 border border-hairline hover:border-brand-300 transition-colors text-xs space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedResultId(h.runResultId);
                                setShowRunHistory(false);
                              }}
                              className="font-mono font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 cursor-pointer"
                            >
                              {h.caseCode}
                            </button>
                            <span className="font-semibold text-ink">{h.actorName || 'QA'}</span>
                            {h.eventType === 'STATUS_CHANGED' && fromSt && toSt ? (
                              <>
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full border ${fromSt.className}`}
                                >
                                  {fromSt.label}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full border ${toSt.className}`}
                                >
                                  {toSt.label}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-600">{h.summary}</span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {new Date(h.createdAt).toLocaleString(locale)}
                          </span>
                        </div>
                        <div className="text-slate-700 font-medium truncate">{h.caseTitle}</div>
                        {h.actualResult && (
                          <div className="text-[11px] text-slate-600 bg-white border border-hairline/80 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                            {h.actualResult}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Bug / Push Jira Modal */}
      {showBugModal && activeResult && (
        <div className="fixed inset-0 bg-[#11131A]/45 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Bug className="w-4 h-4 text-rose-600" />
                {tx(`Tạo Bug từ ${activeResult.caseCode}`, `Create Bug from ${activeResult.caseCode}`)}
              </h2>
              <button
                type="button"
                onClick={() => setShowBugModal(false)}
                className="p-1 text-slate-400 hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createBugMut.mutate();
              }}
              className="flex-1 overflow-y-auto p-6 space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Tiêu đề Bug *', 'Bug Title *')}
                </label>
                <input
                  required
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-hairline rounded-xl"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <Select
                    value={bugPriority}
                    onChange={(v) => setBugPriority(v as Priority)}
                    size="md"
                    className="w-full"
                    options={PRIORITIES.map((p) => ({
                      value: p,
                      label: PRIORITY_STYLE[p].label,
                      dotClassName: PRIORITY_STYLE[p].dot,
                    }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
                  <Select
                    value={bugSeverity}
                    onChange={(v) => setBugSeverity(v as DefectSeverity)}
                    size="md"
                    className="w-full"
                    options={DEFECT_SEVERITIES.map((sv) => ({
                      value: sv,
                      label: DEFECT_SEVERITY_STYLE[sv].label,
                      dotClassName: DEFECT_SEVERITY_STYLE[sv].dot,
                    }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Các bước tái hiện lỗi (Steps to Reproduce)', 'Steps to Reproduce')}
                </label>
                <textarea
                  rows={3}
                  value={bugSteps}
                  onChange={(e) => setBugSteps(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-hairline rounded-xl"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Kết quả thực tế (Actual Result)', 'Actual Result')}
                  </label>
                  <textarea
                    rows={3}
                    value={bugActual}
                    onChange={(e) => setBugActual(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-hairline rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Kết quả mong đợi (Expected Result)', 'Expected Result')}
                  </label>
                  <textarea
                    rows={3}
                    value={bugExpected}
                    onChange={(e) => setBugExpected(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-hairline rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Mô tả / Ghi chú thêm', 'Description / Additional Notes')}
                </label>
                <textarea
                  rows={2}
                  value={bugDesc}
                  onChange={(e) => setBugDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-hairline rounded-xl"
                />
              </div>

              <div className="p-3 rounded-xl bg-canvas border border-hairline space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-brand-600" />
                    {tx('Bằng chứng (Evidence)', 'Evidence')}
                  </span>
                  <label className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:bg-brand-50 px-2.5 py-1 rounded-lg cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {tx('Chọn tệp', 'Choose files')}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0) setBugEvidenceFiles((prev) => [...prev, ...files]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <div
                  tabIndex={0}
                  onPaste={handleBugEvidencePaste}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files ?? []);
                    if (files.length > 0) setBugEvidenceFiles((prev) => [...prev, ...files]);
                  }}
                  className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-[11px] text-slate-500 text-center cursor-pointer transition-colors hover:border-brand-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                >
                  {tx('Click vào ô này rồi nhấn', 'Click here and press')}{' '}
                  <kbd className="px-1.5 py-0.5 text-[10px] bg-canvas border border-hairline rounded font-mono text-ink">
                    Ctrl+V
                  </kbd>{' '}
                  {tx('để dán ảnh chụp màn hình, hoặc kéo thả tệp vào đây', 'to paste screenshots, or drag and drop files here')}
                </div>

                {bugEvidenceFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {bugEvidenceFiles.map((f, idx) => (
                      <div
                        key={`${f.name}-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-hairline text-xs"
                      >
                        <FileText className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                        <span className="max-w-[160px] truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setBugEvidenceFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-canvas border border-hairline space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bugPushJira}
                    onChange={(e) => setBugPushJira(e.target.checked)}
                    className="rounded accent-brand-600"
                  />
                  {tx(
                    `Đẩy trực tiếp tạo Bug Ticket trên Jira (${run.jiraEnabled ? 'Đã bật' : 'Chưa bật'})`,
                    `Create Bug Ticket directly on Jira (${run.jiraEnabled ? 'Enabled' : 'Disabled'})`,
                  )}
                </label>
                {!bugPushJira && (
                  <input
                    value={bugJiraKey}
                    onChange={(e) => setBugJiraKey(e.target.value.toUpperCase())}
                    placeholder={tx('Hoặc gắn mã Jira Bug sẵn có (VD: ECOM-512)', 'Or link existing Jira Bug key (e.g., ECOM-512)')}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-hairline rounded-lg"
                  />
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowBugModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-canvas rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createBugMut.isPending}
                  className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer"
                >
                  {createBugMut.isPending
                    ? tx('Đang xử lý...', 'Processing...')
                    : bugPushJira
                      ? tx('Tạo & Đẩy sang Jira', 'Create & Push to Jira')
                      : tx('Lưu Defect', 'Save Defect')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sync Run Progress to Jira Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-[#11131A]/45 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-600" />
                {tx('Đồng bộ Tiến độ lên Jira', 'Sync Progress to Jira')}
              </h2>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="p-1 text-slate-400 hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              {tx(
                `Hệ thống sẽ đăng bình luận tổng hợp kết quả (${s.passed} Passed · ${s.failed} Failed · ${s.blocked} Blocked · Pass Rate ${s.passRate}%) và danh sách case Failed lên ticket Jira để PM & Dev nắm tiến độ ngay lập tức.`,
                `The system will post a summary comment (${s.passed} Passed · ${s.failed} Failed · ${s.blocked} Blocked · Pass Rate ${s.passRate}%) and the list of Failed cases to the Jira ticket so PM & Dev can track progress immediately.`,
              )}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                syncJiraMut.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Jira Ticket Key đích (Epic / Story / Task) *', 'Target Jira Ticket Key (Epic / Story / Task) *')}
                </label>
                <input
                  required
                  value={syncJiraKey}
                  onChange={(e) => setSyncJiraKey(e.target.value.toUpperCase())}
                  placeholder={tx('VD: ECOM-100', 'e.g., ECOM-100')}
                  className="w-full px-3 py-2 text-sm font-mono border border-hairline rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-canvas rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={syncJiraMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {syncJiraMut.isPending ? tx('Đang gửi lên Jira...', 'Syncing to Jira...') : tx('Đồng bộ ngay', 'Sync Now')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Re-run Failed / Blocked Modal */}
      {showRerunModal && (
        <div className="fixed inset-0 bg-[#11131A]/45 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-hairline shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <RotateCcw className="w-4.5 h-4.5 text-rose-600" />
                {tx('Tạo Test Run chạy lại (Re-run)', 'Create Re-run Test Run')}
              </h2>
              <button
                type="button"
                onClick={() => setShowRerunModal(false)}
                className="p-1 text-slate-400 hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              {tx('Lấy snapshot các Test Case theo trạng thái bạn chọn từ', 'Take a snapshot of Test Cases matching your selected statuses from')}{' '}
              <strong className="text-ink">{run.title}</strong>{' '}
              {tx('để kiểm thử lại trên bản build mới.', 'to re-test on a new build.')}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rerunStatuses.length === 0) {
                  toast.error(tx('Chọn ít nhất 1 trạng thái cần chạy lại', 'Select at least 1 status to re-run'));
                  return;
                }
                rerunMut.mutate();
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {tx('Lọc các Test Case có trạng thái:', 'Filter Test Cases with status:')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['FAILED', 'BLOCKED', 'NOT_TEST', 'NOT_EXECUTED'] as ExecutionStatus[]).map(
                    (st) => {
                      const cnt = run.results.filter((r) => r.status === st).length;
                      const active = rerunStatuses.includes(st);
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            setRerunStatuses((prev) =>
                              prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st],
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                            active
                              ? 'bg-[#851FB6] text-white border-[#851FB6]'
                              : 'bg-canvas text-slate-600 border-hairline hover:bg-slate-200/70'
                          }`}
                        >
                          {EXECUTION_STATUS_STYLE[st].label} ({cnt})
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Tên Test Run mới *', 'New Test Run Name *')}
                </label>
                <input
                  required
                  value={rerunTitle}
                  onChange={(e) => setRerunTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:border-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Môi trường', 'Environment')}
                  </label>
                  <input
                    value={rerunEnv}
                    onChange={(e) => setRerunEnv(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-hairline rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Build / Version
                  </label>
                  <input
                    value={rerunVersion}
                    onChange={(e) => setRerunVersion(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-hairline rounded-xl"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRerunModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-canvas rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={
                    rerunMut.isPending ||
                    run.results.filter((r) => rerunStatuses.includes(r.status)).length === 0
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {rerunMut.isPending
                    ? tx('Đang tạo Run...', 'Creating Run...')
                    : tx(
                        `Tạo Run chạy lại (${run.results.filter((r) => rerunStatuses.includes(r.status)).length} case)`,
                        `Create Re-run (${run.results.filter((r) => rerunStatuses.includes(r.status)).length} cases)`,
                      )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
