import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bug,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileEdit,
  PlayCircle,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { EXECUTION_STATUS_STYLE, PRIORITY_STYLE, SEVERITY_LABEL } from '../lib/badges';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function MyWorkPage() {
  const { user } = useAuth();
  const { tx, lang } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['my-work', user?.id],
    queryFn: api.getMyWork,
    enabled: Boolean(user?.id),
  });

  const assigned = data?.assignedRunItems ?? [];
  const pendingReview = data?.pendingReviewCases ?? [];
  const drafts = data?.myDraftCases ?? [];
  const openDefects = data?.openDefects ?? [];

  const unfinishedAssignedCount = assigned.filter(
    (a) => a.status !== 'PASSED' && a.status !== 'NOT_TEST',
  ).length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-5 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-[-0.02em] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-600" />
            {tx('Việc của tôi', 'My Work')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {tx(
              'Tổng hợp nhanh các Test Case được gán chạy, bài chờ duyệt, bản nháp và lỗi đang mở trên tất cả dự án bạn tham gia.',
              'Central hub for your assigned test executions, pending reviews, draft cases, and open defects across all projects.',
            )}
          </p>
        </div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-hairline hover:bg-canvas text-ink rounded-xl transition-colors self-start"
        >
          {tx('Tất cả Dự án', 'All Projects')}
          <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
        </Link>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {tx('Được gán chạy (chưa xong)', 'Assigned to Run (Pending)')}
            </div>
            <div className="text-2xl font-bold text-brand-700 tabular-nums mt-0.5">
              {unfinishedAssignedCount}
              <span className="text-xs font-normal text-slate-400 ml-1">/ {assigned.length}</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
            <PlayCircle className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {tx('Test Case chờ duyệt', 'Pending Review')}
            </div>
            <div className="text-2xl font-bold text-sky-700 tabular-nums mt-0.5">
              {pendingReview.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <ClipboardCheck className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {tx('Bản nháp của tôi', 'My Draft Cases')}
            </div>
            <div className="text-2xl font-bold text-amber-700 tabular-nums mt-0.5">
              {drafts.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <FileEdit className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {tx('Defects đang mở', 'Open Defects')}
            </div>
            <div className="text-2xl font-bold text-rose-700 tabular-nums mt-0.5">
              {openDefects.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Bug className="w-4.5 h-4.5" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-sm text-slate-400">
          {tx('Đang tải công việc của bạn...', 'Loading your work...')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (7 cols): Assigned Executions + Pending Reviews */}
          <div className="lg:col-span-7 space-y-5">
            {/* Assigned Test Run Items */}
            <section className="bg-white rounded-2xl border border-hairline overflow-hidden">
              <div className="px-5 py-3.5 border-b border-hairline bg-canvas/50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-brand-600" />
                  {tx('Test Case được gán chạy (Đang mở)', 'Assigned Test Executions (In Progress)')}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white border border-hairline text-slate-500">
                  {assigned.length}
                </span>
              </div>
              {assigned.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500/70" />
                  {tx(
                    'Bạn không có Test Case nào đang chờ chạy trong các Test Run đang mở.',
                    'You have no assigned executions in active Test Runs.',
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                  {assigned.map((item) => {
                    const st = EXECUTION_STATUS_STYLE[item.status] ?? {
                      label: item.status,
                      className: 'bg-slate-100 text-slate-600 border-slate-200',
                    };
                    return (
                      <Link
                        key={item.resultId}
                        to={`/projects/${item.projectId}/runs/${item.runId}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/60 transition-colors group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200 shrink-0">
                              {item.caseCode}
                            </span>
                            <span className="text-[13px] font-semibold text-ink truncate group-hover:text-brand-700">
                              {item.caseTitle}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-600">
                              [{item.projectCode}] {item.runTitle}
                            </span>
                            <span>· {item.environment}</span>
                            {item.plannedDate && (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <Calendar className="w-3 h-3" />
                                {item.plannedDate}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0 ${st.className}`}
                        >
                          {st.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Pending Review Cases */}
            {pendingReview.length > 0 && (
              <section className="bg-white rounded-2xl border border-hairline overflow-hidden">
                <div className="px-5 py-3.5 border-b border-hairline bg-canvas/50 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-sky-600" />
                    {tx('Test Case chờ duyệt (In Review)', 'Test Cases Pending Review')}
                  </h2>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 font-semibold">
                    {pendingReview.length}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                  {pendingReview.map((tc) => (
                    <Link
                      key={tc.id}
                      to={`/projects/${tc.projectId}/repository?caseId=${tc.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/60 transition-colors group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
                            {tc.code}
                          </span>
                          <span className="text-[13px] font-semibold text-ink truncate group-hover:text-brand-700">
                            {tc.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {tc.projectName} · {tx('Cập nhật', 'Updated')} {formatDate(tc.updatedAt)}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                          PRIORITY_STYLE[tc.priority]?.className
                        }`}
                      >
                        {PRIORITY_STYLE[tc.priority]?.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column (5 cols): My Drafts + Open Defects */}
          <div className="lg:col-span-5 space-y-5">
            {/* My Draft Cases */}
            <section className="bg-white rounded-2xl border border-hairline overflow-hidden">
              <div className="px-5 py-3.5 border-b border-hairline bg-canvas/50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-amber-600" />
                  {tx('Bản nháp (Draft) của tôi', 'My Draft Cases')}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white border border-hairline text-slate-500">
                  {drafts.length}
                </span>
              </div>
              {drafts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  {tx('Không có Test Case bản nháp nào.', 'No draft Test Cases.')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
                  {drafts.map((tc) => (
                    <Link
                      key={tc.id}
                      to={`/projects/${tc.projectId}/repository?caseId=${tc.id}`}
                      className="flex items-center justify-between gap-2.5 px-5 py-2.5 hover:bg-canvas/60 transition-colors group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-amber-700 shrink-0">
                            {tc.code}
                          </span>
                          <span className="text-xs font-semibold text-ink truncate group-hover:text-brand-700">
                            {tc.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{tc.projectName}</div>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-600 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Open Defects */}
            <section className="bg-white rounded-2xl border border-hairline overflow-hidden">
              <div className="px-5 py-3.5 border-b border-hairline bg-canvas/50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Bug className="w-4 h-4 text-rose-600" />
                  {tx('Defects đang mở gần đây', 'Recent Open Defects')}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                  {openDefects.length}
                </span>
              </div>
              {openDefects.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  {tx('Không có Defect nào đang mở.', 'No open Defects across your projects.')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                  {openDefects.map((d) => (
                    <Link
                      key={d.id}
                      to={`/projects/${d.projectId}/defects`}
                      className="flex items-center justify-between gap-2.5 px-5 py-2.5 hover:bg-canvas/60 transition-colors group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                            {d.jiraIssueKey || d.caseCode || d.projectCode}
                          </span>
                          <span className="text-xs font-semibold text-ink truncate group-hover:text-brand-700">
                            {d.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          [{d.projectCode}] · {SEVERITY_LABEL[d.severity as keyof typeof SEVERITY_LABEL] ?? d.severity} · {formatDate(d.createdAt)}
                        </div>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-600 shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
