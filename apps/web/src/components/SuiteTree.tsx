import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  CornerLeftUp,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Inbox,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { SuiteDto } from '@tcms/shared';
import { useLanguage } from '../contexts/LanguageContext';

export interface SuiteMovePayload {
  suiteId: string;
  parentId: string | null;
  orderedSiblingIds: string[];
}

interface SuiteTreeProps {
  tree: SuiteDto[];
  totalProjectCases: number;
  uncategorizedCases: number;
  selectedSuiteId: string | null;
  canEdit: boolean;
  onSelect: (suiteId: string | null) => void;
  onCreateSuite: (parentId: string | null) => void;
  onRenameSuite: (suite: SuiteDto) => void;
  onDeleteSuite: (suite: SuiteDto) => void;
  onMoveSuite: (payload: SuiteMovePayload) => void;
  onCopySuite?: (suite: SuiteDto) => void;
}

type DropPosition = 'before' | 'inside' | 'after';

interface DropTargetState {
  targetId: string;
  position: DropPosition;
}

export function collectDescendantIds(root: SuiteDto): Set<string> {
  const ids = new Set<string>([root.id]);
  const walk = (nodes?: SuiteDto[]) => {
    if (!nodes) return;
    for (const n of nodes) {
      ids.add(n.id);
      walk(n.children);
    }
  };
  walk(root.children);
  return ids;
}

