import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bug,
  ChevronDown,
  Cpu,
  Download,
  FileCode2,
  FileImage,
  FileText,
  FolderTree,
  Link2,
  Loader2,
  PlayCircle,
} from 'lucide-react';
import { AUTOMATION_STATUSES, PRIORITIES, TEST_CASE_TYPES } from '@tcms/shared';
import { api } from '../lib/api';
import { AUTOMATION_STYLE, PRIORITY_STYLE, TYPE_LABEL } from '../lib/badges';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  exportOverviewAsHtml,
  exportOverviewAsImage,
  exportOverviewAsPdf,
} from '../lib/reportExport';
import { ProjectNav } from '../components/ProjectNav';
import { RtmSection } from '../components/RtmSection';

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { tx, lang } = useLanguage();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const reportRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'html' | 'image' | null>(null);
  const [exportNotice, setExportNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ['project-stats', projectId],
    queryFn: () => api.getProjectStats(projectId!),
    enabled: Boolean(projectId),
  });

  if (!project) return <div className="p-8 text-sm text-slate-400">{tx('Đang tải...', 'Loading...')}</div>;

  const total = stats?.totalCases ?? 0;
  const autoCount = stats?.byAutomation?.AUTOMATED ?? 0;
  const autoPct = total > 0 ? Math.round((autoCount / total) * 100) : 0;
  const jiraPct = total > 0 ? Math.round(((stats?.linkedJiraCases ?? 0) / total) * 100) : 0;

  const handleExport = async (format: 'pdf' | 'html' | 'image') => {
    if (!stats) return;
    setMenuOpen(false);
    setExportNotice(null);
    setExporting(format);
    try {
      if (format === 'html') {
        await exportOverviewAsHtml(project, stats, user?.fullName);
      } else if (format === 'image') {
        if (!reportRef.current)
          throw new Error(tx('Không tìm thấy vùng báo cáo để chụp ảnh', 'Report container not found for image capture'));
        await exportOverviewAsImage(reportRef.current, project.code);
      } else {
        if (!reportRef.current)
          throw new Error(tx('Không tìm thấy vùng báo cáo để xuất PDF', 'Report container not found for PDF export'));
        await exportOverviewAsPdf(reportRef.current, project.code);
      }
      const label = format === 'pdf' ? 'PDF' : format === 'html' ? 'HTML' : tx('Ảnh PNG', 'PNG Image');
      setExportNotice({
        type: 'ok',
        text: tx(`Đã tải xuống báo cáo ${label} thành công!`, `Downloaded ${label} report successfully!`),
      });
      setTimeout(() => setExportNotice(null), 3500);
    } catch (err) {
      setExportNotice({
        type: 'err',
        text: tx(
          `Lỗi xuất báo cáo: ${err instanceof Error ? err.message : 'Không xác định'}`,
          `Report export failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        ),
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <ProjectNav project={project} />

      <div className="max-w-7xl w-full mx-auto px-5 py-6 space-y-5">
        {/* Top action bar (outside captured report area) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {tx('Tổng quan Chất lượng Dự án', 'Project Quality Overview')}
            </h1>
            <p className="text-sm text-slate-500">
              {tx(
                'Báo cáo nhanh cho PM & QA Lead về quy mô Test Case, mức độ tự động hóa và liên kết Jira',
                'Quick summary for PM & QA Lead covering Test Case volume, automation coverage, and Jira traceability',
              )}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {exportNotice && (
              <span
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
                  exportNotice.type === 'ok'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {exportNotice.text}
              </span>
            )}

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                disabled={!stats || exporting !== null}
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl shadow-xs shadow-brand-600/20 transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {tx(`Đang xuất ${exporting.toUpperCase()}...`, `Exporting ${exporting.toUpperCase()}...`)}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {tx('Tải báo cáo', 'Export Report')}
                    <ChevronDown className="w-4 h-4 opacity-80" />
                  </>
                )}
              </button>

              {menuOpen && (
                <div className="animate-modal absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-hairline shadow-xl py-1.5 z-30">
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-canvas flex items-start gap-3 transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {tx('Xuất file PDF (.pdf)', 'Export PDF (.pdf)')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {tx(
                          'Chuẩn A4 sắc nét, gửi Email / trình duyệt báo cáo',
                          'Crisp A4 layout, ready for email or executive review',
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExport('html')}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-canvas flex items-start gap-3 transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0 mt-0.5">
                      <FileCode2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {tx('Xuất file HTML (.html)', 'Export HTML (.html)')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {tx(
                          'File web độc lập kèm logo, mở offline trên mọi máy',
                          'Standalone web file with branding, opens offline anywhere',
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExport('image')}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-canvas flex items-start gap-3 transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                      <FileImage className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {tx('Xuất hình ảnh (.png)', 'Export Image (.png)')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {tx(
                          'Ảnh độ phân giải 2x, dán nhanh vào Slack / Teams / Jira',
                          '2x resolution PNG, ready to paste into Slack / Teams / Jira',
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoading || !stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : (
          /* Capturable Report Container for crisp PDF & Image PNG export */
          <div
            ref={reportRef}
            className="bg-white rounded-2xl border border-hairline p-6 sm:p-7 space-y-6 shadow-xs"
          >
            {/* Branded Report Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-hairline">
              <div className="flex items-center gap-3.5">
                <img
                  src="/finx-logo.png"
                  alt="FinX"
                  className="h-7 w-auto object-contain select-none"
                />
                <span className="h-6 w-px bg-hairline" aria-hidden="true" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200/80">
                      {project.code}
                    </span>
                    <span className="text-base font-bold text-ink tracking-[-0.01em]">
                      {project.name}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {tx(
                      'Báo cáo Tổng quan Chất lượng Dự án · FinX TestCase Hub',
                      'Project Quality Overview Report · FinX TestCase Hub',
                    )}
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-500 sm:text-right tabular-nums">
                <div>
                  {tx('Ngày xuất:', 'Exported on:')} {new Date().toLocaleDateString(locale)}
                </div>
                {user && (
                  <div>
                    {tx('Người xuất:', 'Exported by:')} {user.fullName}
                  </div>
                )}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-canvas rounded-xl border border-hairline p-5 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-brand-600" />
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                  {tx('Tổng số Test Cases', 'Total Test Cases')}
                  <FileText className="w-4 h-4 text-brand-600" />
                </div>
                <div className="text-3xl font-bold text-ink mt-2 tabular-nums">
                  {stats.totalCases.toLocaleString(locale)}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  Active: {stats.byStatus.ACTIVE} · Draft: {stats.byStatus.DRAFT}
                </div>
              </div>

              <div className="bg-canvas rounded-xl border border-hairline p-5 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" />
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                  {tx('Tỷ lệ Automation', 'Automation Rate')}
                  <Cpu className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-3xl font-bold text-emerald-700 mt-2 tabular-nums">
                  {autoPct}%
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  {autoCount} Automated · {stats.byAutomation.TO_BE_AUTOMATED} To Automate
                </div>
              </div>

              <div className="bg-canvas rounded-xl border border-hairline p-5 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-sky-500" />
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                  {tx('Liên kết Jira Issue', 'Jira Linked Cases')}
                  <Link2 className="w-4 h-4 text-sky-600" />
                </div>
                <div className="text-3xl font-bold text-sky-700 mt-2 tabular-nums">
                  {stats.linkedJiraCases}
                  <span className="text-sm font-medium text-slate-400 ml-1.5">({jiraPct}%)</span>
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  {project.jiraEnabled
                    ? tx('Jira Integration: Đã bật', 'Jira Integration: Enabled')
                    : tx('Jira Integration: Chưa bật', 'Jira Integration: Disabled')}
                </div>
              </div>

              <div className="bg-canvas rounded-xl border border-hairline p-5 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-amber-500" />
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                  {tx('Tổng số Test Suites', 'Total Test Suites')}
                  <FolderTree className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-3xl font-bold text-ink mt-2 tabular-nums">
                  {stats.totalSuites}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  {tx(
                    `${project.stats.memberCount} thành viên tham gia`,
                    `${project.stats.memberCount} project ${project.stats.memberCount === 1 ? 'member' : 'members'}`,
                  )}
                </div>
              </div>
            </div>

            {/* Breakdown Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* By Priority */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  {tx('Phân bổ theo Mức độ ưu tiên (Priority)', 'Distribution by Priority')}
                </h2>
                <div className="space-y-3">
                  {PRIORITIES.map((p) => {
                    const val = stats.byPriority[p] ?? 0;
                    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                    return (
                      <div key={p}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">
                            {PRIORITY_STYLE[p].label}
                          </span>
                          <span className="text-slate-500 font-mono">
                            {val} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${PRIORITY_STYLE[p].dot}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By Automation & Type */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  {tx('Phân bổ theo Trạng thái Automation', 'Distribution by Automation Status')}
                </h2>
                <div className="space-y-3 mb-6">
                  {AUTOMATION_STATUSES.map((a) => {
                    const val = stats.byAutomation[a] ?? 0;
                    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                    const barColor =
                      a === 'AUTOMATED'
                        ? 'bg-emerald-500'
                        : a === 'TO_BE_AUTOMATED'
                          ? 'bg-violet-500'
                          : 'bg-slate-400';
                    return (
                      <div key={a}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">
                            {AUTOMATION_STYLE[a].label}
                          </span>
                          <span className="text-slate-500 font-mono">
                            {val} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2.5">
                  {tx('Theo Loại kiểm thử (Type)', 'By Test Type')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {TEST_CASE_TYPES.filter((t) => (stats.byType[t] ?? 0) > 0).map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700"
                    >
                      {TYPE_LABEL[t]}: <strong className="font-mono">{stats.byType[t]}</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Suites */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                {tx('Phân bổ Test Case theo Suite lớn nhất', 'Top Test Suites by Case Count')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {stats.topSuites.map((s) => {
                  const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                  return (
                    <div
                      key={s.suiteId || 'none'}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-medium text-slate-800 truncate">{s.title}</span>
                        <span className="font-mono text-slate-500 shrink-0 ml-2">
                          {s.count} cases ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-600 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Test Runs & Open Defects (Phase 2) */}
            {stats.recentRuns && stats.recentRuns.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <PlayCircle className="w-4 h-4 text-brand-600" />
                    {tx('Tiến độ Test Runs gần nhất', 'Recent Test Runs Progress')}
                  </h2>
                  {typeof stats.openDefectsCount === 'number' && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                      <Bug className="w-3.5 h-3.5" />
                      {tx(
                        `${stats.openDefectsCount} Bug đang mở`,
                        `${stats.openDefectsCount} Open ${stats.openDefectsCount === 1 ? 'Bug' : 'Bugs'}`,
                      )}
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {stats.recentRuns.map((run) => {
                    const rs = run.stats;
                    const pPass = rs.total > 0 ? (rs.passed / rs.total) * 100 : 0;
                    const pFail = rs.total > 0 ? (rs.failed / rs.total) * 100 : 0;
                    const pBlock = rs.total > 0 ? (rs.blocked / rs.total) * 100 : 0;
                    return (
                      <Link
                        key={run.id}
                        to={`/projects/${projectId}/runs/${run.id}`}
                        className="block p-3 rounded-xl bg-canvas border border-hairline hover:border-brand-300 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                          <span className="font-semibold text-ink">
                            {run.title}{' '}
                            <span className="font-mono font-normal text-slate-400">
                              ({run.environment} · v{run.appVersion})
                            </span>
                          </span>
                          <span className="font-mono font-semibold text-brand-700 tabular-nums">
                            Pass Rate: {rs.passRate}% ({rs.passed} Pass · {rs.failed} Fail ·{' '}
                            {rs.blocked} Block / {rs.total})
                          </span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                          {pPass > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${pPass}%` }} />}
                          {pFail > 0 && <div className="bg-rose-500 h-full" style={{ width: `${pFail}%` }} />}
                          {pBlock > 0 && <div className="bg-amber-400 h-full" style={{ width: `${pBlock}%` }} />}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <RtmSection projectId={projectId!} />
          </div>
        )}
      </div>
    </div>
  );
}
