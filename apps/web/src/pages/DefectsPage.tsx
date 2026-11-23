import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bug,
  Download,
  ExternalLink,
  FileText,
  Paperclip,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  PRIORITIES,
  canEditCases,
  type DefectDto,
  type DefectSeverity,
  type DefectStatus,
  type Priority,
} from '@tcms/shared';
import { api } from '../lib/api';
import {
  DEFECT_SEVERITY_STYLE,
  DEFECT_STATUS_STYLE,
  PRIORITY_STYLE,
  formatBytes,
  safeExternalHttpUrl,
} from '../lib/badges';
import { ProjectNav } from '../components/ProjectNav';
import { Select } from '../components/Select';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useLanguage } from '../contexts/LanguageContext';

export function DefectsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { tx, lang } = useLanguage();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [actualResult, setActualResult] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [severity, setSeverity] = useState<DefectSeverity>('HIGH');
  const [caseCode, setCaseCode] = useState('');
  const [jiraKey, setJiraKey] = useState('');
  const [pushToJira, setPushToJira] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Detail / Edit Drawer state
  const [activeDefectId, setActiveDefectId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSteps, setEditSteps] = useState('');
  const [editActual, setEditActual] = useState('');
  const [editExpected, setEditExpected] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('MEDIUM');
  const [editSeverity, setEditSeverity] = useState<DefectSeverity>('HIGH');
  const [editStatus, setEditStatus] = useState<DefectStatus>('OPEN');
  const [editJiraKey, setEditJiraKey] = useState('');

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: defects = [], isLoading } = useQuery({
    queryKey: ['defects', projectId, statusFilter, severityFilter, priorityFilter],
    queryFn: () =>
      api.listDefects(projectId!, {
        status: (statusFilter as DefectStatus) || undefined,
        severity: (severityFilter as DefectSeverity) || undefined,
        priority: (priorityFilter as Priority) || undefined,
      }),
    enabled: Boolean(projectId),
  });

  const activeDefect: DefectDto | undefined = defects.find((d) => d.id === activeDefectId);

  useEffect(() => {
    if (!activeDefect) return;
    setEditTitle(activeDefect.title);
    setEditDesc(activeDefect.description || '');
    setEditSteps(activeDefect.stepsToReproduce || '');
    setEditActual(activeDefect.actualResult || '');
    setEditExpected(activeDefect.expectedResult || '');
    setEditPriority(activeDefect.priority || 'MEDIUM');
    setEditSeverity(activeDefect.severity);
    setEditStatus(activeDefect.status);
    setEditJiraKey(activeDefect.jiraIssueKey || '');
  }, [activeDefect?.id, activeDefect?.updatedAt]);

  const resetCreateForm = () => {
    setTitle('');
    setDescription('');
    setStepsToReproduce('');
    setActualResult('');
    setExpectedResult('');
    setPriority('HIGH');
    setSeverity('HIGH');
    setCaseCode('');
    setJiraKey('');
    setPushToJira(false);
    setPendingFiles([]);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await api.createDefect(projectId!, {
        title,
        description,
        stepsToReproduce,
        actualResult,
        expectedResult,
        priority,
        severity,
        caseCode: caseCode || null,
        jiraIssueKey: jiraKey || null,
        pushToJira,
      });

      let uploadedCount = 0;
      let failedCount = 0;
      for (const file of pendingFiles) {
        try {
          await api.uploadDefectEvidence(projectId!, res.defect.id, file);
          uploadedCount++;
        } catch {
          failedCount++;
        }
      }
      return { ...res, uploadedCount, failedCount };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['defects', projectId] });
      setShowCreate(false);
      resetCreateForm();
      if (res.jiraResult) {
        setNotice({ ok: res.jiraResult.ok, text: res.jiraResult.message });
        if (res.jiraResult.ok) toast.success(res.jiraResult.message);
        else toast.error(res.jiraResult.message);
      } else {
        const suffix =
          res.uploadedCount > 0
            ? tx(
                ` kèm ${res.uploadedCount} tệp bằng chứng`,
                ` with ${res.uploadedCount} evidence ${res.uploadedCount === 1 ? 'file' : 'files'}`,
              )
            : '';
        const msg = tx(`Đã tạo Defect thành công${suffix}!`, `Created Defect successfully${suffix}!`);
        setNotice({ ok: true, text: msg });
        toast.success(msg);
      }
      if (res.failedCount > 0) {
        toast.error(
          tx(
            `Có ${res.failedCount} tệp bằng chứng tải lên thất bại`,
            `${res.failedCount} evidence ${res.failedCount === 1 ? 'file' : 'files'} failed to upload`,
          ),
        );
      }
      setTimeout(() => setNotice(null), 5000);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể tạo Defect', 'Failed to create Defect')),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      title?: string;
      description?: string;
      stepsToReproduce?: string;
      actualResult?: string;
      expectedResult?: string;
      priority?: Priority;
      severity?: DefectSeverity;
      status?: DefectStatus;
      jiraIssueKey?: string | null;
    }) => api.updateDefect(projectId!, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defects', projectId] });
      toast.success(tx('Đã cập nhật Defect', 'Updated Defect'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể cập nhật Defect', 'Failed to update Defect')),
  });

  const uploadEvidenceMut = useMutation({
    mutationFn: ({ defectId, file }: { defectId: string; file: File }) =>
      api.uploadDefectEvidence(projectId!, defectId, file),
    onSuccess: (ev) => {
      queryClient.invalidateQueries({ queryKey: ['defects', projectId] });
      toast.success(tx(`Đã đính kèm "${ev.fileName}"`, `Attached "${ev.fileName}"`));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể tải tệp bằng chứng', 'Failed to upload evidence file')),
  });

  const deleteEvidenceMut = useMutation({
    mutationFn: ({ defectId, evidenceId }: { defectId: string; evidenceId: string }) =>
      api.deleteDefectEvidence(projectId!, defectId, evidenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defects', projectId] });
      toast.success(tx('Đã xóa tệp bằng chứng', 'Deleted evidence file'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể xóa bằng chứng', 'Failed to delete evidence')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteDefect(projectId!, id),
    onSuccess: (_res, deletedId) => {
      if (activeDefectId === deletedId) setActiveDefectId(null);
      queryClient.invalidateQueries({ queryKey: ['defects', projectId] });
      toast.success(tx('Đã xóa Defect', 'Deleted Defect'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể xóa Defect', 'Failed to delete Defect')),
  });

  const handlePasteInCreate = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          const named = new File([file], `bug-evidence-${Date.now()}.png`, { type: file.type });
          setPendingFiles((prev) => [...prev, named]);
          toast.success(tx(`Đã dán ảnh bằng chứng "${named.name}"`, `Pasted evidence image "${named.name}"`));
        }
        break;
      }
    }
  };

  const handlePasteInDrawer = (e: React.ClipboardEvent) => {
    if (!canEdit || !activeDefect) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          const named = new File([file], `bug-evidence-${Date.now()}.png`, { type: file.type });
          uploadEvidenceMut.mutate({ defectId: activeDefect.id, file: named });
        }
        break;
      }
    }
  };

  if (!project) return <div className="p-8 text-sm text-slate-400">{tx('Đang tải...', 'Loading...')}</div>;

  const canEdit = canEditCases(project.myRole);
  const openCount = defects.filter((d) => d.status === 'OPEN' || d.status === 'IN_PROGRESS').length;

  return (
    <div className="flex-1 flex flex-col">
      <ProjectNav project={project} />

      <div className="max-w-7xl w-full mx-auto px-5 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink tracking-[-0.02em] flex items-center gap-2">
              <Bug className="w-5 h-5 text-rose-600" />
              {tx('Quản lý Lỗi (Defects & Jira Bugs)', 'Defects & Jira Bugs')}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {tx(
                `Theo dõi các bug phát sinh trong quá trình chạy Test Run và liên kết ticket Jira (${openCount} lỗi đang mở).`,
                `Track bugs reported during Test Runs and linked Jira tickets (${openCount} open ${openCount === 1 ? 'defect' : 'defects'}).`,
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              size="xs"
              className="py-1.5 min-w-[144px]"
              options={[
                { value: '', label: tx('Trạng thái: Tất cả', 'Status: All') },
                ...DEFECT_STATUSES.map((s) => ({
                  value: s,
                  label: DEFECT_STATUS_STYLE[s].label,
                })),
              ]}
            />
            <Select
              value={severityFilter}
              onChange={setSeverityFilter}
              size="xs"
              className="py-1.5 min-w-[136px]"
              options={[
                { value: '', label: tx('Severity: Tất cả', 'Severity: All') },
                ...DEFECT_SEVERITIES.map((s) => ({
                  value: s,
                  label: DEFECT_SEVERITY_STYLE[s].label,
                  dotClassName: DEFECT_SEVERITY_STYLE[s].dot,
                })),
              ]}
            />
            <Select
              value={priorityFilter}
              onChange={setPriorityFilter}
              size="xs"
              className="py-1.5 min-w-[136px]"
              options={[
                { value: '', label: tx('Priority: Tất cả', 'Priority: All') },
                ...PRIORITIES.map((p) => ({
                  value: p,
                  label: PRIORITY_STYLE[p].label,
                  dotClassName: PRIORITY_STYLE[p].dot,
                })),
              ]}
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  resetCreateForm();
                  setPushToJira(Boolean(project.jiraEnabled));
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {tx('Tạo Bug mới', 'New Bug')}
              </button>
            )}
          </div>
        </div>

        {notice && (
          <div
            className={`text-xs font-medium px-4 py-2.5 rounded-xl border ${
              notice.ok
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-hairline overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-slate-400">
              {tx('Đang tải danh sách lỗi...', 'Loading defects...')}
            </div>
          ) : defects.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3">
                <Bug className="w-6 h-6" />
              </div>
              <p className="text-ink font-semibold">
                {tx('Không có lỗi nào phù hợp', 'No matching defects found')}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {tx(
                  'Bạn có thể log Bug trực tiếp từ màn hình chạy Test Run hoặc bấm "Tạo Bug mới".',
                  'You can log a Bug directly from a Test Run or click "New Bug".',
                )}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-canvas border-b border-hairline text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-32">Jira Key</th>
                  <th className="px-4 py-3">{tx('Tiêu đề & Chi tiết lỗi', 'Title & Details')}</th>
                  <th className="px-4 py-3 w-28">Priority</th>
                  <th className="px-4 py-3 w-28">Severity</th>
                  <th className="px-4 py-3 w-36">{tx('Trạng thái', 'Status')}</th>
                  <th className="px-4 py-3 w-44">{tx('Nguồn (Run / Case)', 'Source (Run / Case)')}</th>
                  {canEdit && <th className="px-4 py-3 w-16 text-right">{tx('Xóa', 'Delete')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/70">
                {defects.map((d) => {
                  const prio = PRIORITY_STYLE[d.priority || 'MEDIUM'];
                  const sev = DEFECT_SEVERITY_STYLE[d.severity];
                  const st = DEFECT_STATUS_STYLE[d.status];
                  const safeJiraHref = safeExternalHttpUrl(d.jiraIssueUrl);
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setActiveDefectId(d.id)}
                      className="hover:bg-canvas/70 cursor-pointer transition-colors"
                    >
                      <td
                        className="px-4 py-3 align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {d.jiraIssueKey ? (
                          safeJiraHref ? (
                            <a
                              href={safeJiraHref}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100"
                            >
                              {d.jiraIssueKey}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                              {d.jiraIssueKey}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">{tx('Nội bộ', 'Internal')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-ink hover:text-brand-700">
                          {d.title}
                        </div>
                        {(d.actualResult || d.description) && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {d.actualResult || d.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1">
                          <span>
                            {d.createdByName || 'QA'} · {new Date(d.createdAt).toLocaleString(locale)}
                          </span>
                          {d.evidence.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-brand-700 bg-brand-50 border border-brand-200/70 px-1.5 py-0.2 rounded-md font-medium">
                              <Paperclip className="w-3 h-3" />
                              {d.evidence.length} {tx('tệp', d.evidence.length === 1 ? 'file' : 'files')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${prio.className}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
                          {prio.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${sev.className}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                          {sev.label}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canEdit ? (
                          <Select
                            value={d.status}
                            variant="custom"
                            onChange={(v) =>
                              updateMut.mutate({ id: d.id, status: v as DefectStatus })
                            }
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border gap-1.5 ${st.className}`}
                            options={DEFECT_STATUSES.map((s) => ({
                              value: s,
                              label: DEFECT_STATUS_STYLE[s].label,
                            }))}
                          />
                        ) : (
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${st.className}`}
                          >
                            {st.label}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 align-top text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {d.caseCode && (
                          <span className="font-mono font-semibold text-brand-700 block">
                            {d.caseCode}
                          </span>
                        )}
                        {d.runId && (
                          <Link
                            to={`/projects/${projectId}/runs/${d.runId}`}
                            className="text-slate-500 hover:text-brand-700 hover:underline line-clamp-1"
                          >
                            {d.runTitle || tx('Mở Test Run', 'Open Test Run')}
                          </Link>
                        )}
                      </td>
                      {canEdit && (
                        <td
                          className="px-4 py-3 align-top text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await confirm({
                                title: tx('Xóa Defect này?', 'Delete this Defect?'),
                                description: tx(
                                  `Bản ghi lỗi "${d.title}" sẽ bị xóa khỏi danh sách Defect của dự án.`,
                                  `Defect record "${d.title}" will be removed from this project's defect list.`,
                                ),
                                confirmText: tx('Xóa Defect', 'Delete Defect'),
                                variant: 'danger',
                              });
                              if (ok) deleteMut.mutate(d.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Defect Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-[#11131A]/45 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Bug className="w-4.5 h-4.5 text-rose-600" />
                {tx('Tạo Bug / Defect mới', 'Create New Bug / Defect')}
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
                createMut.mutate();
              }}
              className="flex-1 overflow-y-auto p-6 space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Tiêu đề lỗi *', 'Bug Title *')}
                </label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tx(
                    'VD: [Payment] Lỗi HTTP 500 khi callback VNPay',
                    'e.g., [Payment] HTTP 500 error on VNPay callback',
                  )}
                  className="w-full px-3 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:border-brand-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <Select
                    value={priority}
                    onChange={(v) => setPriority(v as Priority)}
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
                    value={severity}
                    onChange={(v) => setSeverity(v as DefectSeverity)}
                    size="md"
                    className="w-full"
                    options={DEFECT_SEVERITIES.map((s) => ({
                      value: s,
                      label: DEFECT_SEVERITY_STYLE[s].label,
                      dotClassName: DEFECT_SEVERITY_STYLE[s].dot,
                    }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Mã Test Case liên quan', 'Related Test Case Code')}
                  </label>
                  <input
                    value={caseCode}
                    onChange={(e) => setCaseCode(e.target.value.toUpperCase())}
                    placeholder={tx('VD: WEB-7', 'e.g., WEB-7')}
                    className="w-full px-3 py-2 text-sm font-mono border border-hairline rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Các bước tái hiện lỗi (Steps to Reproduce)', 'Steps to Reproduce')}
                </label>
                <textarea
                  rows={3}
                  value={stepsToReproduce}
                  onChange={(e) => setStepsToReproduce(e.target.value)}
                  placeholder={tx(
                    '1. Đăng nhập tài khoản QA\n2. Mở màn hình Thanh toán\n3. Chọn VNPay và bấm Xác nhận...',
                    '1. Sign in with QA account\n2. Open Checkout screen\n3. Select VNPay and click Confirm...',
                  )}
                  className="w-full px-3 py-2 text-xs border border-hairline rounded-xl focus:outline-none focus:border-brand-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Kết quả thực tế (Actual Result)', 'Actual Result')}
                  </label>
                  <textarea
                    rows={3}
                    value={actualResult}
                    onChange={(e) => setActualResult(e.target.value)}
                    placeholder={tx(
                      'Hệ thống trả lỗi 500, không tạo được đơn hàng...',
                      'System returns HTTP 500, order is not created...',
                    )}
                    className="w-full px-3 py-2 text-xs border border-hairline rounded-xl focus:outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {tx('Kết quả mong đợi (Expected Result)', 'Expected Result')}
                  </label>
                  <textarea
                    rows={3}
                    value={expectedResult}
                    onChange={(e) => setExpectedResult(e.target.value)}
                    placeholder={tx(
                      'Thanh toán thành công và điều hướng về trang chi tiết đơn...',
                      'Payment succeeds and redirects to the order detail page...',
                    )}
                    className="w-full px-3 py-2 text-xs border border-hairline rounded-xl focus:outline-none focus:border-brand-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {tx('Mô tả / Ghi chú thêm', 'Description / Additional Notes')}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={tx(
                    'Môi trường, tài khoản test, hoặc ngữ cảnh bổ sung...',
                    'Environment, test account, or additional context...',
                  )}
                  className="w-full px-3 py-2 text-xs border border-hairline rounded-xl focus:outline-none focus:border-brand-600"
                />
              </div>

              {/* Evidence Upload + Dedicated Ctrl+V Paste Zone */}
              <div className="p-3 rounded-xl bg-canvas border border-hairline space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-brand-600" />
                    {tx('Bằng chứng (Evidence — ảnh / log / video)', 'Evidence (images / logs / videos)')}
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
                        if (files.length > 0) setPendingFiles((prev) => [...prev, ...files]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <div
                  tabIndex={0}
                  onPaste={handlePasteInCreate}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files ?? []);
                    if (files.length > 0) setPendingFiles((prev) => [...prev, ...files]);
                  }}
                  className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-[11px] text-slate-500 text-center cursor-pointer transition-colors hover:border-brand-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                >
                  {tx('Click vào ô này rồi nhấn', 'Click here and press')}{' '}
                  <kbd className="px-1.5 py-0.5 text-[10px] bg-canvas border border-hairline rounded font-mono text-ink">
                    Ctrl+V
                  </kbd>{' '}
                  {tx('để dán ảnh chụp màn hình, hoặc kéo thả tệp vào đây', 'to paste screenshots, or drag and drop files here')}
                </div>

                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingFiles.map((f, idx) => (
                      <div
                        key={`${f.name}-${idx}`}
                        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-hairline text-xs"
                      >
                        <FileText className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                        <span className="max-w-[180px] truncate font-medium text-ink">{f.name}</span>
                        <span className="text-[10px] text-slate-400">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
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

              <div className="p-3 rounded-xl bg-canvas border border-hairline space-y-2.5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushToJira}
                    onChange={(e) => setPushToJira(e.target.checked)}
                    className="rounded accent-brand-600"
                  />
                  {tx('Tự động tạo Issue Bug trên Jira qua API', 'Automatically create Bug Issue on Jira via API')}
                </label>
                {!pushToJira && (
                  <input
                    value={jiraKey}
                    onChange={(e) => setJiraKey(e.target.value.toUpperCase())}
                    placeholder={tx('Hoặc nhập mã Jira Bug có sẵn (VD: ECOM-512)', 'Or enter existing Jira Bug key (e.g., ECOM-512)')}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-hairline rounded-lg"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
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
                  className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl cursor-pointer"
                >
                  {createMut.isPending
                    ? tx('Đang lưu...', 'Saving...')
                    : pushToJira
                      ? tx('Tạo & Đẩy Jira', 'Create & Push Jira')
                      : tx('Lưu Bug', 'Save Bug')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Defect Detail & Edit Drawer */}
      {activeDefect && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-[#11131A]/35 backdrop-blur-[1px]"
            onClick={() => setActiveDefectId(null)}
          />
          <div className="animate-drawer relative z-10 w-full max-w-2xl bg-white h-full shadow-2xl border-l border-hairline flex flex-col">
            <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between bg-canvas/70">
              <div className="flex items-center gap-2 min-w-0">
                <Bug className="w-4.5 h-4.5 text-rose-600 shrink-0" />
                <h2 className="font-bold text-ink truncate">
                  {tx('Chi tiết Bug / Defect', 'Bug / Defect Details')}
                </h2>
                {activeDefect.caseCode && (
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200 shrink-0">
                    {activeDefect.caseCode}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    disabled={updateMut.isPending || !editTitle.trim()}
                    onClick={() =>
                      updateMut.mutate({
                        id: activeDefect.id,
                        title: editTitle,
                        description: editDesc,
                        stepsToReproduce: editSteps,
                        actualResult: editActual,
                        expectedResult: editExpected,
                        priority: editPriority,
                        severity: editSeverity,
                        status: editStatus,
                        jiraIssueKey: editJiraKey || null,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {updateMut.isPending ? tx('Đang lưu...', 'Saving...') : tx('Lưu thay đổi', 'Save Changes')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveDefectId(null)}
                  aria-label={tx('Đóng', 'Close')}
                  className="p-1.5 text-slate-400 hover:text-ink rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Tiêu đề lỗi', 'Bug Title')}
                </label>
                <input
                  disabled={!canEdit}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-medium border border-hairline rounded-xl disabled:bg-canvas"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Priority</label>
                  <Select
                    disabled={!canEdit}
                    value={editPriority}
                    onChange={(v) => setEditPriority(v as Priority)}
                    size="sm"
                    className="w-full"
                    options={PRIORITIES.map((p) => ({
                      value: p,
                      label: PRIORITY_STYLE[p].label,
                      dotClassName: PRIORITY_STYLE[p].dot,
                    }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Severity</label>
                  <Select
                    disabled={!canEdit}
                    value={editSeverity}
                    onChange={(v) => setEditSeverity(v as DefectSeverity)}
                    size="sm"
                    className="w-full"
                    options={DEFECT_SEVERITIES.map((s) => ({
                      value: s,
                      label: DEFECT_SEVERITY_STYLE[s].label,
                      dotClassName: DEFECT_SEVERITY_STYLE[s].dot,
                    }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {tx('Trạng thái', 'Status')}
                  </label>
                  <Select
                    disabled={!canEdit}
                    value={editStatus}
                    onChange={(v) => setEditStatus(v as DefectStatus)}
                    size="sm"
                    className="w-full"
                    options={DEFECT_STATUSES.map((s) => ({
                      value: s,
                      label: DEFECT_STATUS_STYLE[s].label,
                    }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Jira Bug Key
                </label>
                <input
                  disabled={!canEdit}
                  value={editJiraKey}
                  onChange={(e) => setEditJiraKey(e.target.value.toUpperCase())}
                  placeholder={tx('VD: ECOM-512', 'e.g., ECOM-512')}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-hairline rounded-lg disabled:bg-canvas"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Các bước tái hiện lỗi (Steps to Reproduce)', 'Steps to Reproduce')}
                </label>
                <textarea
                  rows={4}
                  disabled={!canEdit}
                  value={editSteps}
                  onChange={(e) => setEditSteps(e.target.value)}
                  placeholder={tx('Chưa nhập bước tái hiện...', 'No reproduction steps entered...')}
                  className="w-full px-3 py-2 text-xs border border-hairline rounded-xl disabled:bg-canvas"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {tx('Kết quả thực tế (Actual Result)', 'Actual Result')}
                  </label>
                  <textarea
                    rows={3}
                    disabled={!canEdit}
                    value={editActual}
                    onChange={(e) => setEditActual(e.target.value)}
                    placeholder={tx('Chưa ghi nhận...', 'Not recorded...')}
                    className="w-full px-3 py-2 text-xs border border-hairline rounded-xl disabled:bg-canvas"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {tx('Kết quả mong đợi (Expected Result)', 'Expected Result')}
                  </label>
                  <textarea
                    rows={3}
                    disabled={!canEdit}
                    value={editExpected}
                    onChange={(e) => setEditExpected(e.target.value)}
                    placeholder={tx('Chưa ghi nhận...', 'Not recorded...')}
                    className="w-full px-3 py-2 text-xs border border-hairline rounded-xl disabled:bg-canvas"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Mô tả / Ghi chú thêm', 'Description / Additional Notes')}
                </label>
                <textarea
                  rows={2}
                  disabled={!canEdit}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-hairline rounded-xl disabled:bg-canvas"
                />
              </div>

              {/* Evidence list & dedicated paste zone */}
              <div className="pt-3 border-t border-hairline space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-brand-600" />
                    {tx(`Bằng chứng (${activeDefect.evidence.length})`, `Evidence (${activeDefect.evidence.length})`)}
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
                          if (f) uploadEvidenceMut.mutate({ defectId: activeDefect.id, file: f });
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                {canEdit && (
                  <div
                    tabIndex={0}
                    onPaste={handlePasteInDrawer}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const files = Array.from(e.dataTransfer.files ?? []);
                      for (const f of files) {
                        uploadEvidenceMut.mutate({ defectId: activeDefect.id, file: f });
                      }
                    }}
                    className="rounded-lg border border-dashed border-slate-300 bg-canvas/50 px-3 py-2 text-[11px] text-slate-500 text-center cursor-pointer transition-colors hover:border-brand-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                  >
                    {tx('Click vào ô này rồi nhấn', 'Click here and press')}{' '}
                    <kbd className="px-1.5 py-0.5 text-[10px] bg-white border border-hairline rounded font-mono text-ink">
                      Ctrl+V
                    </kbd>{' '}
                    {tx('để dán ảnh, hoặc kéo thả tệp vào đây', 'to paste images, or drag and drop files here')}
                  </div>
                )}

                {activeDefect.evidence.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    {tx(
                      'Chưa có ảnh chụp màn hình hoặc tệp log đính kèm.',
                      'No screenshots or log files attached yet.',
                    )}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeDefect.evidence.map((ev) => {
                      const url = api.getAttachmentUrl(ev.url);
                      const isImg = ev.mimeType.startsWith('image/');
                      return (
                        <div
                          key={ev.id}
                          className="flex items-center gap-2.5 p-2 rounded-xl border border-hairline bg-canvas/60"
                        >
                          {isImg ? (
                            <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                              <img
                                src={url}
                                alt={ev.fileName}
                                className="w-12 h-12 object-cover rounded-lg border border-hairline"
                              />
                            </a>
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-ink truncate">{ev.fileName}</div>
                            <div className="text-[11px] text-slate-400">
                              {formatBytes(ev.fileSize)}
                            </div>
                          </div>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-slate-500 hover:text-brand-700 rounded"
                            title={tx('Mở / Tải xuống', 'Open / Download')}
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() =>
                                deleteEvidenceMut.mutate({
                                  defectId: activeDefect.id,
                                  evidenceId: ev.id,
                                })
                              }
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title={tx('Xóa tệp', 'Delete file')}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
