import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  FolderTree,
  Plus,
  Search,
  FileText,
  Cpu,
  Users,
  Link2,
  X,
  ArrowUpRight,
  FolderKanban,
  Star,
  Pin,
} from 'lucide-react';
import { canManageProject, type ProjectSummaryDto } from '@tcms/shared';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ROLE_STYLE } from '../lib/badges';

function sortProjectsPinnedFirst(
  list: ProjectSummaryDto[],
  locale = 'vi',
): ProjectSummaryDto[] {
  return [...list].sort((a, b) => {
    if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
    const favA = a.isFavorite ? 1 : 0;
    const favB = b.isFavorite ? 1 : 0;
    if (favA !== favB) return favB - favA;
    return a.name.localeCompare(b.name, locale);
  });
}

export function ProjectsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { tx, lang } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const canManageProjects = canManageProject(user?.role);
  const queryKey = ['projects', user?.id, canManageProjects && showArchived] as const;

  const { data: projects = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.listProjects(canManageProjects && showArchived),
  });

  const createMutation = useMutation({
    mutationFn: api.createProject,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setCode('');
      setName('');
      setDescription('');
      setFormError(null);
      toast.success(
        tx(
          `Đã tạo dự án ${created.code} — ${created.name}`,
          `Created project ${created.code} — ${created.name}`,
        ),
      );
    },
    onError: (err) => {
      const msg =
        err instanceof Error
          ? err.message
          : tx('Không thể tạo dự án', 'Unable to create project');
      setFormError(msg);
      toast.error(msg);
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ project, nextFav }: { project: ProjectSummaryDto; nextFav: boolean }) =>
      api.toggleFavoriteProject(project.id, nextFav),
    onMutate: async ({ project, nextFav }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      const prev = queryClient.getQueryData<ProjectSummaryDto[]>(queryKey);
      if (prev) {
        const updated = sortProjectsPinnedFirst(
          prev.map((p) => (p.id === project.id ? { ...p, isFavorite: nextFav } : p)),
          lang === 'en' ? 'en' : 'vi',
        );
        queryClient.setQueryData<ProjectSummaryDto[]>(queryKey, updated);
      }
      return { prev };
    },
    onSuccess: (res, { project }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success(
        res.isFavorite
          ? tx(
              `Đã ghim dự án ${project.code} lên đầu danh sách`,
              `Pinned project ${project.code} to the top`,
            )
          : tx(
              `Đã bỏ ghim yêu thích dự án ${project.code}`,
              `Unpinned project ${project.code}`,
            ),
      );
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKey, ctx.prev);
      }
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Không thể cập nhật trạng thái yêu thích', 'Unable to update favorite status'),
      );
    },
  });

  const favoriteCount = projects.filter((p) => p.isFavorite).length;

  const filtered = projects.filter((p) => {
    if (onlyFavorites && !p.isFavorite) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  });

  const pinnedProjects = filtered.filter((p) => p.isFavorite);
  const otherProjects = filtered.filter((p) => !p.isFavorite);
  const showGrouped = !onlyFavorites && pinnedProjects.length > 0 && otherProjects.length > 0;

  const totalCasesAll = projects.reduce((sum, p) => sum + p.stats.totalCases, 0);
  const totalAutoAll = projects.reduce((sum, p) => sum + p.stats.automatedCases, 0);
  const avgAutoPct = totalCasesAll > 0 ? Math.round((totalAutoAll / totalCasesAll) * 100) : 0;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createMutation.mutate({ code, name, description });
  };

  const renderProjectCard = (project: ProjectSummaryDto) => {
    const autoPct =
      project.stats.totalCases > 0
        ? Math.round((project.stats.automatedCases / project.stats.totalCases) * 100)
        : 0;
    const isFav = Boolean(project.isFavorite);

    return (
      <Link
        key={project.id}
        to={
          project.isArchived
            ? `/projects/${project.id}/settings`
            : `/projects/${project.id}/repository`
        }
        className={`group relative bg-white rounded-2xl border transition-all p-5 flex flex-col justify-between overflow-hidden ${
          project.isArchived
            ? 'border-amber-200/90 opacity-85 hover:opacity-100 hover:border-amber-400'
            : isFav
              ? 'border-amber-300/80 hover:border-amber-400 hover:shadow-md hover:shadow-amber-500/10'
              : 'border-hairline hover:border-brand-300 hover:shadow-md hover:shadow-brand-600/5'
        }`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-[3px] transition-opacity ${
            isFav
              ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-brand-500 opacity-100'
              : 'bg-brand-600 opacity-0 group-hover:opacity-100'
          }`}
        />

        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 border border-brand-200/80 shrink-0">
                {project.code}
              </span>
              {isFav && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                  <Pin className="w-2.5 h-2.5" />
                  {tx('Đã ghim', 'Pinned')}
                </span>
              )}
              {project.isArchived && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                  {tx('Đã lưu trữ', 'Archived')}
                </span>
              )}
              <h2 className="font-semibold text-ink text-[15px] truncate group-hover:text-brand-700 transition-colors">
                {project.name}
              </h2>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  favoriteMutation.mutate({ project, nextFav: !isFav });
                }}
                title={
                  isFav
                    ? tx('Bỏ ghim yêu thích', 'Unpin favorite')
                    : tx('Gắn sao & ghim lên đầu', 'Star & pin to top')
                }
                aria-label={
                  isFav
                    ? tx(`Bỏ ghim ${project.name}`, `Unpin ${project.name}`)
                    : tx(`Ghim ${project.name} lên đầu`, `Pin ${project.name} to top`)
                }
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isFav
                    ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                    : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'
                }`}
              >
                <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-500' : ''}`} />
              </button>
              <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-brand-600 transition-colors" />
            </div>
          </div>

          <p className="text-[13px] text-slate-500 mt-3 line-clamp-2 min-h-[2.5rem] leading-relaxed">
            {project.description || tx('Chưa có mô tả cho dự án này.', 'No description for this project yet.')}
          </p>
        </div>

        <div className="mt-5 pt-4 border-t border-hairline/80 space-y-3">
          {/* Inline Automation Coverage Bar */}
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-500 font-medium">Automation</span>
              <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                {autoPct}% ({project.stats.automatedCases}/{project.stats.totalCases})
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${autoPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <div className="flex items-center gap-3.5 tabular-nums">
              <span className="inline-flex items-center gap-1" title="Test Cases">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <strong className="text-ink">{project.stats.totalCases}</strong>
              </span>
              <span className="inline-flex items-center gap-1" title="Test Suites">
                <FolderTree className="w-3.5 h-3.5 text-slate-400" />
                <strong className="text-ink">{project.stats.suiteCount}</strong>
              </span>
              <span className="inline-flex items-center gap-1" title={tx('Thành viên', 'Members')}>
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <strong className="text-ink">{project.stats.memberCount}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {project.jiraEnabled && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                  <Link2 className="w-3 h-3" />
                  Jira
                </span>
              )}
              {project.myRole && (
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                    ROLE_STYLE[project.myRole]?.className
                  }`}
                >
                  {ROLE_STYLE[project.myRole]?.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-5 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink tracking-[-0.02em]">
            {tx('Không gian Dự án', 'Project Workspace')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {tx(
              'Chọn một dự án để quản lý Kho Test Case, lịch sử phiên bản, báo cáo và tích hợp Jira.',
              'Select a project to manage Test Cases, version history, quality reports, and Jira integration.',
            )}
          </p>
        </div>

        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOnlyFavorites((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
              onlyFavorites
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-hairline text-slate-600 hover:bg-canvas'
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                onlyFavorites || favoriteCount > 0 ? 'fill-amber-400 text-amber-500' : ''
              }`}
            />
            {tx('Yêu thích', 'Favorites')}
            {favoriteCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 tabular-nums">
                {favoriteCount}
              </span>
            )}
          </button>

          {canManageProjects && (
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
                showArchived
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-hairline text-slate-600 hover:bg-canvas'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              {showArchived
                ? tx('Đang hiện cả dự án lưu trữ', 'Showing archived projects')
                : tx('Hiện dự án đã lưu trữ', 'Show archived')}
            </button>
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tx('Tìm tên hoặc mã dự án...', 'Search project name or code...')}
              className="pl-10 pr-3.5 py-2 text-sm bg-white border border-hairline rounded-xl w-52 lg:w-56 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-colors"
            />
          </div>

          {canManageProject(user?.role) && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-xl shadow-xs shadow-brand-600/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {tx('Tạo dự án', 'New Project')}
            </button>
          )}
        </div>
      </div>

      {/* Workspace Summary Strip */}
      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">
                {tx('Dự án đang hoạt động', 'Active Projects')}
              </div>
              <div className="text-xl font-bold text-ink tabular-nums mt-0.5">
                {projects.length}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <FolderKanban className="w-4 h-4" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">
                {tx('Tổng số Test Cases', 'Total Test Cases')}
              </div>
              <div className="text-xl font-bold text-ink tabular-nums mt-0.5">
                {totalCasesAll.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">
                {tx('Tỷ lệ phủ Automation', 'Automation Coverage')}
              </div>
              <div className="text-xl font-bold text-emerald-700 tabular-nums mt-0.5">
                {avgAutoPct}%
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Project Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-56 bg-white rounded-2xl border border-hairline animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-hairline p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
            {onlyFavorites ? <Star className="w-6 h-6" /> : <FolderTree className="w-6 h-6" />}
          </div>
          <p className="text-ink font-semibold text-base">
            {projects.length === 0
              ? tx('Chào mừng đến với FinX TestCase Hub', 'Welcome to FinX TestCase Hub')
              : onlyFavorites
                ? tx('Bạn chưa gắn sao dự án yêu thích nào', 'No favorite projects starred yet')
                : tx('Không tìm thấy dự án nào phù hợp', 'No matching projects found')}
          </p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {projects.length === 0
              ? tx(
                  'Hệ thống đang ở trạng thái khởi tạo sạch. Hãy tạo dự án đầu tiên hoặc thêm thành viên QA / PM để bắt đầu.',
                  'The workspace is freshly initialized. Create your first project or add QA / PM members to get started.',
                )
              : onlyFavorites
                ? tx(
                    'Nhấn biểu tượng ngôi sao trên thẻ dự án bạn thường xuyên làm việc để ghim lên đầu danh sách.',
                    'Click the star icon on projects you work on frequently to pin them to the top.',
                  )
                : tx(
                    'Thử thay đổi từ khóa tìm kiếm hoặc tạo dự án mới.',
                    'Try adjusting your search keywords or creating a new project.',
                  )}
          </p>
          {onlyFavorites && projects.length > 0 && (
            <button
              type="button"
              onClick={() => setOnlyFavorites(false)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-hairline hover:bg-canvas text-slate-700 text-sm font-medium rounded-xl transition-colors cursor-pointer"
            >
              {tx('Xem tất cả dự án', 'View all projects')}
            </button>
          )}
          {projects.length === 0 && (canManageProject(user?.role) || user?.role === 'ADMIN') && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {canManageProject(user?.role) && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl shadow-xs shadow-brand-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {tx('Tạo dự án đầu tiên', 'Create first project')}
                </button>
              )}
              {user?.role === 'ADMIN' && (
                <Link
                  to="/users"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-hairline hover:bg-canvas text-slate-700 text-sm font-medium rounded-xl transition-colors"
                >
                  <Users className="w-4 h-4 text-brand-600" />
                  {tx('Quản lý thành viên', 'Manage members')}
                </Link>
              )}
            </div>
          )}
        </div>
      ) : showGrouped ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              <span>
                {tx(
                  `Đã ghim yêu thích (${pinnedProjects.length})`,
                  `Pinned Favorites (${pinnedProjects.length})`,
                )}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pinnedProjects.map(renderProjectCard)}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <FolderKanban className="w-3.5 h-3.5" />
              <span>
                {tx(
                  `Các dự án khác (${otherProjects.length})`,
                  `Other Projects (${otherProjects.length})`,
                )}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherProjects.map(renderProjectCard)}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(renderProjectCard)}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-[#11131A]/45 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-ink tracking-tight">
                {tx('Tạo dự án mới', 'Create New Project')}
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                aria-label={tx('Đóng', 'Close')}
                className="p-1.5 text-slate-400 hover:text-ink hover:bg-canvas rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  {tx('Mã dự án (2–10 ký tự in hoa) *', 'Project Code (2–10 uppercase characters) *')}
                </label>
                <input
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={tx('VD: WEB, MOB, CRM', 'e.g. WEB, MOB, CRM')}
                  maxLength={10}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {tx(
                    `Làm tiền tố mã Test Case (VD: ${code || 'WEB'}-1, ${code || 'WEB'}-2...)`,
                    `Used as Test Case ID prefix (e.g. ${code || 'WEB'}-1, ${code || 'WEB'}-2...)`,
                  )}
                </p>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  {tx('Tên dự án *', 'Project Name *')}
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tx('VD: E-Commerce Web Portal', 'e.g. E-Commerce Web Portal')}
                  className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  {tx('Mô tả', 'Description')}
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={tx('Mô tả ngắn gọn phạm vi kiểm thử...', 'Briefly describe the testing scope...')}
                  className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>

              {formError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-canvas rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl disabled:opacity-60 cursor-pointer"
                >
                  {createMutation.isPending
                    ? tx('Đang tạo...', 'Creating...')
                    : tx('Tạo dự án', 'Create Project')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
