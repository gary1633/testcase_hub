import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bug,
  ChevronRight,
  ClipboardList,
  Eye,
  FolderTree,
  History,
  PlayCircle,
  Settings,
  Star,
} from 'lucide-react';
import { canEditCases, type ProjectSummaryDto } from '@tcms/shared';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';

export function ProjectNav({ project }: { project: ProjectSummaryDto }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tx } = useLanguage();
  const base = `/projects/${project.id}`;
  const readOnly = !canEditCases(project.myRole);

  const favoriteMutation = useMutation({
    mutationFn: (nextFav: boolean) => api.toggleFavoriteProject(project.id, nextFav),
    onMutate: async (nextFav) => {
      await queryClient.cancelQueries({ queryKey: ['project', project.id] });
      const prev = queryClient.getQueryData<ProjectSummaryDto>(['project', project.id]);
      if (prev) {
        queryClient.setQueryData<ProjectSummaryDto>(['project', project.id], {
          ...prev,
          isFavorite: nextFav,
        });
      }
      return { prev };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(
        res.isFavorite
          ? tx(
              `Đã ghim dự án ${project.code} lên đầu danh sách`,
              `Pinned project ${project.code} to the top`,
            )
          : tx(
              `Đã bỏ ghim yêu thích dự án ${project.code}`,
              `Unpinned favorite project ${project.code}`,
            ),
      );
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['project', project.id], ctx.prev);
      }
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Không thể cập nhật yêu thích', 'Failed to update favorite'),
      );
    },
  });

  const tabs = [
    { to: `${base}/repository`, label: tx('Kho Test Case', 'Test Repository'), icon: FolderTree },
    { to: `${base}/plans`, label: 'Test Plans', icon: ClipboardList },
    { to: `${base}/runs`, label: 'Test Runs', icon: PlayCircle },
    { to: `${base}/defects`, label: 'Defects', icon: Bug },
    { to: `${base}/overview`, label: tx('Tổng quan & Báo cáo', 'Overview & Reports'), icon: BarChart3 },
    { to: `${base}/history`, label: tx('Lịch sử thay đổi', 'Change History'), icon: History },
    ...(!readOnly
      ? [{ to: `${base}/settings`, label: tx('Cài đặt Dự án', 'Project Settings'), icon: Settings }]
      : []),
  ];

  const isFav = Boolean(project.isFavorite);

  return (
    <div className="bg-white border-b border-hairline px-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3">
        <div className="flex items-center gap-2 text-[13px] min-w-0">
          <Link
            to="/projects"
            className="text-slate-500 hover:text-brand-700 font-medium transition-colors"
          >
            {tx('Dự án', 'Projects')}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200/80 shrink-0">
            {project.code}
          </span>
          <span className="font-semibold text-ink tracking-[-0.01em] truncate">
            {project.name}
          </span>
          <button
            type="button"
            disabled={favoriteMutation.isPending}
            onClick={() => favoriteMutation.mutate(!isFav)}
            title={
              isFav
                ? tx('Bỏ ghim yêu thích', 'Remove from favorites')
                : tx('Gắn sao & ghim dự án lên đầu', 'Star & pin project to top')
            }
            aria-label={
              isFav
                ? tx('Bỏ ghim yêu thích', 'Remove from favorites')
                : tx('Gắn sao & ghim dự án lên đầu', 'Star & pin project to top')
            }
            className={`p-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
              isFav
                ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>
          {readOnly && (
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
              <Eye className="w-3 h-3" />{' '}
              {tx(
                `Chế độ chỉ xem (${project.myRole || 'PM'})`,
                `Read-only mode (${project.myRole || 'PM'})`,
              )}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 -mb-px overflow-x-auto">
        {tabs.map((tab) => {
          const active = location.pathname.startsWith(tab.to);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                active
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-600 hover:text-ink hover:border-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
