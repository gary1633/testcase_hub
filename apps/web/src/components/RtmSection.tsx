import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  GitBranch,
  Search,
} from 'lucide-react';
import type { RtmReadinessStatus } from '@tcms/shared';
import { api } from '../lib/api';
import { EXECUTION_STATUS_STYLE, PRIORITY_STYLE, safeExternalHttpUrl } from '../lib/badges';
import { useLanguage } from '../contexts/LanguageContext';

export function RtmSection({ projectId }: { projectId: string }) {
  const { tx } = useLanguage();
  const [search, setSearch] = useState('');
  const [readinessFilter, setReadinessFilter] = useState<string>('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const { data: rtm, isLoading } = useQuery({
    queryKey: ['project-rtm', projectId],
    queryFn: () => api.getProjectRtm(projectId),
    enabled: Boolean(projectId),
  });

  const filteredItems = useMemo(() => {
    if (!rtm) return [];
    const q = search.trim().toLowerCase();
    return rtm.items.filter((item) => {
      if (readinessFilter && item.readiness !== readinessFilter) return false;
      if (!q) return true;
      return (
        item.jiraKey.toLowerCase().includes(q) ||
        item.cases.some(
          (c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
        )
      );
    });
  }, [rtm, search, readinessFilter]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const readinessBadge = (status: RtmReadinessStatus) => {
    switch (status) {
      case 'READY':
        return {
          label: tx('Sẵn sàng Go-Live', 'Ready'),
          className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'AT_RISK':
        return {
          label: tx('Có rủi ro', 'At Risk'),
          className: 'bg-rose-50 text-rose-700 border-rose-200',
        };
      case 'IN_PROGRESS':
        return {
          label: tx('Đang kiểm thử', 'In Progress'),
          className: 'bg-sky-50 text-sky-700 border-sky-200',
        };
      default:
        return {
          label: tx('Chưa chạy', 'Not Run'),
          className: 'bg-slate-100 text-slate-600 border-slate-200',
        };
    }
  };

  const exportCsv = () => {
    if (!rtm) return;
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const headers = [
      'Requirement (Jira Key)',
      'Readiness',
      'Total Cases',
      'Passed',
      'Failed',
      'Blocked',
      'Skipped',
      'Untested',
      'Pass Rate (%)',
      'Open Defects',
      'Test Cases',
    ];
    const rows = filteredItems.map((it) => [
      it.jiraKey,
      it.readiness,
      it.totalCases,
      it.passed,
      it.failed,
      it.blocked,
      it.skipped,
      it.untested,
      it.passRate,
      it.openDefects,
      it.cases.map((c) => `${c.code} (${c.latestStatus})`).join('; '),
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rtm.projectCode}_RTM_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="bg-white rounded-2xl border border-hairline overflow-hidden">
      <div className="px-5 py-4 border-b border-hairline bg-canvas/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <GitBranch className="w-4.5 h-4.5 text-brand-600" />
            {tx(
              'Ma trận Truy vết Yêu cầu (RTM — Jira ↔ Test Cases ↔ Kết quả)',
              'Requirement Traceability Matrix (RTM — Jira ↔ Test Cases ↔ Runs)',
            )}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {tx(
              'Đối chiếu độ phủ kiểm thử, kết quả chạy gần nhất và Defect đang mở theo từng Jira Story/Task để nghiệm thu UAT.',
              'Track test coverage, latest execution outcomes, and open defects per Jira requirement for UAT sign-off.',
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tx('Tìm Jira Key hoặc mã Case...', 'Search Jira Key or Case...')}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-hairline rounded-lg w-48 focus:outline-none focus:border-brand-600"
            />
          </div>
          {rtm && rtm.items.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {tx('Xuất RTM (.csv)', 'Export RTM (.csv)')}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">
          {tx('Đang tổng hợp Ma trận Truy vết...', 'Building Traceability Matrix...')}
        </div>
      ) : !rtm || rtm.items.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 space-y-1">
          <div>
            {tx(
              'Chưa có Test Case nào được gắn mã Jira Key (Requirement) trong dự án này.',
              'No Test Cases are linked to a Jira Issue Key in this project yet.',
            )}
          </div>
          <div className="text-slate-400">
            {tx(
              'Mở chi tiết Test Case và thêm Jira Issue Key (VD: FINX-101) để tự động hiển thị trên bảng RTM.',
              'Add Jira Issue Keys (e.g. FINX-101) to your Test Cases to populate this Traceability Matrix.',
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Filterable Readiness Summary Strip */}
          <div className="px-5 py-3 border-b border-hairline flex flex-wrap items-center justify-between gap-2 bg-white">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setReadinessFilter('')}
                className={`px-2.5 py-1 rounded-full font-medium border cursor-pointer transition-colors ${
                  readinessFilter === ''
                    ? 'bg-brand-50 text-brand-700 border-brand-300'
                    : 'bg-canvas text-slate-600 border-hairline hover:text-ink'
                }`}
              >
                {tx('Tất cả', 'All')} ({rtm.totalRequirements})
              </button>
              <button
                type="button"
                onClick={() => setReadinessFilter(readinessFilter === 'READY' ? '' : 'READY')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium border cursor-pointer transition-colors ${
                  readinessFilter === 'READY'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                {tx('Sẵn sàng', 'Ready')} ({rtm.readyCount})
              </button>
              <button
                type="button"
                onClick={() => setReadinessFilter(readinessFilter === 'AT_RISK' ? '' : 'AT_RISK')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium border cursor-pointer transition-colors ${
                  readinessFilter === 'AT_RISK'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                {tx('Có rủi ro', 'At Risk')} ({rtm.atRiskCount})
              </button>
              <button
                type="button"
                onClick={() =>
                  setReadinessFilter(readinessFilter === 'IN_PROGRESS' ? '' : 'IN_PROGRESS')
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium border cursor-pointer transition-colors ${
                  readinessFilter === 'IN_PROGRESS'
                    ? 'bg-sky-100 text-sky-800 border-sky-300'
                    : 'bg-sky-50 text-sky-700 border-sky-200'
                }`}
              >
                <Clock className="w-3 h-3" />
                {tx('Đang chạy', 'In Progress')} ({rtm.inProgressCount})
              </button>
              <button
                type="button"
                onClick={() => setReadinessFilter(readinessFilter === 'NOT_RUN' ? '' : 'NOT_RUN')}
                className={`px-2.5 py-1 rounded-full font-medium border cursor-pointer transition-colors ${
                  readinessFilter === 'NOT_RUN'
                    ? 'bg-slate-200 text-slate-800 border-slate-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {tx('Chưa chạy', 'Not Run')} ({rtm.notRunCount})
              </button>
            </div>

            {rtm.casesWithoutRequirement > 0 && (
              <span className="text-[11px] text-slate-500">
                {tx(
                  `Còn ${rtm.casesWithoutRequirement} Test Case chưa gắn Jira Key`,
                  `${rtm.casesWithoutRequirement} Test Cases without a linked Jira Key`,
                )}
              </span>
            )}
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/70 border-b border-hairline text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Requirement (Jira)</th>
                  <th className="px-3 py-2.5">{tx('Trạng thái', 'Readiness')}</th>
                  <th className="px-3 py-2.5 text-center">Cases</th>
                  <th className="px-3 py-2.5">{tx('Tiến độ & Tỷ lệ Pass', 'Pass Rate & Breakdown')}</th>
                  <th className="px-3 py-2.5 text-center">Defects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const isOpen = expandedKeys.has(item.jiraKey);
                  const badge = readinessBadge(item.readiness);
                  const jiraHref =
                    rtm.jiraBaseUrl && safeExternalHttpUrl(`${rtm.jiraBaseUrl}/browse/${item.jiraKey}`);
                  return (
                    <React.Fragment key={item.jiraKey}>
                      <tr
                        onClick={() => toggleExpand(item.jiraKey)}
                        className="hover:bg-canvas/60 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md">
                              {item.jiraKey}
                            </span>
                            {jiraHref && (
                              <a
                                href={jiraHref}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={tx('Mở trên Jira', 'Open in Jira')}
                                className="text-slate-400 hover:text-brand-600"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs font-bold text-ink tabular-nums">
                          {item.totalCases}
                        </td>
                        <td className="px-3 py-3 min-w-[210px]">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-mono font-semibold text-emerald-700">
                              {item.passRate}% Pass
                            </span>
                            <span className="text-slate-500 font-mono tabular-nums">
                              {item.passed}P · {item.failed}F · {item.blocked}B · {item.untested}U
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                            {item.passed > 0 && (
                              <div
                                className="bg-emerald-500 h-full"
                                style={{ width: `${(item.passed / item.totalCases) * 100}%` }}
                              />
                            )}
                            {item.failed > 0 && (
                              <div
                                className="bg-rose-500 h-full"
                                style={{ width: `${(item.failed / item.totalCases) * 100}%` }}
                              />
                            )}
                            {item.blocked > 0 && (
                              <div
                                className="bg-amber-500 h-full"
                                style={{ width: `${(item.blocked / item.totalCases) * 100}%` }}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {item.openDefects > 0 ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              <Bug className="w-3 h-3" />
                              {item.openDefects}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">0</span>
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-canvas/40">
                          <td colSpan={5} className="px-6 py-3">
                            <div className="space-y-1.5">
                              {item.cases.map((c) => {
                                const execStyle = EXECUTION_STATUS_STYLE[c.latestStatus] ?? {
                                  label: c.latestStatus,
                                  className: 'bg-slate-100 text-slate-600 border-slate-200',
                                };
                                return (
                                  <div
                                    key={c.id}
                                    className="flex flex-wrap items-center justify-between gap-2 bg-white border border-hairline rounded-xl px-3.5 py-2 text-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Link
                                        to={`/projects/${projectId}/repository?caseId=${c.id}`}
                                        className="font-mono font-semibold text-brand-700 hover:underline shrink-0"
                                      >
                                        {c.code}
                                      </Link>
                                      <span className="text-ink font-medium truncate">{c.title}</span>
                                      <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${
                                          PRIORITY_STYLE[c.priority]?.className
                                        }`}
                                      >
                                        {PRIORITY_STYLE[c.priority]?.label}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {c.latestRunId && c.latestRunTitle && (
                                        <Link
                                          to={`/projects/${projectId}/runs/${c.latestRunId}`}
                                          className="text-[11px] text-slate-500 hover:text-brand-700 truncate max-w-[180px]"
                                        >
                                          {c.latestRunTitle}
                                        </Link>
                                      )}
                                      <span
                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${execStyle.className}`}
                                      >
                                        {execStyle.label}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
