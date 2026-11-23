import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import type { SharedStepDto, SharedStepItemDto } from '@tcms/shared';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';

interface SharedStepsModalProps {
  projectId: string;
  canEdit: boolean;
  onClose: () => void;
}

const emptyStep = (): SharedStepItemDto => ({
  action: '',
  expectedResult: '',
  data: '',
});

export function SharedStepsModal({ projectId, canEdit, onClose }: SharedStepsModalProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const { tx } = useLanguage();

  const [editing, setEditing] = useState<SharedStepDto | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<SharedStepItemDto[]>([emptyStep()]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sharedStepsQuery = useQuery({
    queryKey: ['shared-steps', projectId],
    queryFn: () => api.listSharedSteps(projectId),
  });

  useEffect(() => {
    if (editing === 'new') {
      setTitle('');
      setSteps([emptyStep()]);
    } else if (editing) {
      setTitle(editing.title);
      setSteps(
        editing.steps.length > 0
          ? editing.steps.map((s) => ({
              action: s.action ?? '',
              expectedResult: s.expectedResult ?? '',
              data: s.data ?? '',
            }))
          : [emptyStep()],
      );
    }
  }, [editing]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['shared-steps', projectId] });
    qc.invalidateQueries({ queryKey: ['case'] });
    qc.invalidateQueries({ queryKey: ['cases', projectId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanedTitle = title.trim();
      if (!cleanedTitle) {
        throw new Error(tx('Vui lòng nhập tên Shared Step', 'Please enter a Shared Step title'));
      }
      const cleanedSteps: SharedStepItemDto[] = steps
        .filter((s) => s.action.trim() || s.expectedResult.trim() || s.data.trim())
        .map((s) => ({
          action: s.action.trim(),
          expectedResult: s.expectedResult.trim(),
          data: s.data.trim(),
        }));
      if (cleanedSteps.length === 0) {
        throw new Error(tx('Cần ít nhất 1 bước có nội dung', 'At least 1 non-empty step is required'));
      }
      if (editing === 'new') {
        return api.createSharedStep(projectId, { title: cleanedTitle, steps: cleanedSteps });
      }
      if (editing) {
        return api.updateSharedStep(projectId, editing.id, {
          title: cleanedTitle,
          steps: cleanedSteps,
        });
      }
      throw new Error('Invalid state');
    },
    onSuccess: (saved) => {
      invalidate();
      setEditing(null);
      toast.success(tx(`Đã lưu Shared Step ${saved.code}`, `Saved Shared Step ${saved.code}`));
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Lưu Shared Step thất bại', 'Failed to save Shared Step'),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSharedStep(projectId, id),
    onSuccess: () => {
      invalidate();
      setConfirmDeleteId(null);
      toast.success(
        tx(
          'Đã xóa Shared Step (các test case liên quan được giữ bước tách rời)',
          'Deleted Shared Step (linked test cases retained detached steps)',
        ),
      );
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Xóa Shared Step thất bại', 'Failed to delete Shared Step'),
      );
    },
  });

  const list = sharedStepsQuery.data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#11131A]/45 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#EAECF0] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EAECF0] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F5EBFA] text-[#851FB6]">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[#101828]">Shared Steps</h2>
              <p className="text-[12px] text-[#667085]">
                {tx(
                  'Tạo bộ bước dùng chung (ví dụ Đăng nhập, Mở ví, Xác thực OTP) để nhúng vào nhiều Test Case',
                  'Create reusable step groups (e.g. Login, Open Wallet, OTP Verification) to embed across multiple Test Cases',
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#851FB6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#70169C]"
              >
                <Plus className="h-3.5 w-3.5" />
                {tx('Tạo Shared Step', 'New Shared Step')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#667085] hover:bg-[#F2F4F7] hover:text-[#101828]"
              aria-label={tx('Đóng', 'Close')}
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {editing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-bold text-[#101828]">
                  {editing === 'new'
                    ? tx('Tạo Shared Step mới', 'Create New Shared Step')
                    : tx(`Chỉnh sửa ${editing.code}`, `Edit ${editing.code}`)}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-[12px] font-medium text-[#667085] hover:text-[#101828]"
                >
                  {tx('← Quay lại danh sách', '← Back to list')}
                </button>
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#344054]">
                  {tx('Tên Shared Step', 'Shared Step Title')}{' '}
                  <span className="text-[#D92D20]">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tx(
                    'Ví dụ: Đăng nhập thành công tài khoản FinX',
                    'e.g. Successfully log in to FinX account',
                  )}
                  className="w-full rounded-lg border border-[#D0D5DD] px-3 py-2 text-[13px] text-[#101828] focus:border-[#851FB6] focus:outline-hidden"
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#344054]">
                    {tx('Các bước chi tiết', 'Step Details')} ({steps.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => [...prev, emptyStep()])}
                    className="inline-flex items-center gap-1 rounded-md border border-[#D0D5DD] px-2.5 py-1 text-[12px] font-medium text-[#344054] hover:bg-[#F9FAFB]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {tx('Thêm bước', 'Add Step')}
                  </button>
                </div>

                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#EAECF0] bg-[#FCFCFD] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="inline-flex h-5 items-center rounded bg-[#F5EBFA] px-2 text-[11px] font-semibold text-[#851FB6]">
                        {tx('Bước', 'Step')} #{idx + 1}
                      </span>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-[11px] font-medium text-[#D92D20] hover:underline"
                        >
                          {tx('Xóa bước', 'Remove step')}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-[#475467]">
                          {tx('Thao tác (Action)', 'Action')}
                        </label>
                        <textarea
                          rows={2}
                          value={step.action}
                          onChange={(e) =>
                            setSteps((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, action: e.target.value } : s)),
                            )
                          }
                          placeholder={tx('Nhập thao tác...', 'Enter action...')}
                          className="w-full rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-[12.5px] focus:border-[#851FB6] focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-[#475467]">
                          {tx('Kết quả mong đợi (Expected Result)', 'Expected Result')}
                        </label>
                        <textarea
                          rows={2}
                          value={step.expectedResult}
                          onChange={(e) =>
                            setSteps((prev) =>
                              prev.map((s, i) =>
                                i === idx ? { ...s, expectedResult: e.target.value } : s,
                              ),
                            )
                          }
                          placeholder={tx('Nhập kết quả mong đợi...', 'Enter expected result...')}
                          className="w-full rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-[12.5px] focus:border-[#851FB6] focus:outline-hidden"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="mb-1 block text-[11px] font-medium text-[#475467]">
                        {tx('Test Data (tùy chọn)', 'Test Data (optional)')}
                      </label>
                      <input
                        type="text"
                        value={step.data ?? ''}
                        onChange={(e) =>
                          setSteps((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, data: e.target.value } : s,
                            ),
                          )
                        }
                        placeholder={tx(
                          'Ví dụ: phone=0901234567, otp=123456',
                          'e.g. phone=0901234567, otp=123456',
                        )}
                        className="w-full rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-[12.5px] focus:border-[#851FB6] focus:outline-hidden"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#EAECF0] pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-[#D0D5DD] px-3.5 py-1.5 text-[12.5px] font-medium text-[#344054] hover:bg-[#F9FAFB]"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#851FB6] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#70169C] disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" />
                  {saveMutation.isPending
                    ? tx('Đang lưu...', 'Saving...')
                    : tx('Lưu Shared Step', 'Save Shared Step')}
                </button>
              </div>
            </div>
          ) : sharedStepsQuery.isLoading ? (
            <div className="py-12 text-center text-[13px] text-[#667085]">
              {tx('Đang tải danh sách Shared Steps...', 'Loading Shared Steps...')}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D0D5DD] bg-[#F9FAFB] py-12 text-center">
              <Layers className="mx-auto mb-2 h-8 w-8 text-[#98A2B3]" />
              <p className="text-[13.5px] font-semibold text-[#101828]">
                {tx('Chưa có Shared Step nào trong dự án', 'No Shared Steps in this project yet')}
              </p>
              <p className="mt-1 text-[12.5px] text-[#667085]">
                {tx(
                  'Tạo bộ bước lặp lại như Đăng nhập, KYC hoặc Nhập PIN để tái sử dụng nhanh khi viết Test Case.',
                  'Create repeatable step groups like Login, KYC, or PIN entry to reuse quickly when authoring Test Cases.',
                )}
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing('new')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#851FB6] px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#70169C]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tx('Tạo Shared Step đầu tiên', 'Create First Shared Step')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#EAECF0] bg-white p-4 transition hover:border-[#D0D5DD]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-[#F5EBFA] px-2 py-0.5 font-mono text-[11px] font-bold text-[#851FB6]">
                          {item.code}
                        </span>
                        <h4 className="text-[13.5px] font-bold text-[#101828]">{item.title}</h4>
                        <span className="rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[11px] font-medium text-[#475467]">
                          {item.steps.length} {tx('bước', item.steps.length === 1 ? 'step' : 'steps')}
                        </span>
                        <span className="rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[11px] font-medium text-[#027A48]">
                          {tx(
                            `Đang dùng trong ${item.usedInCaseCount ?? 0} case`,
                            `Used in ${item.usedInCaseCount ?? 0} cases`,
                          )}
                        </span>
                      </div>
                      <ol className="mt-2.5 space-y-1.5 text-[12px] text-[#475467]">
                        {item.steps.map((s, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="font-mono text-[11px] font-semibold text-[#98A2B3]">
                              {idx + 1}.
                            </span>
                            <span>
                              <strong className="font-medium text-[#101828]">{s.action}</strong>
                              {s.expectedResult ? (
                                <span className="text-[#667085]"> → {s.expectedResult}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#D0D5DD] px-2.5 py-1 text-[12px] font-medium text-[#344054] hover:bg-[#F9FAFB]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {tx('Sửa', 'Edit')}
                        </button>
                        {confirmDeleteId === item.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(item.id)}
                              className="rounded-lg bg-[#D92D20] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#B42318]"
                            >
                              {tx('Xác nhận xóa', 'Confirm delete')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-[#D0D5DD] px-2 py-1 text-[12px] text-[#475467]"
                            >
                              {tx('Hủy', 'Cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#FECACA] px-2.5 py-1 text-[12px] font-medium text-[#D92D20] hover:bg-[#FEF3F2]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {tx('Xóa', 'Delete')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