export function SuiteTree({
  tree,
  totalProjectCases,
  uncategorizedCases,
  selectedSuiteId,
  canEdit,
  onSelect,
  onCreateSuite,
  onRenameSuite,
  onDeleteSuite,
  onMoveSuite,
  onCopySuite,
}: SuiteTreeProps) {
  const { tx } = useLanguage();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newlyAdded: string[] = [];
    const walk = (nodes: SuiteDto[]) => {
      for (const n of nodes) {
        if (!seenIdsRef.current.has(n.id)) {
          seenIdsRef.current.add(n.id);
          newlyAdded.push(n.id);
        }
        if (n.children && n.children.length > 0) walk(n.children);
      }
    };
    walk(tree);
    if (newlyAdded.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of newlyAdded) next.add(id);
        return next;
      });
    }
  }, [tree]);

  const [draggedSuite, setDraggedSuite] = useState<SuiteDto | null>(null);
  const draggedSuiteRef = useRef<SuiteDto | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const dropTargetRef = useRef<DropTargetState | null>(null);
  const [overRootZone, setOverRootZone] = useState(false);

  const updateDropTarget = (next: DropTargetState | null) => {
    const prev = dropTargetRef.current;
    if (prev?.targetId === next?.targetId && prev?.position === next?.position) return;
    dropTargetRef.current = next;
    setDropTarget(next);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Map parentId -> children array for quick sibling computation
  const childrenByParent = useMemo(() => {
    const byParent = new Map<string | null, SuiteDto[]>();
    byParent.set(null, tree);

    const walk = (nodes: SuiteDto[]) => {
      for (const n of nodes) {
        byParent.set(n.id, n.children ?? []);
        if (n.children && n.children.length > 0) {
          walk(n.children);
        }
      }
    };
    walk(tree);
    return byParent;
  }, [tree]);

  const forbiddenTargetIds = useMemo(() => {
    if (!draggedSuite) return new Set<string>();
    return collectDescendantIds(draggedSuite);
  }, [draggedSuite]);

  const resetDrag = () => {
    draggedSuiteRef.current = null;
    dropTargetRef.current = null;
    setDraggedSuite(null);
    setDropTarget(null);
    setOverRootZone(false);
  };

  const executeDropOnNode = (target: SuiteDto, position: DropPosition) => {
    const active = draggedSuiteRef.current;
    if (!active) return;
    const forbidden = collectDescendantIds(active);
    if (forbidden.has(target.id)) return;

    if (position === 'inside') {
      const existingChildren = (childrenByParent.get(target.id) ?? []).filter(
        (c) => c.id !== active.id,
      );
      const orderedSiblingIds = [...existingChildren.map((c) => c.id), active.id];
      setExpandedIds((prev) => new Set(prev).add(target.id));
      onMoveSuite({
        suiteId: active.id,
        parentId: target.id,
        orderedSiblingIds,
      });
      return;
    }

    const nextParentId = target.parentId ?? null;
    if (nextParentId && forbidden.has(nextParentId)) return;

    const siblingsWithoutDragged = (childrenByParent.get(nextParentId) ?? []).filter(
      (s) => s.id !== active.id,
    );
    const targetIdx = siblingsWithoutDragged.findIndex((s) => s.id === target.id);
    const insertIdx =
      targetIdx === -1
        ? siblingsWithoutDragged.length
        : position === 'before'
          ? targetIdx
          : targetIdx + 1;

    const orderedSiblingIds = siblingsWithoutDragged.map((s) => s.id);
    orderedSiblingIds.splice(insertIdx, 0, active.id);

    onMoveSuite({
      suiteId: active.id,
      parentId: nextParentId,
      orderedSiblingIds,
    });
  };

  const promoteToRoot = (suite: SuiteDto) => {
    const rootsWithoutSuite = (childrenByParent.get(null) ?? []).filter((s) => s.id !== suite.id);
    onMoveSuite({
      suiteId: suite.id,
      parentId: null,
      orderedSiblingIds: [...rootsWithoutSuite.map((s) => s.id), suite.id],
    });
  };

  const isDraggingSubSuite = Boolean(draggedSuite && draggedSuite.parentId !== null);

  const renderNode = (node: SuiteDto, depth: number) => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedSuiteId === node.id;
    const isBeingDragged = draggedSuite?.id === node.id;
    const isForbidden = draggedSuite ? forbiddenTargetIds.has(node.id) : false;
    const currentDrop =
      dropTarget && dropTarget.targetId === node.id && !isForbidden ? dropTarget.position : null;

    return (
      <div key={node.id} className="relative">
        {/* Zero-layout-shift absolute insertion lines */}
        <div
          draggable={canEdit}
          onDragStart={(e) => {
            if (!canEdit) return;
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.id);
            draggedSuiteRef.current = node;
            // Defer React state update by 1 frame so Chromium captures the drag ghost
            // cleanly without aborting the drag session on sub-suites
            requestAnimationFrame(() => {
              if (draggedSuiteRef.current?.id === node.id) {
                setDraggedSuite(node);
              }
            });
          }}
          onDragOver={(e) => {
            const active = draggedSuiteRef.current;
            if (!canEdit || !active) return;
            if (collectDescendantIds(active).has(node.id)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            const rect = e.currentTarget.getBoundingClientRect();
            const relY = (e.clientY - rect.top) / Math.max(rect.height, 1);
            const nextPos: DropPosition =
              relY < 0.25 ? 'before' : relY > 0.75 ? 'after' : 'inside';
            updateDropTarget({ targetId: node.id, position: nextPos });
            if (overRootZone) setOverRootZone(false);
          }}
          onDrop={(e) => {
            const active = draggedSuiteRef.current;
            if (!canEdit || !active) return;
            e.preventDefault();
            e.stopPropagation();
            const current = dropTargetRef.current;
            const pos = current?.targetId === node.id ? current.position : 'inside';
            executeDropOnNode(node, pos);
            resetDrag();
          }}
          onDragEnd={() => resetDrag()}
          onClick={() => onSelect(node.id)}
          style={{ paddingLeft: `${10 + depth * 16}px` }}
          className={`group relative flex items-center gap-1 pr-2 py-1.5 rounded-lg text-[13px] cursor-pointer select-none border-l-2 ${
            isBeingDragged ? 'opacity-40' : ''
          } ${
            currentDrop === 'inside'
              ? 'bg-brand-50 text-brand-700 ring-2 ring-inset ring-brand-500 border-brand-600'
              : isSelected
                ? 'bg-brand-50 text-brand-700 font-semibold border-brand-600'
                : 'text-slate-700 hover:bg-canvas border-transparent'
          }`}
        >
          {currentDrop === 'before' && (
            <div
              style={{ left: `${10 + depth * 16}px` }}
              className="absolute right-1 -top-px h-0.5 bg-brand-600 rounded-full pointer-events-none z-20"
            >
              <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand-600" />
            </div>
          )}

          {currentDrop === 'after' && (
            <div
              style={{ left: `${10 + depth * 16}px` }}
              className="absolute right-1 -bottom-px h-0.5 bg-brand-600 rounded-full pointer-events-none z-20"
            >
              <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand-600" />
            </div>
          )}

          {canEdit && (
            <span
              onClick={(e) => e.stopPropagation()}
              className={`text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 cursor-grab shrink-0 ${
                draggedSuite ? 'pointer-events-none' : ''
              }`}
              title={tx(
                'Kéo vào giữa suite khác để làm sub-suite, hoặc kéo lên/xuống để sắp xếp & tách ra',
                'Drag onto another suite to nest as sub-suite, or drag up/down to reorder & unnest',
              )}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(node.id);
            }}
            aria-label={isExpanded ? tx('Thu gọn', 'Collapse') : tx('Mở rộng', 'Expand')}
            className={`w-4 h-4 flex items-center justify-center text-slate-400 shrink-0 ${
              hasChildren ? 'hover:text-ink cursor-pointer' : 'invisible'
            } ${draggedSuite ? 'pointer-events-none' : ''}`}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {isSelected || isExpanded || currentDrop === 'inside' ? (
            <FolderOpen
              className={`w-4 h-4 text-brand-600 shrink-0 ${draggedSuite ? 'pointer-events-none' : ''}`}
            />
          ) : (
            <Folder
              className={`w-4 h-4 text-slate-400 shrink-0 ${draggedSuite ? 'pointer-events-none' : ''}`}
            />
          )}

          <span className={`truncate flex-1 ml-1 ${draggedSuite ? 'pointer-events-none' : ''}`}>
            {node.title}
          </span>

          {currentDrop === 'inside' ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-600 text-white shrink-0 pointer-events-none">
              ↳ Sub-suite
            </span>
          ) : (
            <span
              className={`text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded-full shrink-0 ${
                isSelected ? 'bg-brand-100 text-brand-700 font-semibold' : 'text-slate-400'
              } ${draggedSuite ? 'pointer-events-none' : ''}`}
            >
              {node.totalCaseCount}
            </span>
          )}

          {(canEdit || onCopySuite) && !draggedSuite && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="hidden group-hover:flex items-center gap-0.5 ml-1 shrink-0"
            >
              {canEdit && node.parentId && (
                <button
                  type="button"
                  onClick={() => promoteToRoot(node)}
                  title={tx('Tách ra thành Suite gốc (Root)', 'Promote to Root Suite')}
                  aria-label={tx('Tách ra thành Suite gốc', 'Promote to Root Suite')}
                  className="p-1 rounded-md hover:bg-white text-slate-500 hover:text-amber-600 cursor-pointer"
                >
                  <CornerLeftUp className="w-3.5 h-3.5" />
                </button>
              )}
              {onCopySuite && (
                <button
                  type="button"
                  onClick={() => onCopySuite(node)}
                  title={tx('Nhân bản Suite sang dự án khác', 'Duplicate Suite to another project')}
                  aria-label={tx('Nhân bản Suite sang dự án khác', 'Duplicate Suite to another project')}
                  className="p-1 rounded-md hover:bg-white text-slate-500 hover:text-brand-600 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => onCreateSuite(node.id)}
                    title={tx('Thêm sub-suite', 'Add sub-suite')}
                    aria-label={tx('Thêm sub-suite', 'Add sub-suite')}
                    className="p-1 rounded-md hover:bg-white text-slate-500 hover:text-brand-600 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRenameSuite(node)}
                    title={tx('Chỉnh sửa / Đổi Suite cha', 'Edit / Change Parent Suite')}
                    aria-label={tx('Đổi tên suite', 'Edit suite')}
                    className="p-1 rounded-md hover:bg-white text-slate-500 hover:text-brand-600 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSuite(node)}
                    title={tx('Xóa suite', 'Delete suite')}
                    aria-label={tx('Xóa suite', 'Delete suite')}
                    className="p-1 rounded-md hover:bg-white text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-72 shrink-0 bg-white border-r border-hairline flex flex-col min-h-0">
      <div className="px-3.5 py-3 border-b border-hairline/80 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">Test Suites</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => onCreateSuite(null)}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:bg-brand-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {tx('Suite mới', 'New Suite')}
          </button>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto p-2.5 space-y-1"
        onDragLeave={(e) => {
          if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) {
            updateDropTarget(null);
            setOverRootZone(false);
          }
        }}
      >
        {/* Doubles as zero-shift Root Drop Zone when dragging a sub-suite */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          onDragOver={(e) => {
            const active = draggedSuiteRef.current;
            if (!canEdit || !active || active.parentId === null) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setOverRootZone(true);
            updateDropTarget(null);
          }}
          onDragLeave={(e) => {
            if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) {
              setOverRootZone(false);
            }
          }}
          onDrop={(e) => {
            const active = draggedSuiteRef.current;
            if (!canEdit || !active || active.parentId === null) return;
            e.preventDefault();
            e.stopPropagation();
            promoteToRoot(active);
            resetDrag();
          }}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] transition-colors cursor-pointer border-l-2 ${
            isDraggingSubSuite
              ? overRootZone
                ? 'bg-brand-50 text-brand-700 font-semibold ring-2 ring-inset ring-brand-500 border-brand-600'
                : 'bg-amber-50/70 text-amber-800 font-medium border-amber-400 border border-dashed'
              : selectedSuiteId === null
                ? 'bg-brand-50 text-brand-700 font-semibold border-brand-600'
                : 'text-slate-700 hover:bg-canvas border-transparent'
          }`}
        >
          {isDraggingSubSuite ? (
            <span className="flex items-center gap-2 pointer-events-none">
              <CornerLeftUp className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {tx('Thả vào đây để tách ra Suite gốc', 'Drop here to promote to root')}
              </span>
            </span>
          ) : (
            <>
              <span className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-600" />
                {tx('Tất cả Test Cases', 'All Test Cases')}
              </span>
              <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded-full bg-white border border-hairline text-slate-600">
                {totalProjectCases}
              </span>
            </>
          )}
        </button>

        {uncategorizedCases > 0 && (
          <button
            type="button"
            onClick={() => onSelect('uncategorized')}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] transition-all cursor-pointer border-l-2 ${
              selectedSuiteId === 'uncategorized'
                ? 'bg-brand-50 text-brand-700 font-semibold border-brand-600'
                : 'text-slate-600 hover:bg-canvas border-transparent'
            }`}
          >
            <span className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-slate-400" />
              {tx('Chưa phân loại', 'Uncategorized')}
            </span>
            <span className="text-[11px] font-mono tabular-nums px-1.5 rounded-full bg-slate-100 text-slate-500">
              {uncategorizedCases}
            </span>
          </button>
        )}

        <div className="pt-2 border-t border-hairline/80 mt-2 space-y-0.5">
          {tree.length === 0 ? (
            <p className="text-xs text-slate-400 px-2.5 py-5 text-center">
              {tx('Chưa có Test Suite nào.', 'No Test Suites yet.')}
            </p>
          ) : (
            tree.map((node) => renderNode(node, 0))
          )}
        </div>
      </div>
    </aside>
  );
}
