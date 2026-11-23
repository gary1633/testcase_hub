import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, KeyRound, LogOut, Pencil, Search, Sparkles, Users } from 'lucide-react';
import { canCreateUsers } from '@tcms/shared';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../lib/api';
import { ROLE_STYLE, getInitials } from '../lib/badges';
import { ChangePasswordModal } from './ChangePasswordModal';
import { EditProfileModal } from './EditProfileModal';
import { ThemePicker } from './ThemePicker';
import { LanguageToggle } from './LanguageToggle';
import { CommandPalette } from './CommandPalette';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const { tx } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data: resetRequests = [] } = useQuery({
    queryKey: ['password-reset-requests', user?.id],
    queryFn: api.listPasswordResetRequests,
    enabled: canCreateUsers(user?.role),
    staleTime: 30_000,
  });

  const pendingResetCount = resetRequests.filter((r) => r.status === 'PENDING').length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isProjects = location.pathname.startsWith('/projects');
  const isMyWork = location.pathname.startsWith('/my-work');
  const isUsers = location.pathname.startsWith('/users');

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      <header className="h-14 bg-white/92 backdrop-blur-md border-b border-hairline px-5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <Link to="/projects" className="flex items-center gap-3 group">
            <span
              className={
                isDark
                  ? 'force-light inline-flex items-center px-2 py-1 rounded-lg shadow-xs'
                  : 'inline-flex items-center'
              }
            >
              <img
                src="/finx-logo.png"
                alt="FinX"
                className="h-5 sm:h-6 w-auto object-contain select-none"
              />
            </span>
            <span className="h-5 w-px bg-hairline" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink tracking-[-0.015em] text-[15px]">
                TestCase Hub
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200/80">
                QA
              </span>
            </div>
          </Link>

          <nav aria-label={tx('Điều hướng chính', 'Primary navigation')} className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-hairline/80">
            <Link
              to="/projects"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[13px] font-medium transition-all ${
                isProjects
                  ? 'bg-white text-brand-700 shadow-xs border border-hairline/80'
                  : 'text-slate-600 hover:text-ink border border-transparent'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              {tx('Dự án', 'Projects')}
            </Link>
            <Link
              to="/my-work"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[13px] font-medium transition-all ${
                isMyWork
                  ? 'bg-white text-brand-700 shadow-xs border border-hairline/80'
                  : 'text-slate-600 hover:text-ink border border-transparent'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {tx('Việc của tôi', 'My Work')}
            </Link>
            {canCreateUsers(user?.role) && (
              <Link
                to="/users"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[13px] font-medium transition-all ${
                  isUsers
                    ? 'bg-white text-brand-700 shadow-xs border border-hairline/80'
                    : 'text-slate-600 hover:text-ink border border-transparent'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                {tx('Thành viên', 'Members')}
                {pendingResetCount > 0 && (
                  <span
                    title={tx(
                      `${pendingResetCount} yêu cầu đặt lại mật khẩu đang chờ`,
                      `${pendingResetCount} pending password reset requests`,
                    )}
                    className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-amber-500 text-white tabular-nums"
                  >
                    {pendingResetCount}
                  </span>
                )}
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setShowSearch(true)}
            title={tx('Tìm kiếm nhanh (Ctrl + K)', 'Quick Search (Ctrl + K)')}
            aria-label={tx('Tìm kiếm nhanh', 'Quick Search')}
            className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-hairline bg-canvas/80 hover:bg-white text-xs text-slate-500 hover:text-ink transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span>{tx('Tìm nhanh...', 'Quick jump...')}</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white border border-hairline font-mono text-[10px] text-slate-400">
              Ctrl K
            </kbd>
          </button>
        </div>

        {user && (
          <div className="flex items-center gap-2.5">
            <span
              className={`hidden md:inline-flex text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                ROLE_STYLE[user.role]?.className || 'bg-slate-100 text-slate-700'
              }`}
            >
              {ROLE_STYLE[user.role]?.label || user.role}
            </span>

            <div className="pl-2.5 border-l border-hairline">
              <button
                type="button"
                onClick={() => setShowEditProfile(true)}
                title={tx('Chỉnh sửa thông tin cá nhân', 'Edit personal profile')}
                aria-label={tx('Chỉnh sửa thông tin cá nhân', 'Edit personal profile')}
                className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-slate-100/80 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-semibold flex items-center justify-center shrink-0 shadow-xs">
                  {getInitials(user.fullName)}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-[13px] font-semibold text-ink leading-tight flex items-center gap-1.5">
                    <span>{user.fullName}</span>
                    <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:text-brand-600 transition-opacity" />
                  </div>
                  <div className="text-[11px] text-slate-500 leading-tight">{user.email}</div>
                </div>
              </button>
            </div>

            <LanguageToggle />
            <ThemePicker />

            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              title={tx('Đổi mật khẩu', 'Change password')}
              aria-label={tx('Đổi mật khẩu', 'Change password')}
              className="p-2 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              title={tx('Đăng xuất', 'Sign out')}
              aria-label={tx('Đăng xuất', 'Sign out')}
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col min-h-0">{children}</main>

      {showEditProfile && (
        <EditProfileModal
          onClose={() => setShowEditProfile(false)}
          onOpenChangePassword={() => setShowChangePassword(true)}
        />
      )}

      {user?.mustChangePassword ? (
        <ChangePasswordModal forced onClose={() => {}} />
      ) : (
        showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        )
      )}

      <CommandPalette open={showSearch} onClose={() => setShowSearch(false)} />
    </div>
  );
}
