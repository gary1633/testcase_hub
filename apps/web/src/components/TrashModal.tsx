import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, X, Folder, FileText, AlertTriangle } from 'lucide-react';
import type { TrashItemDto } from '@tcms/shared';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';

interface TrashModalProps {
  projectId: string;
  canEdit: boolean;
  canManage: boolean;
  onClose: () => void;
}

export function TrashModal({ projectId, canEdit, canManage, onClose }: TrashModalProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const { tx, lang } = useLanguage();
  const [confirmPermanentKey, setConfirmPermanentKey] = useState<string | null>(null);

  const trashQuery = useQuery({
    queryKey: ['trash', projectId],
    queryFn: () => api.listTrash(projectId),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['trash', projectId] });
    qc.invalidateQueries({ queryKey: ['cases', projectId] });
    qc.invalidateQueries({ queryKey: ['suites', projectId] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['project-history', projectId] });
  };

  const restoreMutation = useMutation({
    mutationFn: async (item: TrashItemDto): Promise<void> => {
      if (item.kind === 'SUITE') {
        await api.restoreSuite(projectId, item.id);
      } else {
        await api.restoreCaseFromTrash(projectId, item.id);
      }
    },
    onSuccess: (_res, item) => {
      invalidateAll();
      toast.success(
        item.kind === 'SUITE'
          ? tx(`Đã khôi phục Suite "${item.title}"`, `Restored Suite "${item.title}"`)
          : tx(
              `Đã khôi phục Test Case ${item.code ?? item.title}`,
              `Restored Test Case ${item.code ?? item.title}`,
            ),
      );
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : tx('Khôi phục thất bại', 'Restore failed'));
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (item: TrashItemDto): Promise<void> => {
      if (item.kind === 'SUITE') {
        await api.permanentDeleteSuite(projectId, item.id);
      } else {
        await api.permanentDeleteCase(projectId, item.id);
      }
    },
    onSuccess: (_res, item) => {
      invalidateAll();
      setConfirmPermanentKey(null);
      toast.success(
        item.kind === 'SUITE'
          ? tx(
              `Đã xóa vĩnh viễn Suite "${item.title}"`,
              `Permanently deleted Suite "${item.title}"`,
            )
          : tx(
              `Đã xóa vĩnh viễn Test Case ${item.code ?? item.title}`,
              `Permanently deleted Test Case ${item.code ?? item.title}`,
            ),
      );
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Xóa vĩnh viễn thất bại', 'Permanent deletion failed'),
      );
    },
  });

  const items = trashQuery.data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#11131A]/45 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#EAECF0] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EAECF0] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEF3F2] text-[#D92D20]">
              <Trash2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[#101828]">
                {tx('Thùng rác', 'Trash')} ({items.length})
              </h2>
              <p className="text-[12px] text-[#667085]">
                {tx(
                  'Các Test Case và Suite đã xóa mềm có thể khôi phục nguyên trạng kèm bước & file đính kèm',
                  'Soft-deleted Test Cases and Suites can be fully restored with all steps & attachments',
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#667085] hover:bg-[#F2F4F7] hover:text-[#101828]"
            aria-label={tx('Đóng', 'Close')}
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {trashQuery.isLoading ? (
            <div className="py-12 text-center text-[13px] text-[#667085]">
              {tx('Đang tải thùng rác...', 'Loading trash...')}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D0D5DD] bg-[#F9FAFB] py-12 text-center">
              <Trash2 className="mx-auto mb-2 h-8 w-8 text-[#98A2B3]" />
              <p className="text-[13.5px] font-semibold text-[#101828]">
                {tx('Thùng rác đang trống', 'Trash is empty')}
              </p>
              <p className="mt-1 text-[12.5px] text-[#667085]">
                {tx(
                  'Các Test Case hoặc Suite bị xóa sẽ xuất hiện tại đây để bạn khôi phục khi cần.',
                  'Deleted Test Cases or Suites will appear here so you can restore them anytime.',
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => {
                const rowKey = `${item.kind}:${item.id}`;
                const isConfirming = confirmPermanentKey === rowKey;
                return (
                  <div
                    key={rowKey}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EAECF0] bg-white px-4 py-3 hover:border-[#D0D5DD]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.kind === 'SUITE' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#F2F4F7] px-2 py-0.5 text-[11px] font-semibold text-[#344054]">
                            <Folder className="h-3 w-3 text-[#851FB6]" />
                            Suite
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#F5EBFA] px-2 py-0.5 font-mono text-[11px] font-bold text-[#851FB6]">
                            <FileText className="h-3 w-3" />
                            {item.code ?? 'CASE'}
                          </span>
                        )}
                        <span className="truncate text-[13.5px] font-semibold text-[#101828]">
                          {item.title}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-[#667085]">
                        {item.suiteTitle && (
                          <span>
                            {tx('Thuộc Suite:', 'Suite:')} {item.suiteTitle}
                          </span>
                        )}
                        <span>•</span>
                        <span>
                          {tx('Xóa lúc', 'Deleted at')}{' '}
                          {new Date(item.deletedAt).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                        {item.deletedByName && (
                          <>
                            <span>•</span>
                            <span>
                              {tx('bởi', 'by')} {item.deletedByName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {canEdit && (
                        <button
                          type="button"
                          disabled={restoreMutation.isPending}
                          onClick={() => restoreMutation.mutate(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#344054] hover:border-[#851FB6] hover:text-[#851FB6]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {tx('Khôi phục', 'Restore')}
                        </button>
                      )}
                      {canManage &&
                        (isConfirming ? (
                          <div className="flex items-center gap-1.5 rounded-lg border border-[#FECACA] bg-[#FEF3F2] px-2 py-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-[#D92D20]" />
                            <button
                              type="button"
                              disabled={permanentDeleteMutation.isPending}
                              onClick={() => permanentDeleteMutation.mutate(item)}
                              className="rounded bg-[#D92D20] px-2 py-0.5 text-[11.5px] font-semibold text-white hover:bg-[#B42318]"
                            >
                              {tx('Xóa hẳn', 'Delete forever')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmPermanentKey(null)}
                              className="px-1.5 text-[11.5px] text-[#475467] hover:text-[#101828]"
                            >
                              {tx('Hủy', 'Cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmPermanentKey(rowKey)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#FECACA] px-2.5 py-1.5 text-[12px] font-medium text-[#D92D20] hover:bg-[#FEF3F2]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {tx('Xóa vĩnh viễn', 'Delete permanently')}
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
