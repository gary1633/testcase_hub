import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GitCompareArrows,
  GripVertical,
  History,
  Layers,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AUTOMATION_STATUSES,
  PRIORITIES,
  SEVERITIES,
  TEST_CASE_STATUSES,
  TEST_CASE_TYPES,
  type AutomationStatus,
  type Priority,
  type Severity,
  type SharedStepDto,
  type SuiteDto,
  type TestCaseStatus,
  type TestCaseType,
} from '@tcms/shared';
import { api } from '../lib/api';
import {
  AUTOMATION_STYLE,
  PRIORITY_STYLE,
  SEVERITY_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
  VERSION_ACTION_STYLE,
  VERSION_STATE_STYLE,
  formatBytes,
  safeExternalHttpUrl,
} from '../lib/badges';
import { Select } from './Select';
import { VersionCompareModal } from './VersionCompareModal';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useLanguage } from '../contexts/LanguageContext';

interface StepDraft {
  clientId: string;
  action: string;
  data: string;
  expectedResult: string;
  sharedStepId?: string | null;
  sharedStepTitle?: string | null;
}

function SortableStepRow({
  step,
  index,
  canEdit,
  sharedStepCatalog,
  onChange,
  onRemove,
}: {
  step: StepDraft;
  index: number;
  canEdit: boolean;
  sharedStepCatalog: SharedStepDto[];
  onChange: (field: keyof Omit<StepDraft, 'clientId' | 'sharedStepId' | 'sharedStepTitle'>, val: string) => void;
  onRemove: () => void;
}) {
  const { tx } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.clientId,
    disabled: !canEdit,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  const linkedShared = step.sharedStepId
    ? sharedStepCatalog.find((s) => s.id === step.sharedStepId)
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        step.sharedStepId
          ? 'bg-[#FBF5FF] border border-[#E9D5FF] rounded-lg p-3 space-y-2'
          : 'bg-slate-50/80 border border-slate-200 rounded-lg p-3 space-y-2'
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {canEdit && (
            <span
              {...attributes}
              {...listeners}
              className="text-slate-400 hover:text-slate-600 cursor-grab"
              title={tx('Kéo để sắp xếp bước', 'Drag to reorder step')}
            >
              <GripVertical className="w-4 h-4" />
            </span>
          )}
          <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
            {tx('Bước', 'Step')} {index + 1}
          </span>
          {step.sharedStepId && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#851FB6] bg-[#F5EBFA] border border-[#E9D5FF] px-2 py-0.5 rounded-full">
              <Layers className="w-3 h-3" />
              Shared Step{linkedShared ? ` · ${linkedShared.code}` : ''}:{' '}
              {linkedShared?.title ?? step.sharedStepTitle ?? step.action}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer"
            title={tx('Xóa bước', 'Remove step')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {step.sharedStepId ? (
        <div className="rounded-md border border-[#E9D5FF] bg-white/90 px-3 py-2 text-xs text-slate-600 space-y-1">
          {linkedShared && linkedShared.steps.length > 0 ? (
            linkedShared.steps.map((sub, subIdx) => (
              <div key={subIdx} className="flex gap-2 leading-relaxed">
                <span className="font-mono text-[11px] font-semibold text-[#851FB6]">
                  {subIdx + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-800">{sub.action}</span>
                  {sub.expectedResult && (
                    <span className="text-slate-500"> → {sub.expectedResult}</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-slate-500 italic">
              {tx(
                'Nhúng bộ bước dùng chung (sẽ tự động bung chi tiết khi tạo Test Run & Export Excel).',
                'Embedded shared steps (automatically expanded when creating a Test Run or exporting to Excel).',
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              {tx('Hành động (Action)', 'Action')}
            </label>
            <textarea
              rows={2}
              disabled={!canEdit}
              value={step.action}
              onChange={(e) => onChange('action', e.target.value)}
              placeholder={tx('Mô tả thao tác thực hiện...', 'Describe the action to perform...')}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              {tx('Dữ liệu đầu vào (Input)', 'Input Data')}
            </label>
            <textarea
              rows={2}
              disabled={!canEdit}
              value={step.data}
              onChange={(e) => onChange('data', e.target.value)}
              placeholder={tx('Tùy chọn (VD: user/pass)...', 'Optional (e.g. user/pass)...')}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              {tx('Kết quả mong đợi (Expected)', 'Expected Result')}
            </label>
            <textarea
              rows={2}
              disabled={!canEdit}
              value={step.expectedResult}
              onChange={(e) => onChange('expectedResult', e.target.value)}
              placeholder={tx('Kết quả hệ thống phải trả về...', 'Expected system response...')}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 disabled:bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface TestCaseDrawerProps {
  projectId: string;
  caseId: string | 'new' | null;
  defaultSuiteId: string | null;
  suitesFlat: SuiteDto[];
  jiraBaseUrl?: string | null;
  canEdit: boolean;
  canManage?: boolean;
  onCopyToProject?: (tc: { id: string; code: string; title: string }) => void;
  onClose: () => void;
  onSaved: () => void;
}

export function TestCaseDrawer({
  projectId,
  caseId,
  defaultSuiteId,
  suitesFlat,
  jiraBaseUrl,
  canEdit,
  canManage = false,
  onCopyToProject,
  onClose,
  onSaved,
}: TestCaseDrawerProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { tx, lang } = useLanguage();
  const dateLocale = lang === 'en' ? 'en-US' : 'vi-VN';
  const versionActionLabel = (action: keyof typeof VERSION_ACTION_STYLE) => {
    switch (action) {
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
        return String(action);
    }
  };
  const isNew = caseId === 'new';

  const { data: detail, isLoading } = useQuery({
    queryKey: ['case-detail', projectId, caseId],
    queryFn: () => api.getCase(projectId, caseId!),
    enabled: Boolean(caseId && caseId !== 'new'),
  });

  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ['case-versions', projectId, caseId],
    queryFn: () => api.listCaseVersions(projectId, caseId!),
    enabled: Boolean(caseId && caseId !== 'new'),
  });

  const { data: sharedSteps = [] } = useQuery({
    queryKey: ['shared-steps', projectId],
    queryFn: () => api.listSharedSteps(projectId),
    enabled: Boolean(projectId),
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ['case-comments', projectId, caseId],
    queryFn: () => api.listCaseComments(projectId, caseId!),
    enabled: Boolean(caseId && caseId !== 'new'),
  });

  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'comments'>('details');
  const [showSharedPicker, setShowSharedPicker] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [suiteId, setSuiteId] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [severity, setSeverity] = useState<Severity>('NORMAL');
  const [type, setType] = useState<TestCaseType>('FUNCTIONAL');
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus>('MANUAL');
  const [status, setStatus] = useState<TestCaseStatus>('ACTIVE');
  const [preconditions, setPreconditions] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [jiraKeys, setJiraKeys] = useState<string[]>([]);
  const [jiraInput, setJiraInput] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab('details');
    setExpandedVersionId(null);
    setCompareVersionId(null);
    setShowSharedPicker(false);
    setCommentDraft('');
  }, [caseId]);

  useEffect(() => {
    setError(null);
    if (isNew) {
      setTitle('');
      setSuiteId(defaultSuiteId && defaultSuiteId !== 'uncategorized' ? defaultSuiteId : '');
      setPriority('MEDIUM');
      setSeverity('NORMAL');
      setType('FUNCTIONAL');
      setAutomationStatus('MANUAL');
      setStatus('ACTIVE');
      setPreconditions('');
      setDescription('');
      setTags([]);
      setJiraKeys([]);
      setSteps([
        { clientId: crypto.randomUUID(), action: '', data: '', expectedResult: '' },
      ]);
    } else if (detail) {
      setTitle(detail.title);
      setSuiteId(detail.suiteId || '');
      setPriority(detail.priority);
      setSeverity(detail.severity);
      setType(detail.type);
      setAutomationStatus(detail.automationStatus);
      setStatus(detail.status);
      setPreconditions(detail.preconditions || '');
      setDescription(detail.description || '');
      setTags(detail.tags || []);
      setJiraKeys(detail.jiraIssueKeys || []);
      setSteps(
        detail.steps.map((s) => ({
          clientId: s.id || crypto.randomUUID(),
          action: s.action,
          data: s.data,
          expectedResult: s.expectedResult,
          sharedStepId: s.sharedStepId ?? null,
          sharedStepTitle: s.sharedStepTitle ?? null,
        })),
      );
    }
  }, [isNew, detail, defaultSuiteId]);

  const saveMutation = useMutation({
    mutationFn: async (overrideStatus?: TestCaseStatus) => {
      const targetStatus = overrideStatus ?? status;
      const payload = {
        suiteId: suiteId || null,
        title: title.trim(),
        description,
        preconditions,
        priority,
        severity,
        type,
        automationStatus,
        status: targetStatus,
        tags,
        jiraIssueKeys: jiraKeys,
        steps: steps
          .filter(
            (s) =>
              Boolean(s.sharedStepId) ||
              s.action.trim() ||
              s.expectedResult.trim() ||
              s.data.trim(),
          )
          .map((s) => ({
            action: s.sharedStepId
              ? s.sharedStepTitle || s.action || 'Shared Step'
              : s.action,
            data: s.data,
            expectedResult: s.expectedResult,
            sharedStepId: s.sharedStepId ?? null,
          })),
      };
      if (isNew) {
        return api.createCase(projectId, payload);
      }
      return api.updateCase(projectId, caseId!, payload);
    },
    onSuccess: (saved) => {
      setStatus(saved.status);
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['shared-steps', projectId] });
      queryClient.invalidateQueries({ queryKey: ['case-detail', projectId, saved.id] });
      queryClient.invalidateQueries({ queryKey: ['case-versions', projectId, saved.id] });
      queryClient.invalidateQueries({ queryKey: ['project-history', projectId] });
      toast.success(
        isNew
          ? tx(
              `Đã tạo Test Case ${saved.code} thành công!`,
              `Created Test Case ${saved.code} successfully!`,
            )
          : tx(
              `Đã lưu Test Case ${saved.code} (v${saved.currentVersion})`,
              `Saved Test Case ${saved.code} (v${saved.currentVersion})`,
            ),
      );
      onSaved();
      if (isNew) onClose();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : tx('Lỗi lưu Test Case', 'Failed to save Test Case');
      setError(msg);
      toast.error(msg);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => api.restoreCaseVersion(projectId, caseId!, versionId),
    onSuccess: (restored) => {
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['case-detail', projectId, restored.id] });
      queryClient.invalidateQueries({ queryKey: ['case-versions', projectId, restored.id] });
      queryClient.invalidateQueries({ queryKey: ['project-history', projectId] });
      toast.success(
        tx(
          `Đã khôi phục Test Case ${restored.code} lên phiên bản v${restored.currentVersion}`,
          `Restored Test Case ${restored.code} to version v${restored.currentVersion}`,
        ),
      );
      setActiveTab('details');
    },
    onError: (err) => {
      const msg =
        err instanceof Error
          ? err.message
          : tx('Lỗi khôi phục phiên bản', 'Failed to restore version');
      setError(msg);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteCase(projectId, caseId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['suites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      queryClient.invalidateQueries({ queryKey: ['shared-steps', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-history', projectId] });
      toast.success(
        tx(
          `Đã chuyển Test Case ${detail?.code || ''} vào Thùng rác`.trim(),
          `Moved Test Case ${detail?.code || ''} to Trash`.trim(),
        ),
      );
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể xóa Test Case', 'Failed to delete Test Case')),
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => api.addCaseComment(projectId, caseId!, content),
    onSuccess: () => {
      setCommentDraft('');
      queryClient.invalidateQueries({ queryKey: ['case-comments', projectId, caseId] });
      toast.success(tx('Đã thêm bình luận', 'Comment added'));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể thêm bình luận', 'Failed to add comment')),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => api.deleteCaseComment(projectId, caseId!, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-comments', projectId, caseId] });
      toast.success(tx('Đã xóa bình luận', 'Comment deleted'));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể xóa bình luận', 'Failed to delete comment')),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadAttachment(projectId, caseId!, file),
    onSuccess: (att) => {
      queryClient.invalidateQueries({ queryKey: ['case-detail', projectId, caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      toast.success(tx(`Đã tải lên tệp "${att.fileName}"`, `Uploaded file "${att.fileName}"`));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể tải tệp lên', 'Failed to upload file')),
  });

  const deleteAttMutation = useMutation({
    mutationFn: (attId: string) => api.deleteAttachment(attId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-detail', projectId, caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases', projectId] });
      toast.success(tx('Đã xóa tệp đính kèm', 'Attachment deleted'));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tx('Không thể xóa tệp đính kèm', 'Failed to delete attachment')),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleStepDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex((s) => s.clientId === active.id);
    const newIndex = steps.findIndex((s) => s.clientId === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      setSteps(arrayMove(steps, oldIndex, newIndex));
    }
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };

  const addJiraKey = () => {
    const v = jiraInput.trim().toUpperCase();
    if (v && !jiraKeys.includes(v)) setJiraKeys([...jiraKeys, v]);
    setJiraInput('');
  };

  if (!caseId) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-[#11131A]/35 backdrop-blur-[1px]" onClick={onClose} />
      <div className="animate-drawer relative z-50 w-full max-w-3xl bg-white h-full shadow-2xl border-l border-hairline flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between bg-canvas/70">
          <div className="flex items-center gap-2 min-w-0">
            {!isNew && detail && (
              <>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200 shrink-0">
                  {detail.code}
                </span>
                <span
                  className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 tabular-nums ${STATUS_STYLE[detail.status]?.className ?? 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                >
                  v{detail.currentVersion || 1} · {STATUS_STYLE[detail.status]?.label ?? detail.status}
                </span>
              </>
            )}
            <h2 className="font-bold text-ink tracking-[-0.01em] truncate">
              {isNew
                ? tx('Tạo Test Case mới', 'New Test Case')
                : tx('Chi tiết Test Case', 'Test Case Details')}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {onCopyToProject && !isNew && detail && (
              <button
                type="button"
                onClick={() =>
                  onCopyToProject({ id: detail.id, code: detail.code, title: detail.title })
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-hairline hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                title={tx('Nhân bản Test Case sang dự án khác', 'Duplicate Test Case to another project')}
                aria-label={tx('Nhân bản Test Case sang dự án khác', 'Duplicate Test Case to another project')}
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tx('Copy sang dự án', 'Copy to project')}</span>
              </button>
            )}
            {canEdit && !isNew && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: tx(
                      `Xóa Test Case ${detail?.code || ''}?`,
                      `Delete Test Case ${detail?.code || ''}?`,
                    ).trim(),
                    description: tx(
                      'Test Case sẽ được chuyển vào Thùng rác và có thể khôi phục lại bất cứ lúc nào.',
                      'This Test Case will be moved to Trash and can be restored anytime.',
                    ),
                    confirmText: tx('Chuyển vào Thùng rác', 'Move to Trash'),
                    variant: 'danger',
                  });
                  if (ok) deleteMutation.mutate();
                }}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title={tx('Xóa Test Case', 'Delete Test Case')}
                aria-label={tx('Xóa Test Case', 'Delete Test Case')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {canEdit && activeTab === 'details' && (
              <button
                type="button"
                disabled={saveMutation.isPending || !title.trim()}
                onClick={() => saveMutation.mutate(undefined)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-xs shadow-brand-600/20 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? tx('Đang lưu...', 'Saving...') : tx('Lưu lại', 'Save')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={tx('Đóng', 'Close')}
              className="p-1.5 text-slate-400 hover:text-ink hover:bg-white rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Review Workflow Quick Banner */}
        {!isNew && detail && (detail.status === 'DRAFT' || detail.status === 'IN_REVIEW') && (
          <div className="px-5 py-2 border-b border-hairline bg-[#FAF7FC] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              {detail.status === 'DRAFT' ? (
                <span>
                  {tx(
                    'Bản nháp — gửi duyệt để QA Lead / Admin kiểm tra trước khi đưa vào chạy.',
                    'Draft — submit for review so QA Lead / Admin can approve before execution.',
                  )}
                </span>
              ) : (
                <span className="font-medium text-amber-800">
                  {tx(
                    'Đang chờ duyệt (In Review) — có thể trao đổi góp ý ở tab Thảo luận & Review.',
                    'Pending approval (In Review) — discuss feedback in the Comments & Review tab.',
                  )}
                </span>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1.5">
                {detail.status === 'DRAFT' && (
                  <button
                    type="button"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate('IN_REVIEW')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    {tx('Gửi duyệt (In Review)', 'Submit for Review')}
                  </button>
                )}
                {detail.status === 'IN_REVIEW' && canManage && (
                  <>
                    <button
                      type="button"
                      disabled={saveMutation.isPending}
                      onClick={() => saveMutation.mutate('DRAFT')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium cursor-pointer"
                    >
                      {tx('Trả về Draft', 'Return to Draft')}
                    </button>
                    <button
                      type="button"
                      disabled={saveMutation.isPending}
                      onClick={() => saveMutation.mutate('ACTIVE')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {tx('Duyệt → Active', 'Approve → Active')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Drawer Sub-tabs (Details vs Version History vs Review Comments) */}
        {!isNew && (
          <div className="px-5 border-b border-hairline bg-white flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'details'
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-ink'
              }`}
            >
              {tx('Nội dung & Steps', 'Details & Steps')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('comments')}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'comments'
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-ink'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {tx('Thảo luận & Review', 'Comments & Review')}
              <span className="font-mono tabular-nums text-[10px] px-1.5 py-0.2 rounded-full bg-canvas border border-hairline text-slate-600">
                {comments.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-ink'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              {tx('Lịch sử & Phiên bản', 'History & Versions')}
              <span className="font-mono tabular-nums text-[10px] px-1.5 py-0.2 rounded-full bg-canvas border border-hairline text-slate-600">
                {versions.length}
              </span>
            </button>
          </div>
        )}

        {/* Body */}
        {!isNew && activeTab === 'comments' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {commentsLoading ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  {tx('Đang tải thảo luận...', 'Loading comments...')}
                </div>
              ) : comments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
                  <MessageSquare className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-600">
                    {tx('Chưa có nhận xét nào', 'No comments yet')}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {tx(
                      'QA, QA Lead và PM có thể trao đổi góp ý cho Test Case này ngay tại đây.',
                      'QA, QA Lead, and PM can discuss feedback on this Test Case here.',
                    )}
                  </p>
                </div>
              ) : (
                comments.map((c) => {
                  const canRemove = c.authorId === user?.id || canManage;
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-hairline bg-white p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F5EBFA] text-[11px] font-bold text-[#851FB6]">
                            {c.authorName.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="text-xs font-semibold text-ink">{c.authorName}</span>
                          {c.authorRole && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-canvas border border-hairline text-slate-600">
                              {c.authorRole}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400">
                            {new Date(c.createdAt).toLocaleString(dateLocale, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => deleteCommentMutation.mutate(c.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title={tx('Xóa bình luận', 'Delete comment')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed pl-8">
                        {c.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-hairline bg-canvas/50 p-4">
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder={tx(
                    'Viết nhận xét review hoặc ghi chú cho Test Case này...',
                    'Write a review comment or note for this Test Case...',
                  )}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-brand-600 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!commentDraft.trim() || addCommentMutation.isPending}
                  onClick={() => addCommentMutation.mutate(commentDraft.trim())}
                  className="self-end inline-flex items-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {tx('Gửi', 'Send')}
                </button>
              </div>
            </div>
          </div>
        ) : !isNew && activeTab === 'history' ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {versionsLoading ? (
              <div className="py-10 text-center text-sm text-slate-400">
                {tx('Đang tải lịch sử phiên bản...', 'Loading version history...')}
              </div>
            ) : versions.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                {tx('Chưa có lịch sử phiên bản nào.', 'No version history yet.')}
              </div>
            ) : (
              versions.map((ver) => {
                const stateStyle = VERSION_STATE_STYLE[ver.versionState];
                const actStyle = VERSION_ACTION_STYLE[ver.action];
                const isExpanded = expandedVersionId === ver.id;
                return (
                  <div
                    key={ver.id}
                    className={`rounded-xl border p-4 space-y-2.5 ${
                      ver.versionState === 'ACTIVE'
                        ? 'bg-emerald-50/30 border-emerald-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          v{ver.versionNumber}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${stateStyle.className}`}
                        >
                          {stateStyle.label}
                        </span>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${actStyle.className}`}
                        >
                          {versionActionLabel(ver.action)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCompareVersionId(ver.id)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                            versions.length >= 2
                              ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                              : 'text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border-slate-200'
                          }`}
                        >
                          <GitCompareArrows className="w-3.5 h-3.5" />
                          {tx('So sánh', 'Compare')}
                        </button>
                        {canEdit && ver.versionState === 'OUTDATED' && (
                          <button
                            type="button"
                            disabled={restoreMutation.isPending}
                            onClick={async () => {
                              const ok = await confirm({
                                title: tx(
                                  `Khôi phục phiên bản v${ver.versionNumber}?`,
                                  `Restore version v${ver.versionNumber}?`,
                                ),
                                description: tx(
                                  'Hệ thống sẽ khôi phục toàn bộ nội dung của phiên bản này và tạo một phiên bản Active mới.',
                                  'The system will restore all contents from this version and create a new Active version.',
                                ),
                                confirmText: tx('Khôi phục ngay', 'Restore Now'),
                                variant: 'primary',
                              });
                              if (ok) {
                                restoreMutation.mutate(ver.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {tx('Khôi phục bản này', 'Restore this version')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedVersionId(isExpanded ? null : ver.id)}
                          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg border border-slate-200 bg-white cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              {tx('Ẩn bản chụp', 'Hide snapshot')}{' '}
                              <ChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              {tx('Xem bản chụp', 'View snapshot')}{' '}
                              <ChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 font-medium">{ver.summary}</div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        {ver.changedByName || tx('Hệ thống', 'System')}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {new Date(ver.createdAt).toLocaleString(dateLocale)}
                      </span>
                    </div>

                    {ver.changes.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 space-y-1.5">
                        {ver.changes.map((diff, idx) => (
                          <div
                            key={`${diff.field}-${idx}`}
                            className="text-xs flex flex-wrap items-center gap-1.5"
                          >
                            <span className="font-semibold text-slate-700 min-w-[105px]">
                              {diff.label}:
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200/70 line-through max-w-[220px] truncate">
                              {diff.oldValue}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/70 font-medium max-w-[220px] truncate">
                              {diff.newValue}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isExpanded && (
                      <div className="pt-2.5 border-t border-slate-100 space-y-2 text-xs">
                        <div>
                          <span className="text-slate-400">{tx('Tiêu đề:', 'Title:')}</span>{' '}
                          <strong className="text-slate-800">{ver.snapshot.title}</strong>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            Suite: {ver.snapshot.suiteTitle || tx('Chưa phân loại', 'Uncategorized')}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            Priority: {ver.snapshot.priority}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            Automation: {ver.snapshot.automationStatus}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            Steps: {ver.snapshot.steps?.length ?? 0}
                          </span>
                        </div>
                        {ver.snapshot.steps && ver.snapshot.steps.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {ver.snapshot.steps.map((st, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded bg-slate-50 border border-slate-200/80 text-[11px]"
                              >
                                <span className="font-semibold text-indigo-700">
                                  {tx('Bước', 'Step')} {idx + 1}:
                                </span>{' '}
                                {st.action || '—'}
                                {st.expectedResult && (
                                  <div className="text-slate-500 mt-0.5">
                                    → Expected: {st.expectedResult}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : !isNew && isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {tx('Đang tải chi tiết...', 'Loading details...')}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {error && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {tx('Tiêu đề Test Case *', 'Test Case Title *')}
              </label>
              <input
                disabled={!canEdit}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tx(
                  'VD: Đăng nhập thành công với Email và mật khẩu hợp lệ',
                  'e.g. Successfully log in with valid Email and password',
                )}
                className="w-full px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-50"
              />
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-canvas/70 p-3.5 rounded-xl border border-hairline">
              <div className="col-span-2 sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Test Suite
                </label>
                <Select
                  disabled={!canEdit}
                  value={suiteId}
                  onChange={setSuiteId}
                  size="xs"
                  className="w-full py-1.5"
                  options={[
                    { value: '', label: tx('— Chưa phân loại (No Suite) —', '— Uncategorized (No Suite) —') },
                    ...suitesFlat.map((s) => ({
                      value: s.id,
                      label: s.parentId ? `↳ ${s.title}` : s.title,
                    })),
                  ]}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Priority
                </label>
                <Select
                  disabled={!canEdit}
                  value={priority}
                  onChange={(v) => setPriority(v as Priority)}
                  size="xs"
                  className="w-full py-1.5"
                  options={PRIORITIES.map((p) => ({
                    value: p,
                    label: PRIORITY_STYLE[p].label,
                    dotClassName: PRIORITY_STYLE[p].dot,
                  }))}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Severity
                </label>
                <Select
                  disabled={!canEdit}
                  value={severity}
                  onChange={(v) => setSeverity(v as Severity)}
                  size="xs"
                  className="w-full py-1.5"
                  options={SEVERITIES.map((s) => ({
                    value: s,
                    label: SEVERITY_LABEL[s],
                    dotClassName:
                      s === 'BLOCKER'
                        ? 'bg-rose-600'
                        : s === 'CRITICAL'
                          ? 'bg-rose-500'
                          : s === 'MAJOR'
                            ? 'bg-amber-500'
                            : s === 'NORMAL'
                              ? 'bg-sky-500'
                              : s === 'MINOR'
                                ? 'bg-slate-400'
                                : 'bg-slate-300',
                  }))}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Type</label>
                <Select
                  disabled={!canEdit}
                  value={type}
                  onChange={(v) => setType(v as TestCaseType)}
                  size="xs"
                  className="w-full py-1.5"
                  options={TEST_CASE_TYPES.map((t) => ({
                    value: t,
                    label: TYPE_LABEL[t],
                  }))}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Automation
                </label>
                <Select
                  disabled={!canEdit}
                  value={automationStatus}
                  onChange={(v) => setAutomationStatus(v as AutomationStatus)}
                  size="xs"
                  className="w-full py-1.5"
                  options={AUTOMATION_STATUSES.map((a) => ({
                    value: a,
                    label: AUTOMATION_STYLE[a].label,
                  }))}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  {tx('Trạng thái', 'Status')}
                </label>
                <Select
                  disabled={!canEdit}
                  value={status}
                  onChange={(v) => setStatus(v as TestCaseStatus)}
                  size="xs"
                  className="w-full py-1.5"
                  options={TEST_CASE_STATUSES.map((st) => ({
                    value: st,
                    label: STATUS_STYLE[st].label,
                    dotClassName:
                      st === 'ACTIVE'
                        ? 'bg-emerald-500'
                        : st === 'DRAFT'
                          ? 'bg-amber-500'
                          : 'bg-slate-400',
                  }))}
                />
              </div>
            </div>

            {/* Jira & Tags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Jira Issue Keys (Story / Task / Bug)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {jiraKeys.map((key) => {
                    const href = jiraBaseUrl
                      ? safeExternalHttpUrl(`${jiraBaseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(key)}`)
                      : null;
                    return (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            {key}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          key
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setJiraKeys(jiraKeys.filter((k) => k !== key))}
                            className="hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                {canEdit && (
                  <div className="flex gap-1.5">
                    <input
                      value={jiraInput}
                      onChange={(e) => setJiraInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addJiraKey();
                        }
                      }}
                      placeholder={tx('VD: ECOM-101 rồi Enter', 'e.g. ECOM-101 then Enter')}
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={addJiraKey}
                      className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      {tx('Thêm', 'Add')}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                    >
                      #{tag}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setTags(tags.filter((t) => t !== tag))}
                          className="hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {canEdit && (
                  <div className="flex gap-1.5">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder={tx('VD: smoke, payment rồi Enter', 'e.g. smoke, payment then Enter')}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      {tx('Thêm', 'Add')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Preconditions & Description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Điều kiện tiên quyết (Pre-conditions)', 'Pre-conditions')}
                </label>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={preconditions}
                  onChange={(e) => setPreconditions(e.target.value)}
                  placeholder={tx(
                    'Dữ liệu/trạng thái cần chuẩn bị trước khi chạy test...',
                    'Data or state required before running the test...',
                  )}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Mô tả', 'Description')}
                </label>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={tx(
                    'Mục tiêu kiểm thử và ghi chú nghiệp vụ...',
                    'Test objective and business notes...',
                  )}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* Steps Builder */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  {tx('Các bước thực hiện', 'Test Steps')} ({steps.length})
                </label>
                {canEdit && (
                  <div className="relative flex items-center gap-1.5">
                    {sharedSteps.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowSharedPicker((prev) => !prev)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#851FB6] bg-[#F5EBFA] hover:bg-[#EEDCF8] px-2.5 py-1 rounded-md cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5" />{' '}
                          {tx('Chèn Shared Step', 'Insert Shared Step')}
                        </button>
                        {showSharedPicker && (
                          <div className="absolute right-0 mt-1 z-30 w-72 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg p-1.5 space-y-1">
                            {sharedSteps.map((ss) => (
                              <button
                                key={ss.id}
                                type="button"
                                onClick={() => {
                                  setSteps((prev) => [
                                    ...prev,
                                    {
                                      clientId: crypto.randomUUID(),
                                      action: ss.title,
                                      data: '',
                                      expectedResult: '',
                                      sharedStepId: ss.id,
                                      sharedStepTitle: ss.title,
                                    },
                                  ]);
                                  setShowSharedPicker(false);
                                }}
                                className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-[#FAF7FC] transition-colors cursor-pointer"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-[11px] font-bold text-[#851FB6]">
                                    {ss.code}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {ss.steps.length}{' '}
                                    {tx('bước', ss.steps.length === 1 ? 'step' : 'steps')}
                                  </span>
                                </div>
                                <div className="text-xs font-medium text-slate-800 truncate">
                                  {ss.title}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setSteps([
                          ...steps,
                          { clientId: crypto.randomUUID(), action: '', data: '', expectedResult: '' },
                        ])
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-md cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> {tx('Thêm bước', 'Add Step')}
                    </button>
                  </div>
                )}
              </div>

              {steps.length === 0 ? (
                <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-5 text-center">
                  {tx('Chưa có bước thực hiện nào.', 'No test steps yet.')}
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleStepDragEnd}
                >
                  <SortableContext
                    items={steps.map((s) => s.clientId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2.5">
                      {steps.map((step, idx) => (
                        <SortableStepRow
                          key={step.clientId}
                          step={step}
                          index={idx}
                          canEdit={canEdit}
                          sharedStepCatalog={sharedSteps}
                          onChange={(field, val) =>
                            setSteps((prev) =>
                              prev.map((item) =>
                                item.clientId === step.clientId
                                  ? { ...item, [field]: val }
                                  : item,
                              ),
                            )
                          }
                          onRemove={() =>
                            setSteps((prev) =>
                              prev.filter((item) => item.clientId !== step.clientId),
                            )
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* Attachments (for saved cases) */}
            {!isNew && detail && (
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    {tx('Tệp đính kèm', 'Attachments')} ({detail.attachments.length})
                  </label>
                  {canEdit && (
                    <label className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-md cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadMutation.isPending
                        ? tx('Đang tải lên...', 'Uploading...')
                        : tx('Tải tệp lên', 'Upload file')}
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadMutation.mutate(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                {detail.attachments.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    {tx(
                      'Chưa có hình ảnh hoặc tài liệu đính kèm.',
                      'No attached images or documents yet.',
                    )}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {detail.attachments.map((att) => {
                      const isImage = att.mimeType.startsWith('image/');
                      const url = api.getAttachmentUrl(att.url);
                      return (
                        <div
                          key={att.id}
                          className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 bg-slate-50/50"
                        >
                          {isImage ? (
                            <img
                              src={url}
                              alt={att.fileName}
                              className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-800 truncate">
                              {att.fileName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {formatBytes(att.fileSize)}
                            </div>
                          </div>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 rounded"
                            title={tx('Mở / Tải xuống', 'Open / Download')}
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => deleteAttMutation.mutate(att.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title={tx('Xóa tệp đính kèm', 'Delete attachment')}
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
            )}

            {!isNew && detail && (
              <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 flex justify-between">
                <span>
                  {tx('Tạo bởi:', 'Created by:')} {detail.createdByName || '—'}
                </span>
                <span>
                  {tx('Cập nhật:', 'Updated:')} {detail.updatedByName || '—'} ·{' '}
                  {new Date(detail.updatedAt).toLocaleString(dateLocale)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {compareVersionId && detail && (
        <VersionCompareModal
          projectId={projectId}
          caseCode={detail.code}
          targetVersionId={compareVersionId}
          onClose={() => setCompareVersionId(null)}
        />
      )}
    </div>
  );
}
