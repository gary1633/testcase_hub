import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import {
  USER_ROLES,
  canCreateUsers,
  canManageAllUsers,
  canResetPasswordFor,
  creatableRolesFor,
  type TeamDto,
  type UserDto,
  type UserRole,
} from '@tcms/shared';
import { api } from '../lib/api';
import { ROLE_STYLE, TEAM_COLOR_STYLE, getInitials, getTeamColorStyle } from '../lib/badges';
import { Select } from '../components/Select';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%';
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  return [
    'F',
    'x',
    pick(upper),
    pick(lower),
    pick(symbols),
    pick(digits),
    pick(digits),
    pick(upper),
    pick(lower),
    pick(digits),
  ].join('');
}

function formatDateTime(iso: string, locale = 'vi-VN'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

type TeamFilter = 'ALL' | 'UNASSIGNED' | string;

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const { tx, lang } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('ALL');

  const canManageAll = canManageAllUsers(currentUser?.role);
  const canCreate = canCreateUsers(currentUser?.role);
  const allowedRolesToAssign = creatableRolesFor(currentUser?.role);

  // Create user modal state
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('QA');
  const [createMustChange, setCreateMustChange] = useState(true);
  const [createTeamIds, setCreateTeamIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Team (Workstream) create / edit modal state
  const [teamModal, setTeamModal] = useState<{
    mode: 'create' | 'edit';
    team?: TeamDto;
  } | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [teamColor, setTeamColor] = useState('brand');
  const [teamMemberIds, setTeamMemberIds] = useState<Set<string>>(new Set());
  const [teamMemberSearch, setTeamMemberSearch] = useState('');
  const [teamError, setTeamError] = useState<string | null>(null);

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState<UserDto | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [resetMustChange, setResetMustChange] = useState(true);
  const [showResetPassword, setShowResetPassword] = useState(true);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDoneInfo, setResetDoneInfo] = useState<{
    email: string;
    fullName: string;
    password: string;
    mustChange: boolean;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: api.listUsers,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: api.listTeams,
  });

  const { data: resetRequests = [] } = useQuery({
    queryKey: ['password-reset-requests', currentUser?.id],
    queryFn: api.listPasswordResetRequests,
    enabled: canCreate,
  });

  const pendingRequests = resetRequests.filter((r) => r.status === 'PENDING');
  const pendingUserIds = new Set(pendingRequests.map((r) => r.userId));

  const createMutation = useMutation({
    mutationFn: api.createUser,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setShowCreate(false);
      setEmail('');
      setFullName('');
      setPassword('');
      setRole('QA');
      setCreateMustChange(true);
      setCreateTeamIds(new Set());
      setError(null);
      toast.success(
        tx(
          `Đã tạo tài khoản cho ${created.fullName}`,
          `Created account for ${created.fullName}`,
        ),
      );
    },
    onError: (err) => {
      const msg =
        err instanceof Error
          ? err.message
          : tx('Lỗi tạo tài khoản', 'Failed to create account');
      setError(msg);
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof api.updateUser>[1] }) =>
      api.updateUser(id, payload),
    onSuccess: (updated, vars) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      if (vars.payload.isActive !== undefined) {
        toast.success(
          vars.payload.isActive
            ? tx(
                `Đã kích hoạt lại tài khoản ${updated.fullName}`,
                `Reactivated account for ${updated.fullName}`,
              )
            : tx(
                `Đã khóa tài khoản ${updated.fullName}`,
                `Locked account for ${updated.fullName}`,
              ),
        );
      } else {
        toast.success(
          tx(
            `Đã cập nhật vai trò cho ${updated.fullName}`,
            `Updated role for ${updated.fullName}`,
          ),
        );
      }
    },
    onError: (err) =>
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Không thể cập nhật thành viên', 'Unable to update member'),
      ),
  });

  const saveTeamMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: teamName.trim(),
        description: teamDesc.trim() || null,
        color: teamColor,
        memberIds: Array.from(teamMemberIds),
      };
      if (teamModal?.mode === 'edit' && teamModal.team) {
        return api.updateTeam(teamModal.team.id, payload);
      }
      return api.createTeam(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setTeamModal(null);
      setTeamError(null);
      toast.success(
        teamModal?.mode === 'edit'
          ? tx(`Đã cập nhật Team "${saved.name}"`, `Updated Team "${saved.name}"`)
          : tx(
              `Đã tạo Team "${saved.name}" (${saved.memberCount} thành viên)`,
              `Created Team "${saved.name}" (${saved.memberCount} members)`,
            ),
      );
    },
    onError: (err) => {
      const msg =
        err instanceof Error ? err.message : tx('Không thể lưu Team', 'Unable to save Team');
      setTeamError(msg);
      toast.error(msg);
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id: string) => api.deleteTeam(id),
    onSuccess: (_res, deletedId) => {
      if (teamFilter === deletedId) setTeamFilter('ALL');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(tx('Đã xóa Team / Workstream', 'Deleted Team / Workstream'));
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : tx('Không thể xóa Team', 'Unable to delete Team'),
      ),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({
      id,
      newPassword,
      mustChangePassword,
    }: {
      id: string;
      newPassword: string;
      mustChangePassword: boolean;
    }) => api.resetUserPassword(id, { newPassword, mustChangePassword }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
      if (resetTarget) {
        setResetDoneInfo({
          email: resetTarget.email,
          fullName: resetTarget.fullName,
          password: vars.newPassword,
          mustChange: vars.mustChangePassword,
        });
        toast.success(
          tx(
            `Đã đặt lại mật khẩu tạm cho ${resetTarget.fullName}`,
            `Reset temporary password for ${resetTarget.fullName}`,
          ),
        );
      }
      setResetError(null);
    },
    onError: (err) => {
      const msg =
        err instanceof Error
          ? err.message
          : tx('Không thể đặt lại mật khẩu', 'Unable to reset password');
      setResetError(msg);
      toast.error(msg);
    },
  });

  const dismissRequestMutation = useMutation({
    mutationFn: api.dismissPasswordResetRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
      toast.info(tx('Đã bỏ qua yêu cầu đặt lại mật khẩu', 'Dismissed password reset request'));
    },
    onError: (err) =>
      toast.error(
        err instanceof Error
          ? err.message
          : tx('Không thể xử lý yêu cầu', 'Unable to process request'),
      ),
  });

  const openCreateTeamModal = () => {
    setTeamName('');
    setTeamDesc('');
    setTeamColor('brand');
    setTeamMemberIds(new Set());
    setTeamMemberSearch('');
    setTeamError(null);
    setTeamModal({ mode: 'create' });
  };

  const openEditTeamModal = (team: TeamDto) => {
    setTeamName(team.name);
    setTeamDesc(team.description || '');
    setTeamColor(team.color || 'brand');
    setTeamMemberIds(new Set(team.members.map((m) => m.userId)));
    setTeamMemberSearch('');
    setTeamError(null);
    setTeamModal({ mode: 'edit', team });
  };

  const openResetModal = (target: UserDto) => {
    setResetTarget(target);
    setResetPasswordVal(generateTempPassword());
    setResetMustChange(true);
    setShowResetPassword(true);
    setResetError(null);
    setResetDoneInfo(null);
    setCopiedKey(null);
  };

  const closeResetModal = () => {
    setResetTarget(null);
    setResetDoneInfo(null);
    setResetError(null);
    setCopiedKey(null);
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const activeUsersCount = users.filter((u) => u.isActive).length;
  const unassignedCount = users.filter((u) => (u.teams ?? []).length === 0).length;
  const activeTeam =
    teamFilter !== 'ALL' && teamFilter !== 'UNASSIGNED'
      ? teams.find((t) => t.id === teamFilter) ?? null
      : null;

  const filtered = users.filter((u) => {
    if (teamFilter === 'UNASSIGNED' && (u.teams ?? []).length > 0) return false;
    if (
      teamFilter !== 'ALL' &&
      teamFilter !== 'UNASSIGNED' &&
      !(u.teams ?? []).some((t) => t.id === teamFilter)
    ) {
      return false;
    }
    if (roleFilter && u.role !== roleFilter) return false;

    const q = search.trim().toLowerCase();
    if (!q) return true;
    const teamMatch = (u.teams ?? []).some((t) => t.name.toLowerCase().includes(q));
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      teamMatch
    );
  });

  return (
    <div className="max-w-7xl w-full mx-auto px-5 py-7 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-[-0.02em]">
            {tx('Thành viên & Workstreams', 'Members & Workstreams')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {tx(
              'Quản lý tài khoản nhân sự, phân nhóm theo Team (Workstream) và phân quyền hệ thống.',
              'Manage team members, organize by Workstream (Team), and configure role permissions.',
            )}
          </p>
        </div>

        {canCreate && (
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={openCreateTeamModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-canvas text-ink border border-hairline text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <Layers className="w-4 h-4 text-brand-600" />
              {tx('Tạo Team', 'New Team')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPassword(generateTempPassword());
                setCreateMustChange(true);
                setCreateTeamIds(activeTeam ? new Set([activeTeam.id]) : new Set());
                setError(null);
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl shadow-xs shadow-brand-600/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              {tx('Thêm thành viên', 'Add Member')}
            </button>
          </div>
        )}
      </div>

      {/* Compact Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {tx('Tổng thành viên', 'Total Members')}
            </div>
            <div className="text-xl font-bold text-ink tabular-nums mt-0.5">{users.length}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {tx('Đang hoạt động', 'Active')}
            </div>
            <div className="text-xl font-bold text-emerald-700 tabular-nums mt-0.5">
              {activeUsersCount}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">Teams / Workstreams</div>
            <div className="text-xl font-bold text-ink tabular-nums mt-0.5">{teams.length}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-hairline px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {tx('Yêu cầu reset MK', 'Password Resets')}
            </div>
            <div
              className={`text-xl font-bold tabular-nums mt-0.5 ${
                pendingRequests.length > 0 ? 'text-amber-600' : 'text-ink'
              }`}
            >
              {pendingRequests.length}
            </div>
          </div>
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              pendingRequests.length > 0
                ? 'bg-amber-50 text-amber-600'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <BellRing className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Pending Forgot Password Requests Banner */}
      {pendingRequests.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <BellRing className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-900">
                {tx(
                  `Yêu cầu quên mật khẩu đang chờ xử lý (${pendingRequests.length})`,
                  `Pending Password Reset Requests (${pendingRequests.length})`,
                )}
              </h2>
              <p className="text-xs text-amber-800/80">
                {tx(
                  'Bấm cấp mật khẩu tạm để hỗ trợ thành viên đăng nhập lại ngay',
                  'Click issue temporary password to help members sign back in immediately',
                )}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {pendingRequests.map((req) => {
              const matchedUser = users.find((u) => u.id === req.userId);
              return (
                <div
                  key={req.id}
                  className="bg-white rounded-xl border border-amber-200/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-ink">{req.fullName}</span>
                      <span className="text-xs text-slate-500">{req.email}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          ROLE_STYLE[req.role]?.className || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {ROLE_STYLE[req.role]?.label || req.role}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 tabular-nums">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(req.createdAt, lang === 'en' ? 'en-US' : 'vi-VN')}
                      </span>
                    </div>
                    {req.note && (
                      <p className="text-xs text-slate-600 mt-1 bg-canvas px-2.5 py-1.5 rounded-lg border border-hairline">
                        “{req.note}”
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={dismissRequestMutation.isPending}
                      onClick={() => dismissRequestMutation.mutate(req.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-ink hover:bg-slate-100 rounded-lg border border-hairline cursor-pointer"
                    >
                      {tx('Bỏ qua', 'Dismiss')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (matchedUser) {
                          openResetModal(matchedUser);
                        } else {
                          openResetModal({
                            id: req.userId,
                            email: req.email,
                            fullName: req.fullName,
                            role: req.role,
                            isActive: true,
                            createdAt: req.createdAt,
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-xs cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {tx('Cấp mật khẩu mới', 'Issue New Password')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main 2-Pane Split Workspace: Workstreams Sidebar + Members Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sidebar: Workstreams / Teams */}
        <aside className="lg:col-span-4 xl:col-span-3 bg-white rounded-2xl border border-hairline overflow-hidden">
          <div className="px-4 py-3 border-b border-hairline bg-canvas/50 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {tx('Nhóm / Workstreams', 'Teams / Workstreams')}
            </span>
            {canCreate && (
              <button
                type="button"
                onClick={openCreateTeamModal}
                title={tx('Tạo Team mới', 'Create new Team')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {tx('Mới', 'New')}
              </button>
            )}
          </div>

          <div className="p-2.5 space-y-1">
            {/* All Members */}
            <button
              type="button"
              onClick={() => setTeamFilter('ALL')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] transition-all cursor-pointer border-l-2 ${
                teamFilter === 'ALL'
                  ? 'bg-brand-50 text-brand-700 font-semibold border-brand-600'
                  : 'text-slate-700 hover:bg-canvas border-transparent'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Users className="w-4 h-4 shrink-0" />
                {tx('Tất cả thành viên', 'All Members')}
              </span>
              <span className="text-[11px] font-mono tabular-nums px-2 py-0.2 rounded-full bg-canvas border border-hairline text-slate-600">
                {users.length}
              </span>
            </button>

            {/* Unassigned Members */}
            {unassignedCount > 0 && (
              <button
                type="button"
                onClick={() => setTeamFilter('UNASSIGNED')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] transition-all cursor-pointer border-l-2 ${
                  teamFilter === 'UNASSIGNED'
                    ? 'bg-brand-50 text-brand-700 font-semibold border-brand-600'
                    : 'text-slate-600 hover:bg-canvas border-transparent'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Shield className="w-4 h-4 shrink-0 text-slate-400" />
                  {tx('Chưa gán Team', 'Unassigned')}
                </span>
                <span className="text-[11px] font-mono tabular-nums px-2 py-0.2 rounded-full bg-slate-100 text-slate-500">
                  {unassignedCount}
                </span>
              </button>
            )}

            <div className="pt-2 mt-2 border-t border-hairline/80 space-y-1">
              {teams.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs text-slate-400">
                  {tx('Chưa có Team / Workstream nào.', 'No Teams / Workstreams yet.')}
                </div>
              ) : (
                teams.map((team) => {
                  const style = getTeamColorStyle(team.color);
                  const isSelected = teamFilter === team.id;
                  return (
                    <div
                      key={team.id}
                      onClick={() => setTeamFilter(team.id)}
                      className={`group rounded-xl px-3 py-2.5 transition-all cursor-pointer border-l-2 ${
                        isSelected
                          ? 'bg-brand-50/80 border-brand-600'
                          : 'hover:bg-canvas border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                          <span
                            className={`text-[13px] truncate ${
                              isSelected ? 'font-semibold text-brand-700' : 'font-medium text-ink'
                            }`}
                          >
                            {team.name}
                          </span>
                        </div>

                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[11px] font-mono tabular-nums text-slate-500 group-hover:hidden">
                            {team.memberCount}
                          </span>
                          {canCreate && (
                            <div className="hidden group-hover:flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => openEditTeamModal(team)}
                                title={tx('Sửa Team & thành viên', 'Edit Team & members')}
                                aria-label={tx(`Chỉnh sửa Team ${team.name}`, `Edit Team ${team.name}`)}
                                className="p-1 rounded-md text-slate-400 hover:text-brand-600 hover:bg-white cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: tx(`Xóa Team "${team.name}"?`, `Delete Team "${team.name}"?`),
                                    description: tx(
                                      'Chỉ xóa nhóm Team/Workstream này. Các tài khoản thành viên bên trong vẫn được giữ nguyên.',
                                      'Only this Team/Workstream group will be deleted. Member accounts inside will remain intact.',
                                    ),
                                    confirmText: tx('Xóa Team', 'Delete Team'),
                                    variant: 'danger',
                                  });
                                  if (ok) deleteTeamMutation.mutate(team.id);
                                }}
                                title={tx('Xóa Team', 'Delete Team')}
                                aria-label={tx(`Xóa Team ${team.name}`, `Delete Team ${team.name}`)}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-white cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {team.description && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 pl-4.5">
                          {team.description}
                        </p>
                      )}

                      {team.members.length > 0 && (
                        <div className="flex items-center -space-x-1.5 mt-2 pl-4.5">
                          {team.members.slice(0, 5).map((m) => (
                            <span
                              key={m.userId}
                              title={`${m.fullName} (${ROLE_STYLE[m.role]?.label || m.role})`}
                              className="w-5 h-5 rounded-full bg-white border border-hairline text-[9px] font-bold text-brand-700 flex items-center justify-center shadow-2xs"
                            >
                              {getInitials(m.fullName)}
                            </span>
                          ))}
                          {team.members.length > 5 && (
                            <span className="w-5 h-5 rounded-full bg-slate-100 border border-hairline text-[9px] font-semibold text-slate-600 flex items-center justify-center">
                              +{team.members.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* Right Main Pane: Members Directory Table */}
        <section className="lg:col-span-8 xl:col-span-9 bg-white rounded-2xl border border-hairline overflow-hidden shadow-2xs">
          {/* Directory Toolbar */}
          <div className="px-5 py-3.5 border-b border-hairline bg-canvas/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {activeTeam ? (
                <>
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${getTeamColorStyle(activeTeam.color).dot}`}
                  />
                  <h2 className="text-sm font-bold text-ink truncate">{activeTeam.name}</h2>
                  <span className="text-xs font-mono text-slate-500">({filtered.length})</span>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => openEditTeamModal(activeTeam)}
                      className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-lg border border-brand-200 transition-colors cursor-pointer shrink-0"
                    >
                      <Pencil className="w-3 h-3" />
                      {tx('Sửa thành viên Team', 'Edit Team Members')}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-sm font-bold text-ink">
                    {teamFilter === 'UNASSIGNED'
                      ? tx('Thành viên chưa gán Team', 'Unassigned Members')
                      : tx('Danh sách Thành viên', 'Members Directory')}
                  </h2>
                  <span className="text-xs font-mono px-2 py-0.2 rounded-full bg-white border border-hairline text-slate-500">
                    {filtered.length}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tx('Tìm tên, email, team...', 'Search name, email, team...')}
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-hairline rounded-xl w-44 xl:w-52 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>
              <Select
                value={roleFilter}
                onChange={setRoleFilter}
                size="xs"
                className="py-1.5 min-w-[132px]"
                options={[
                  { value: '', label: tx('Vai trò: Tất cả', 'Role: All') },
                  ...USER_ROLES.map((r) => ({
                    value: r,
                    label: ROLE_STYLE[r]?.label || r,
                  })),
                ]}
              />
            </div>
          </div>

          {/* Crisp 4-Column Members Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/70 border-b border-hairline text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 whitespace-nowrap">{tx('Thành viên', 'Member')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">Workstream (Team)</th>
                  <th className="px-4 py-3 whitespace-nowrap">{tx('Vai trò', 'Role')}</th>
                  <th className="px-5 py-3 text-right whitespace-nowrap">{tx('Thao tác', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-xs">
                      {tx('Đang tải danh sách thành viên...', 'Loading members...')}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-xs">
                      {tx(
                        'Không tìm thấy thành viên nào phù hợp với bộ lọc hiện tại.',
                        'No members match the current filters.',
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const hasPendingReset = pendingUserIds.has(u.id);
                    const canEditThisRow =
                      canManageAll && (currentUser?.role === 'ADMIN' || u.role !== 'ADMIN');
                    const canResetThisRow = canResetPasswordFor(currentUser?.role, u.role);
                    const userTeams = u.teams ?? [];
                    const isSelf = u.id === currentUser?.id;

                    return (
                      <tr key={u.id} className="hover:bg-canvas/60 transition-colors">
                        {/* Member Identity (Avatar + Name + Email stacked) */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3 min-w-[200px]">
                            <div className="relative shrink-0">
                              <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-200/80 text-brand-700 text-xs font-bold flex items-center justify-center">
                                {getInitials(u.fullName)}
                              </div>
                              <span
                                title={
                                  u.isActive
                                    ? tx('Đang hoạt động', 'Active')
                                    : tx('Đã khóa', 'Locked')
                                }
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                                  u.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-ink text-[13.5px] flex items-center gap-1.5 flex-wrap">
                                <span className="truncate">{u.fullName}</span>
                                {isSelf && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                    {tx('Bạn', 'You')}
                                  </span>
                                )}
                                {hasPendingReset && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                    {tx('Chờ reset MK', 'Reset Pending')}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 truncate mt-0.5">{u.email}</div>
                              {u.mustChangePassword && (
                                <div className="text-[11px] text-amber-700 mt-0.5">
                                  {tx('Đang dùng mật khẩu tạm', 'Using temporary password')}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Teams / Workstreams */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {userTeams.length === 0 ? (
                              <span className="text-xs text-slate-400 italic">
                                {tx('Chưa gán', 'Unassigned')}
                              </span>
                            ) : (
                              userTeams.map((t) => {
                                const tStyle = getTeamColorStyle(t.color);
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTeamFilter(t.id)}
                                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap transition-opacity hover:opacity-85 cursor-pointer ${tStyle.className}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tStyle.dot}`} />
                                    {t.name}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </td>

                        {/* Role + Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1.5">
                            {canEditThisRow ? (
                              <Select
                                value={u.role}
                                variant="custom"
                                onChange={(v) =>
                                  updateMutation.mutate({
                                    id: u.id,
                                    payload: { role: v as UserRole },
                                  })
                                }
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full border gap-1.5 ${
                                  ROLE_STYLE[u.role]?.className
                                }`}
                                options={allowedRolesToAssign.map((r) => ({
                                  value: r,
                                  label: ROLE_STYLE[r]?.label || r,
                                }))}
                              />
                            ) : (
                              <span
                                className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${
                                  ROLE_STYLE[u.role]?.className
                                }`}
                              >
                                {ROLE_STYLE[u.role]?.label || u.role}
                              </span>
                            )}
                            {!u.isActive && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                                <UserX className="w-3 h-3" />{' '}
                                {tx('Tài khoản đã khóa', 'Account locked')}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          {canEditThisRow || canResetThisRow ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {canResetThisRow && (
                                <button
                                  type="button"
                                  onClick={() => openResetModal(u)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50/70 hover:bg-brand-100/80 px-2.5 py-1.5 rounded-lg border border-brand-200 transition-colors cursor-pointer"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  {tx('Đặt lại MK', 'Reset Password')}
                                </button>
                              )}
                              {canEditThisRow && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateMutation.mutate({
                                      id: u.id,
                                      payload: { isActive: !u.isActive },
                                    })
                                  }
                                  title={
                                    u.isActive
                                      ? tx('Khóa tài khoản', 'Lock account')
                                      : tx('Mở khóa tài khoản', 'Unlock account')
                                  }
                                  className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                                    u.isActive
                                      ? 'text-slate-600 hover:text-rose-700 border-hairline hover:bg-rose-50 hover:border-rose-200'
                                      : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                  }`}
                                >
                                  {u.isActive ? (
                                    <>
                                      <Lock className="w-3.5 h-3.5" />
                                      {tx('Khóa', 'Lock')}
                                    </>
                                  ) : (
                                    <>
                                      <Unlock className="w-3.5 h-3.5" />
                                      {tx('Mở khóa', 'Unlock')}
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {u.role === 'ADMIN'
                                ? tx('Tài khoản Admin', 'Admin Account')
                                : tx('Chỉ xem', 'View only')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Create / Edit Team (Workstream) Modal */}
      {teamModal && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between bg-canvas/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-ink">
                  {teamModal.mode === 'create'
                    ? tx('Tạo Team / Workstream mới', 'Create New Team / Workstream')
                    : tx(
                        `Chỉnh sửa Team "${teamModal.team?.name}"`,
                        `Edit Team "${teamModal.team?.name}"`,
                      )}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTeamModal(null)}
                aria-label={tx('Đóng', 'Close')}
                className="p-1 text-slate-400 hover:text-ink rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setTeamError(null);
                saveTeamMutation.mutate();
              }}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {tx('Tên Team / Workstream *', 'Team / Workstream Name *')}
                  </label>
                  <input
                    required
                    autoFocus
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder={tx(
                      'VD: Payments & Checkout, Core Banking...',
                      'e.g. Payments & Checkout, Core Banking...',
                    )}
                    className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {tx('Màu nhãn', 'Badge Color')}
                  </label>
                  <Select
                    value={teamColor}
                    onChange={setTeamColor}
                    size="md"
                    className="w-full"
                    options={Object.entries(TEAM_COLOR_STYLE).map(([k, v]) => ({
                      value: k,
                      label: v.label,
                      dotClassName: v.dot,
                    }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {tx('Mô tả phạm vi (tùy chọn)', 'Scope description (optional)')}
                </label>
                <input
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                  placeholder={tx(
                    'VD: Phụ trách kiểm thử ví điện tử, cổng thanh toán & đối soát...',
                    'e.g. Owns e-wallet, payment gateway & reconciliation QA...',
                  )}
                  className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    {tx(
                      `Thành viên trong Team (${teamMemberIds.size} đã chọn)`,
                      `Team Members (${teamMemberIds.size} selected)`,
                    )}
                  </label>
                  {teamMemberIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setTeamMemberIds(new Set())}
                      className="text-[11px] font-medium text-slate-500 hover:text-ink cursor-pointer"
                    >
                      {tx('Bỏ chọn tất cả', 'Clear all')}
                    </button>
                  )}
                </div>

                <div className="border border-hairline rounded-xl overflow-hidden">
                  <div className="p-2.5 bg-canvas/60 border-b border-hairline">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={teamMemberSearch}
                        onChange={(e) => setTeamMemberSearch(e.target.value)}
                        placeholder={tx(
                          'Tìm thành viên theo tên, email hoặc vai trò...',
                          'Search members by name, email, or role...',
                        )}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-hairline rounded-lg focus:outline-none focus:border-brand-600"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {users
                      .filter((u) => {
                        const q = teamMemberSearch.trim().toLowerCase();
                        if (!q) return true;
                        const rLabel = (ROLE_STYLE[u.role]?.label ?? u.role).toLowerCase();
                        return (
                          u.fullName.toLowerCase().includes(q) ||
                          u.email.toLowerCase().includes(q) ||
                          rLabel.includes(q)
                        );
                      })
                      .map((u) => {
                        const checked = teamMemberIds.has(u.id);
                        return (
                          <label
                            key={u.id}
                            className={`flex items-center justify-between gap-3 px-3.5 py-2 text-xs cursor-pointer transition-colors ${
                              checked ? 'bg-brand-50/60' : 'hover:bg-canvas'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setTeamMemberIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(u.id)) next.delete(u.id);
                                    else next.add(u.id);
                                    return next;
                                  });
                                }}
                                className="rounded border-slate-300 accent-brand-600 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-ink truncate">{u.fullName}</div>
                                <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${
                                ROLE_STYLE[u.role]?.className
                              }`}
                            >
                              {ROLE_STYLE[u.role]?.label || u.role}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>

              {teamError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {teamError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTeamModal(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saveTeamMutation.isPending}
                  className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl shadow-xs cursor-pointer"
                >
                  {saveTeamMutation.isPending
                    ? tx('Đang lưu...', 'Saving...')
                    : tx('Lưu Team', 'Save Team')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Member Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between bg-canvas/60">
              <h2 className="text-base font-bold text-ink">
                {tx('Thêm thành viên mới', 'Add New Member')}
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label={tx('Đóng', 'Close')}
                className="p-1 text-slate-400 hover:text-ink rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                createMutation.mutate({
                  email,
                  fullName,
                  password,
                  role,
                  mustChangePassword: createMustChange,
                  teamIds: Array.from(createTeamIds),
                });
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {tx('Họ tên *', 'Full Name *')}
                </label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                  placeholder={tx('VD: Nguyễn Văn A', 'e.g. Jane Doe')}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                  placeholder="qa02@company.local"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    {tx('Mật khẩu tạm (≥ 6 ký tự) *', 'Temporary password (≥ 6 chars) *')}
                  </label>
                  <button
                    type="button"
                    onClick={() => setPassword(generateTempPassword())}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {tx('Tạo ngẫu nhiên', 'Generate')}
                  </button>
                </div>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {tx('Vai trò *', 'Role *')}
                </label>
                <Select
                  value={role}
                  onChange={(v) => setRole(v as UserRole)}
                  size="md"
                  className="w-full"
                  options={allowedRolesToAssign.map((r) => ({
                    value: r,
                    label: ROLE_STYLE[r]?.label || r,
                  }))}
                />
              </div>

              {teams.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {tx('Gán vào Team / Workstream (tùy chọn)', 'Assign to Team / Workstream (optional)')}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {teams.map((t) => {
                      const active = createTeamIds.has(t.id);
                      const tStyle = getTeamColorStyle(t.color);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setCreateTeamIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.id)) next.delete(t.id);
                              else next.add(t.id);
                              return next;
                            });
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                            active
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-hairline bg-canvas text-slate-600 hover:text-ink'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${tStyle.dot}`} />
                          {t.name}
                          {active && <Check className="w-3 h-3" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={createMustChange}
                  onChange={(e) => setCreateMustChange(e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                />
                <span>
                  {tx(
                    'Yêu cầu tự đổi mật khẩu ở lần đăng nhập đầu tiên',
                    'Require password change on first sign-in',
                  )}
                </span>
              </label>

              {error && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  {tx('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl shadow-xs cursor-pointer"
                >
                  {createMutation.isPending
                    ? tx('Đang lưu...', 'Saving...')
                    : tx('Tạo tài khoản', 'Create Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between bg-canvas/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-ink">
                    {tx('Đặt lại mật khẩu thành viên', 'Reset Member Password')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {resetTarget.fullName} · {resetTarget.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeResetModal}
                aria-label={tx('Đóng', 'Close')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              {resetDoneInfo ? (
                <div>
                  <div className="flex items-center gap-2.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 mb-4">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <div className="text-xs font-semibold">
                      {tx(
                        `Đã đặt lại mật khẩu thành công cho ${resetDoneInfo.fullName}!`,
                        `Password reset successfully for ${resetDoneInfo.fullName}!`,
                      )}
                    </div>
                  </div>

                  <div className="bg-canvas rounded-xl border border-hairline p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{tx('Email đăng nhập:', 'Login email:')}</span>
                      <span className="font-semibold text-ink">{resetDoneInfo.email}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">
                        {tx('Mật khẩu tạm mới:', 'New temporary password:')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <code className="px-2 py-0.5 rounded bg-white border border-hairline font-mono font-bold text-brand-700">
                          {resetDoneInfo.password}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy(resetDoneInfo.password, 'pass')}
                          className="p-1 rounded-md text-slate-500 hover:text-brand-700 hover:bg-brand-50 cursor-pointer"
                          title={tx('Sao chép mật khẩu', 'Copy password')}
                        >
                          {copiedKey === 'pass' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    {resetDoneInfo.mustChange && (
                      <p className="text-[11px] text-amber-700 pt-1 border-t border-hairline">
                        {tx(
                          'Thành viên sẽ được yêu cầu đổi sang mật khẩu cá nhân ngay khi đăng nhập lại.',
                          'The member will be required to set a personal password on next sign-in.',
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 mt-5">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          lang === 'en'
                            ? `FinX TestCase Hub login credentials:\n- Email: ${resetDoneInfo.email}\n- Temporary password: ${resetDoneInfo.password}${
                                resetDoneInfo.mustChange
                                  ? '\n(You will be prompted to set a new password after signing in)'
                                  : ''
                              }`
                            : `Thông tin đăng nhập FinX TestCase Hub:\n- Email: ${resetDoneInfo.email}\n- Mật khẩu tạm: ${resetDoneInfo.password}${
                                resetDoneInfo.mustChange
                                  ? '\n(Hệ thống sẽ yêu cầu bạn đặt mật khẩu mới sau khi đăng nhập)'
                                  : ''
                              }`,
                          'bundle',
                        )
                      }
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl cursor-pointer"
                    >
                      {copiedKey === 'bundle' ? (
                        <>
                          <Check className="w-4 h-4" />
                          {tx('Đã sao chép tin nhắn!', 'Copied message!')}
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          {tx('Sao chép thông tin gửi nhân sự', 'Copy credentials to share')}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={closeResetModal}
                      className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl border border-hairline cursor-pointer"
                    >
                      {tx('Hoàn tất', 'Done')}
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setResetError(null);
                    if (resetPasswordVal.length < 6) {
                      setResetError(
                        tx(
                          'Mật khẩu mới cần tối thiểu 6 ký tự.',
                          'New password must be at least 6 characters.',
                        ),
                      );
                      return;
                    }
                    resetPasswordMutation.mutate({
                      id: resetTarget.id,
                      newPassword: resetPasswordVal,
                      mustChangePassword: resetMustChange,
                    });
                  }}
                  className="space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        {tx('Mật khẩu mới (≥ 6 ký tự) *', 'New password (≥ 6 chars) *')}
                      </label>
                      <button
                        type="button"
                        onClick={() => setResetPasswordVal(generateTempPassword())}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {tx('Tạo mật khẩu ngẫu nhiên', 'Generate random password')}
                      </button>
                    </div>
                    <div className="relative flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type={showResetPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={resetPasswordVal}
                          onChange={(e) => setResetPasswordVal(e.target.value)}
                          className="w-full pl-3.5 pr-10 py-2 text-sm font-mono border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPassword((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-ink cursor-pointer"
                        >
                          {showResetPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(resetPasswordVal, 'input')}
                        title={tx('Sao chép', 'Copy')}
                        className="px-2.5 py-2 rounded-xl border border-hairline text-slate-600 hover:text-brand-700 hover:border-brand-300 cursor-pointer"
                      >
                        {copiedKey === 'input' ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-canvas border border-hairline text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={resetMustChange}
                      onChange={(e) => setResetMustChange(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded accent-brand-600 cursor-pointer"
                    />
                    <span>
                      <strong className="font-semibold text-ink">
                        {tx(
                          'Bắt buộc đổi mật khẩu khi đăng nhập lại',
                          'Require password change on next sign-in',
                        )}
                      </strong>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {tx(
                          'Khuyến nghị bật để thành viên tự đặt lại mật khẩu riêng ngay sau khi dùng mật khẩu tạm này.',
                          'Recommended so the member sets a personal password right after using this temporary one.',
                        )}
                      </span>
                    </span>
                  </label>

                  {resetError && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                      {resetError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeResetModal}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                    >
                      {tx('Hủy', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={resetPasswordMutation.isPending}
                      className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl shadow-xs cursor-pointer"
                    >
                      {resetPasswordMutation.isPending
                        ? tx('Đang đặt lại...', 'Resetting...')
                        : tx('Xác nhận đặt lại', 'Confirm Reset')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
