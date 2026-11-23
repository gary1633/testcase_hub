import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bug,
  FileText,
  FolderKanban,
  PlayCircle,
  Search,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { PRIORITY_STYLE, STATUS_STYLE } from '../lib/badges';
import { useLanguage } from '../contexts/LanguageContext';

interface PaletteItem {
  key: string;
  group: 'project' | 'case' | 'run' | 'defect';
  code?: string;
  title: string;
  subtitle?: string;
  badgeText?: string;
  badgeClass?: string;
  to: string;
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { tx } = useLanguage();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setDebounced('');
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api.globalSearch(debounced),
    enabled: open,
    staleTime: 10_000,
  });

  const flatItems = useMemo<PaletteItem[]>(() => {
    if (!data) return [];
    const list: PaletteItem[] = [];

    for (const p of data.projects) {
      list.push({
        key: `proj-${p.id}`,
        group: 'project',
        code: p.code,
        title: p.name,
        subtitle: p.isArchived ? tx('Đã lưu trữ', 'Archived') : tx('Dự án', 'Project'),
        to: `/projects/${p.id}/repository`,
      });
    }
    for (const c of data.cases) {
      list.push({
        key: `case-${c.id}`,
        group: 'case',
        code: c.code,
        title: c.title,
        subtitle: `${c.projectCode} · ${STATUS_STYLE[c.status]?.label ?? c.status}`,
        badgeText: PRIORITY_STYLE[c.priority]?.label ?? c.priority,
        badgeClass: PRIORITY_STYLE[c.priority]?.className,
        to: `/projects/${c.projectId}/repository?caseId=${c.id}`,
      });
    }
    for (const r of data.runs) {
      list.push({
        key: `run-${r.id}`,
        group: 'run',
        code: r.projectCode,
        title: r.title,
        subtitle: `${r.environment} · ${r.status}`,
        to: `/projects/${r.projectId}/runs/${r.id}`,
      });
    }
    for (const d of data.defects) {
      list.push({
        key: `def-${d.id}`,
        group: 'defect',
        code: d.jiraIssueKey || d.caseCode || d.projectCode,
        title: d.title,
        subtitle: `${d.projectCode} · ${d.severity} · ${d.status}`,
        to: `/projects/${d.projectId}/defects`,
      });
    }
    return list;
  }, [data, tx]);

  useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length, debounced]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (flatItems.length > 0 ? (i + 1) % flatItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) =>
          flatItems.length > 0 ? (i - 1 + flatItems.length) % flatItems.length : 0,
        );
      } else if (e.key === 'Enter' && flatItems[activeIndex]) {
        e.preventDefault();
        navigate(flatItems[activeIndex].to);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, flatItems, activeIndex, navigate, onClose]);

  if (!open) return null;

  const groupMeta: Record<
    PaletteItem['group'],
    { label: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    project: { label: tx('Dự án', 'Projects'), icon: FolderKanban },
    case: { label: 'Test Cases', icon: FileText },
    run: { label: 'Test Runs', icon: PlayCircle },
    defect: { label: 'Defects', icon: Bug },
  };

  const groups: PaletteItem['group'][] = ['project', 'case', 'run', 'defect'];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] flex items-start justify-center pt-[10vh] px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={tx('Tìm kiếm nhanh toàn hệ thống', 'Global quick search')}
        className="animate-modal w-full max-w-2xl bg-white rounded-2xl border border-hairline shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-hairline">
          <Search className="w-4.5 h-4.5 text-brand-600 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tx(
              'Tìm nhanh Dự án, mã Test Case (VD: WEB-1), Test Run, Defect...',
              'Jump to Project, Test Case code (e.g. WEB-1), Test Run, Defect...',
            )}
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
          />
          {isFetching && (
            <span className="text-[11px] text-slate-400 shrink-0">
              {tx('Đang tìm...', 'Searching...')}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={tx('Đóng', 'Close')}
            className="p-1 text-slate-400 hover:text-ink rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {flatItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {debounced
                ? tx(
                    `Không tìm thấy kết quả nào khớp với "${debounced}".`,
                    `No matching results for "${debounced}".`,
                  )
                : tx(
                    'Nhập mã Test Case (VD: WEB-1), tên dự án hoặc từ khóa để tìm nhanh.',
                    'Type a Test Case code (e.g. WEB-1), project name, or keyword.',
                  )}
            </div>
          ) : (
            groups.map((grp) => {
              const items = flatItems.filter((it) => it.group === grp);
              if (items.length === 0) return null;
              const Icon = groupMeta[grp].icon;
              return (
                <div key={grp}>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Icon className="w-3 h-3" />
                    {groupMeta[grp].label}
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {items.map((item) => {
                      const idx = flatItems.indexOf(item);
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => {
                            navigate(item.to);
                            onClose();
                          }}
                          className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-ink hover:bg-canvas'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.code && (
                              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-hairline text-brand-700 shrink-0">
                                {item.code}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold truncate">
                                {item.title}
                              </div>
                              {item.subtitle && (
                                <div className="text-[11px] text-slate-500 truncate">
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.badgeText && (
                              <span
                                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                                  item.badgeClass || 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {item.badgeText}
                              </span>
                            )}
                            <ArrowRight
                              className={`w-3.5 h-3.5 ${
                                isActive ? 'text-brand-600' : 'text-slate-300'
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 border-t border-hairline bg-canvas/70 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-hairline font-mono text-[10px]">
                ↑↓
              </kbd>{' '}
              {tx('di chuyển', 'navigate')}
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-hairline font-mono text-[10px]">
                Enter
              </kbd>{' '}
              {tx('mở nhanh', 'open')}
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-hairline font-mono text-[10px]">
                Esc
              </kbd>{' '}
              {tx('đóng', 'close')}
            </span>
          </div>
          <span>{tx('Tìm kiếm toàn hệ thống', 'Global Command Palette')}</span>
        </div>
      </div>
    </div>
  );
}
