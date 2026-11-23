import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  KeyRound,
  Layers,
  Link2,
  Plus,
  Save,
  Search,
  Send,
  Terminal,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  WEBHOOK_PROVIDERS,
  canCreateUsers,
  canEditCases,
  canManageProject,
  type CreatedCiTokenDto,
  type WebhookProvider,
} from '@tcms/shared';
import { api } from '../lib/api';
import { ROLE_STYLE, getTeamColorStyle } from '../lib/badges';
import { ProjectNav } from '../components/ProjectNav';
import { Select } from '../components/Select';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user: currentUser } = useAuth();
  const { tx, lang } = useLanguage();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const canAccessSettings = Boolean(project && canEditCases(project.myRole));

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => api.listMembers(projectId!),
    enabled: Boolean(projectId) && canAccessSettings,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: api.listUsers,
    enabled: canAccessSettings,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: api.listTeams,
    enabled: canAccessSettings,
  });

  const { data: jiraConfig } = useQuery({
    queryKey: ['project-jira', projectId],
    queryFn: () => api.getJiraConfig(projectId!),
    enabled: Boolean(projectId) && canAccessSettings,
  });

  const { data: webhookConfig } = useQuery({
    queryKey: ['project-webhook', projectId],
    queryFn: () => api.getWebhookConfig(projectId!),
    enabled: Boolean(projectId) && canAccessSettings,
  });

  const { data: ciTokens = [] } = useQuery({
    queryKey: ['project-ci-tokens', projectId],
    queryFn: () => api.listCiTokens(projectId!),
    enabled: Boolean(projectId) && canManageProject(project?.myRole),
  });

  // General form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [generalSaved, setGeneralSaved] = useState(false);

  // Member multi-select picker, team picker & member list filter
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [memberPickerSearch, setMemberPickerSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [memberListSearch, setMemberListSearch] = useState('');

  // Jira form
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraToken, setJiraToken] = useState('');
  const [jiraProjectKey, setJiraProjectKey] = useState('');
  const [jiraIssueType, setJiraIssueType] = useState('Bug');
  const [jiraEnabled, setJiraEnabled] = useState(false);
  const [jiraTestResult, setJiraTestResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [jiraSavedMsg, setJiraSavedMsg] = useState(false);

  // Webhook form
  const [webhookProvider, setWebhookProvider] = useState<WebhookProvider>('SLACK');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [notifyRunCompleted, setNotifyRunCompleted] = useState(true);
  const [notifyHighDefect, setNotifyHighDefect] = useState(true);
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  // CI/CD Tokens
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<CreatedCiTokenDto | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
    }
  }, [project]);

  useEffect(() => {
    if (jiraConfig) {
      setJiraBaseUrl(jiraConfig.baseUrl || '');
      setJiraEmail(jiraConfig.email || '');
      setJiraProjectKey(jiraConfig.projectKey || '');
      setJiraIssueType(jiraConfig.defaultIssueType || 'Bug');
      setJiraEnabled(jiraConfig.isEnabled);
      setJiraToken('');
    }
  }, [jiraConfig]);

  useEffect(() => {
    if (webhookConfig) {
      setWebhookProvider(webhookConfig.provider);
      setWebhookEnabled(webhookConfig.isEnabled);
      setNotifyRunCompleted(webhookConfig.notifyOnRunCompleted);
      setNotifyHighDefect(webhookConfig.notifyOnHighDefect);
      setWebhookUrl('');
    }
  }, [webhookConfig]);

  const updateProjectMut = useMutation({
    mutationFn: () => api.updateProject(projectId!, { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setGeneralSaved(true);
      setTimeout(() => setGeneralSaved(false), 2500);
      toast.success(tx('Đã lưu thông tin dự án', 'Saved project information'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể lưu thông tin dự án', 'Failed to save project information')),
  });

  const archiveProjectMut = useMutation({
    mutationFn: (isArchived: boolean) => api.updateProject(projectId!, { isArchived }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(
        updated.isArchived
          ? tx(`Đã lưu trữ dự án ${updated.code}`, `Archived project ${updated.code}`)
          : tx(`Đã khôi phục dự án ${updated.code}`, `Restored project ${updated.code}`),
      );
      if (updated.isArchived) {
        navigate('/projects');
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể cập nhật trạng thái lưu trữ', 'Failed to update archive status')),
  });

  const deleteProjectMut = useMutation({
    mutationFn: () => api.deleteProject(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(
        tx(
          `Đã xóa vĩnh viễn dự án ${project?.code ?? ''}`.trim(),
          `Permanently deleted project ${project?.code ?? ''}`.trim(),
        ),
      );
      navigate('/projects', { replace: true });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể xóa dự án', 'Failed to delete project')),
  });

  const addMembersBulkMut = useMutation({
    mutationFn: (userIds: string[]) => api.addMembersBulk(projectId!, userIds),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setSelectedUserIds(new Set());
      setMemberPickerSearch('');
      setShowMemberPicker(false);
      toast.success(
        res.added === 1
          ? tx('Đã thêm 1 thành viên vào dự án', 'Added 1 member to the project')
          : tx(`Đã thêm ${res.added} thành viên vào dự án`, `Added ${res.added} members to the project`),
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể thêm thành viên', 'Failed to add members')),
  });

  const addTeamToProjectMut = useMutation({
    mutationFn: (teamId: string) => api.addTeamToProject(projectId!, teamId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowTeamPicker(false);
      toast.success(
        res.added > 0
          ? tx(
              `Đã thêm ${res.added} thành viên từ Team "${res.teamName}" vào dự án`,
              `Added ${res.added} ${res.added === 1 ? 'member' : 'members'} from Team "${res.teamName}" to the project`,
            )
          : tx(
              `Tất cả thành viên của Team "${res.teamName}" đã có trong dự án`,
              `All members of Team "${res.teamName}" are already in this project`,
            ),
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể thêm Team vào dự án', 'Failed to add Team to project')),
  });

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => api.removeMember(projectId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success(tx('Đã xóa thành viên khỏi dự án', 'Removed member from project'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể xóa thành viên', 'Failed to remove member')),
  });

  const saveJiraMut = useMutation({
    mutationFn: () =>
      api.saveJiraConfig(projectId!, {
        baseUrl: jiraBaseUrl,
        email: jiraEmail,
        apiToken: jiraToken || undefined,
        projectKey: jiraProjectKey,
        defaultIssueType: jiraIssueType,
        isEnabled: jiraEnabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-jira', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setJiraToken('');
      setJiraSavedMsg(true);
      setTimeout(() => setJiraSavedMsg(false), 2500);
      toast.success(tx('Đã lưu cấu hình Jira', 'Saved Jira configuration'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể lưu cấu hình Jira', 'Failed to save Jira configuration')),
  });

  const testJiraMut = useMutation({
    mutationFn: () => api.testJiraConnection(projectId!),
    onSuccess: (res) => {
      setJiraTestResult(res);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Kiểm tra kết nối Jira thất bại', 'Jira connection test failed')),
  });

  const saveWebhookMut = useMutation({
    mutationFn: () =>
      api.saveWebhookConfig(projectId!, {
        provider: webhookProvider,
        webhookUrl: webhookUrl.trim() || undefined,
        isEnabled: webhookEnabled,
        notifyOnRunCompleted: notifyRunCompleted,
        notifyOnHighDefect: notifyHighDefect,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-webhook', projectId] });
      setWebhookUrl('');
      toast.success(tx('Đã lưu cấu hình Webhook thông báo', 'Saved Webhook notification settings'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể lưu Webhook', 'Failed to save Webhook')),
  });

  const testWebhookMut = useMutation({
    mutationFn: () => api.testWebhookConnection(projectId!),
    onSuccess: (res) => {
      setWebhookTestResult(res);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Gửi tin nhắn thử thất bại', 'Failed to send test message')),
  });

  const createCiTokenMut = useMutation({
    mutationFn: () => api.createCiToken(projectId!, newTokenName.trim()),
    onSuccess: (res) => {
      setNewTokenName('');
      setCreatedToken(res);
      queryClient.invalidateQueries({ queryKey: ['project-ci-tokens', projectId] });
      toast.success(tx(`Đã tạo API Token "${res.name}"`, `Created API Token "${res.name}"`));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể tạo API Token', 'Failed to create API Token')),
  });

  const revokeCiTokenMut = useMutation({
    mutationFn: (tokenId: string) => api.revokeCiToken(projectId!, tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-ci-tokens', projectId] });
      toast.success(tx('Đã thu hồi API Token', 'Revoked API Token'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : tx('Không thể thu hồi Token', 'Failed to revoke Token')),
  });

  const copyText = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success(tx('Đã sao chép vào Clipboard', 'Copied to clipboard'));
  };

  if (!project) return <div className="p-8 text-sm text-slate-400">{tx('Đang tải...', 'Loading...')}</div>;
  if (!canEditCases(project.myRole)) {
    return <Navigate to={`/projects/${projectId}/repository`} replace />;
  }

  const canManage = canManageProject(project.myRole);
  const memberIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => u.isActive && !memberIds.has(u.id));

  return (
    <div className="flex-1 flex flex-col">
      <ProjectNav project={project} />

      <div className="max-w-5xl w-full mx-auto px-5 py-6 space-y-6">
        {/* General Settings */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            {tx('Thông tin Dự án', 'Project Information')}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProjectMut.mutate();
            }}
            className="space-y-4 max-w-2xl"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Mã dự án', 'Project Code')}
                </label>
                <input
                  disabled
                  value={project.code}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Tên dự án', 'Project Name')}
                </label>
                <input
                  disabled={!canManage}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {tx('Mô tả', 'Description')}
              </label>
              <textarea
                rows={3}
                disabled={!canManage}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>

            {canManage && (
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={updateProjectMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-xs shadow-brand-600/20 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> {tx('Lưu thay đổi', 'Save Changes')}
                </button>
                {generalSaved && (
                  <span className="text-xs text-emerald-600 font-medium">
                    {tx('Đã lưu thành công!', 'Saved successfully!')}
                  </span>
                )}
              </div>
            )}
          </form>
        </section>

        {/* Jira Integration */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-600" />
                {tx('Tích hợp Jira (Jira Cloud / Server)', 'Jira Integration (Jira Cloud / Server)')}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {tx(
                  'Cấu hình kết nối Jira để mở nhanh link Story/Task từ Test Case ở Phase 1, và tự động tạo Bug / đồng bộ kết quả Test Run lên Jira ở Phase 2.',
                  'Configure Jira connection to open linked Story/Task tickets from Test Cases, automatically create Bug tickets, and sync Test Run results to Jira.',
                )}
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={jiraEnabled}
                onChange={(e) => setJiraEnabled(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              {tx('Kích hoạt Jira', 'Enable Jira')}
            </label>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setJiraTestResult(null);
              saveJiraMut.mutate();
            }}
            className="space-y-4 max-w-2xl"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Jira Base URL
                </label>
                <input
                  disabled={!canManage}
                  value={jiraBaseUrl}
                  onChange={(e) => setJiraBaseUrl(e.target.value)}
                  placeholder="https://your-company.atlassian.net"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Jira Account Email
                </label>
                <input
                  disabled={!canManage}
                  value={jiraEmail}
                  onChange={(e) => setJiraEmail(e.target.value)}
                  placeholder="qa-bot@company.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Jira API Token{' '}
                  {jiraConfig?.hasApiToken && (
                    <span className="font-normal text-emerald-600">
                      ({tx('Đã lưu:', 'Saved:')} {jiraConfig.apiTokenMasked})
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  disabled={!canManage}
                  value={jiraToken}
                  onChange={(e) => setJiraToken(e.target.value)}
                  placeholder={
                    jiraConfig?.hasApiToken
                      ? tx('Để trống nếu giữ nguyên token cũ', 'Leave blank to keep existing token')
                      : tx('Nhập Atlassian API Token', 'Enter Atlassian API Token')
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Jira Project Key mặc định', 'Default Jira Project Key')}
                </label>
                <input
                  disabled={!canManage}
                  value={jiraProjectKey}
                  onChange={(e) => setJiraProjectKey(e.target.value.toUpperCase())}
                  placeholder={tx('VD: ECOM', 'e.g., ECOM')}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Loại Issue khi tạo Bug', 'Default Bug Issue Type')}
                </label>
                <input
                  disabled={!canManage}
                  value={jiraIssueType}
                  onChange={(e) => setJiraIssueType(e.target.value)}
                  placeholder="Bug"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
              </div>
            </div>

            {jiraTestResult && (
              <div
                className={`flex items-start gap-2 text-xs p-3 rounded-lg border ${
                  jiraTestResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {jiraTestResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{jiraTestResult.message}</span>
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saveJiraMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-xs shadow-brand-600/20 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> {tx('Lưu cấu hình Jira', 'Save Jira Config')}
                </button>
                <button
                  type="button"
                  disabled={testJiraMut.isPending}
                  onClick={() => testJiraMut.mutate()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  {testJiraMut.isPending ? tx('Đang kiểm tra...', 'Testing...') : tx('Kiểm tra kết nối', 'Test Connection')}
                </button>
                {jiraSavedMsg && (
                  <span className="text-xs text-emerald-600 font-medium">
                    {tx('Đã lưu cấu hình Jira!', 'Jira configuration saved!')}
                  </span>
                )}
              </div>
            )}
          </form>
        </section>

        {/* Webhook Notifications (Slack / MS Teams / Google Chat) */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#851FB6]" />
                {tx(
                  'Thông báo Webhook (Slack / MS Teams / Google Chat)',
                  'Webhook Notifications (Slack / MS Teams / Google Chat)',
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {tx(
                  'Tự động bắn tin nhắn vào nhóm chat QA/Dev khi hoàn tất một Test Run hoặc khi phát sinh Defect mức Highest.',
                  'Automatically post messages to QA/Dev chat channels when a Test Run completes or a Highest-severity Defect is created.',
                )}
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={webhookEnabled}
                onChange={(e) => setWebhookEnabled(e.target.checked)}
                className="rounded border-slate-300 text-[#851FB6]"
              />
              {tx('Kích hoạt Webhook', 'Enable Webhook')}
            </label>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setWebhookTestResult(null);
              saveWebhookMut.mutate();
            }}
            className="space-y-4 max-w-2xl"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {tx('Nền tảng Webhook', 'Webhook Platform')}
                </label>
                <Select
                  disabled={!canManage}
                  value={webhookProvider}
                  onChange={(v) => setWebhookProvider(v as WebhookProvider)}
                  size="sm"
                  className="w-full"
                  options={WEBHOOK_PROVIDERS.map((p) => ({
                    value: p,
                    label:
                      p === 'SLACK'
                        ? 'Slack'
                        : p === 'TEAMS'
                          ? 'Microsoft Teams'
                          : p === 'GOOGLE_CHAT'
                            ? 'Google Chat'
                            : 'Custom Webhook',
                  }))}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Incoming Webhook URL{' '}
                  {webhookConfig?.hasWebhookUrl && (
                    <span className="font-normal text-emerald-600">
                      ({tx('Đã lưu:', 'Saved:')} {webhookConfig.webhookUrl})
                    </span>
                  )}
                </label>
                <input
                  type="url"
                  disabled={!canManage}
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder={
                    webhookConfig?.hasWebhookUrl
                      ? tx('Để trống nếu giữ nguyên Webhook URL cũ', 'Leave blank to keep existing Webhook URL')
                      : 'https://hooks.slack.com/services/...'
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5 text-xs text-slate-700">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={notifyRunCompleted}
                  onChange={(e) => setNotifyRunCompleted(e.target.checked)}
                  className="rounded border-slate-300 text-[#851FB6]"
                />
                {tx(
                  'Gửi thông báo khi Test Run hoàn tất (Completed)',
                  'Notify when a Test Run is Completed',
                )}
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={notifyHighDefect}
                  onChange={(e) => setNotifyHighDefect(e.target.checked)}
                  className="rounded border-slate-300 text-[#851FB6]"
                />
                {tx(
                  'Cảnh báo ngay khi có Defect mức Highest',
                  'Alert immediately on Highest-severity Defect',
                )}
              </label>
            </div>

            {webhookTestResult && (
              <div
                className={`flex items-start gap-2 text-xs p-3 rounded-lg border ${
                  webhookTestResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {webhookTestResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{webhookTestResult.message}</span>
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saveWebhookMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-xs shadow-brand-600/20 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> {tx('Lưu Webhook', 'Save Webhook')}
                </button>
                <button
                  type="button"
                  disabled={testWebhookMut.isPending || !webhookConfig?.hasWebhookUrl}
                  onClick={() => {
                    setWebhookTestResult(null);
                    testWebhookMut.mutate();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {testWebhookMut.isPending ? tx('Đang gửi thử...', 'Sending test...') : tx('Gửi tin nhắn thử', 'Send Test Message')}
                </button>
              </div>
            )}
          </form>
        </section>

        {/* CI/CD Automation Ingestion Tokens */}
        {canManage && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-emerald-600" />
                CI/CD Automation Ingestion (Playwright JSON / JUnit XML)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {tx(
                  `Tạo API Token để GitHub Actions, GitLab CI hoặc Jenkins tự đẩy kết quả test sau khi deploy, tự động tạo Test Run & khớp mã Test Case (${project.code}-12).`,
                  `Generate an API Token for GitHub Actions, GitLab CI, or Jenkins to push test results after deploy, auto-creating Test Runs & matching Test Case codes (${project.code}-12).`,
                )}
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTokenName.trim()) return;
                createCiTokenMut.mutate();
              }}
              className="flex flex-wrap items-center gap-2 max-w-xl"
            >
              <input
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder={tx('Tên token (VD: GitHub Actions E2E)', 'Token name (e.g., GitHub Actions E2E)')}
                className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600"
              />
              <button
                type="submit"
                disabled={!newTokenName.trim() || createCiTokenMut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {createCiTokenMut.isPending ? tx('Đang tạo...', 'Creating...') : tx('Tạo API Token', 'Create API Token')}
              </button>
            </form>

            {createdToken && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" />
                  {tx(
                    `Token mới đã tạo (${createdToken.name}) — Hãy sao chép ngay, hệ thống chỉ hiển thị 1 lần:`,
                    `New token created (${createdToken.name}) — Copy it now, it will only be shown once:`,
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-white border border-emerald-200 font-mono text-xs text-slate-800 select-all overflow-x-auto">
                    {createdToken.token}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText('new-token', createdToken.token)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer shrink-0"
                  >
                    {copiedId === 'new-token' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </div>
              </div>
            )}

            {ciTokens.length > 0 && (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {ciTokens.map((t) => (
                  <div key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                        <span>{t.name}</span>
                        <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {t.tokenPrefix}••••
                        </code>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {tx('Tạo bởi', 'Created by')} {t.createdByName || 'Admin'} ·{' '}
                        {t.lastUsedAt
                          ? tx(
                              `Dùng lần cuối: ${new Date(t.lastUsedAt).toLocaleString(locale)}`,
                              `Last used: ${new Date(t.lastUsedAt).toLocaleString(locale)}`,
                            )
                          : tx('Chưa sử dụng lần nào', 'Never used')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: tx(`Thu hồi API Token "${t.name}"?`, `Revoke API Token "${t.name}"?`),
                          description: tx(
                            'Các CI/CD Pipeline đang sử dụng token này sẽ lập tức không thể gửi kết quả lên hệ thống nữa.',
                            'CI/CD pipelines using this token will immediately lose access to ingest test results.',
                          ),
                          confirmText: tx('Thu hồi Token', 'Revoke Token'),
                          variant: 'danger',
                        });
                        if (ok) {
                          revokeCiTokenMut.mutate(t.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {tx('Thu hồi', 'Revoke')}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl bg-[#11131A] text-slate-200 p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">
                  {tx(
                    'Ví dụ gửi kết quả từ CI Pipeline (Playwright JSON hoặc JUnit XML)',
                    'Example: Push results from CI Pipeline (Playwright JSON or JUnit XML)',
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      'curl-cmd',
                      `curl -X POST "${window.location.origin}/api/ci/ingest?title=Nightly+E2E&environment=Staging&appVersion=2.5.0" \\\n  -H "X-Project-Token: YOUR_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  --data-binary @playwright-report.json`,
                    )
                  }
                  className="inline-flex items-center gap-1 text-[11px] text-[#E9D5FF] hover:underline cursor-pointer"
                >
                  <Copy className="w-3 h-3" /> Copy cURL
                </button>
              </div>
              <pre className="font-mono text-[11px] overflow-x-auto text-slate-300 leading-relaxed">{`curl -X POST "${window.location.origin}/api/ci/ingest?title=Nightly+E2E&environment=Staging&appVersion=2.5.0" \\
  -H "X-Project-Token: YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data-binary @playwright-report.json
${tx('# Hoặc gửi JUnit XML với:', '# Or upload JUnit XML with:')} -H "Content-Type: application/xml" --data-binary @junit-results.xml`}</pre>
            </div>
          </section>
        )}

        {/* Project Members */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                {tx(`Thành viên Dự án (${members.length})`, `Project Members (${members.length})`)}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {tx(
                  'Vai trò (Admin / QA Manager / QA Lead / QA / PM) được cố định theo tài khoản hệ thống',
                  'Roles (Admin / QA Manager / QA Lead / QA / PM) are fixed by the system account',
                )}
                {canCreateUsers(currentUser?.role) ? (
                  <>
                    {' '}
                    {tx('— tạo tài khoản mới hoặc quản lý tại mục', '— create new accounts or manage them in')}{' '}
                    <Link to="/users" className="text-brand-700 font-medium hover:underline">
                      {tx('Quản lý Thành viên', 'Members & Teams')}
                    </Link>
                    .
                  </>
                ) : (
                  tx(
                    ' do Admin / QA Manager cấp. Tại đây chỉ thêm hoặc gỡ thành viên tham gia dự án.',
                    ' assigned by Admin / QA Manager. Here you can only add or remove project members.',
                  )
                )}
              </p>
            </div>

            {canManage && (teams.length > 0 || availableUsers.length > 0) && (() => {
              const memberIdSet = new Set(members.map((m) => m.userId));
              const q = memberPickerSearch.trim().toLowerCase();
              const filteredAvailable = availableUsers.filter((u) => {
                if (!q) return true;
                const roleLabel = (ROLE_STYLE[u.role]?.label ?? u.role).toLowerCase();
                const teamNames = (u.teams ?? []).map((t) => t.name.toLowerCase()).join(' ');
                return (
                  u.fullName.toLowerCase().includes(q) ||
                  u.email.toLowerCase().includes(q) ||
                  roleLabel.includes(q) ||
                  teamNames.includes(q)
                );
              });
              const allFilteredSelected =
                filteredAvailable.length > 0 &&
                filteredAvailable.every((u) => selectedUserIds.has(u.id));

              return (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Quick Add Entire Team Popover */}
                  {teams.length > 0 && (
                    <div className={showTeamPicker ? 'relative z-30' : 'relative'}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTeamPicker((prev) => !prev);
                          setShowMemberPicker(false);
                        }}
                        className="relative z-30 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-canvas text-ink border border-hairline rounded-xl transition-colors cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5 text-brand-600" />
                        {tx('Thêm theo Team', 'Add by Team')}
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showTeamPicker ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {showTeamPicker && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setShowTeamPicker(false)}
                          />
                          <div className="absolute right-0 mt-2 z-30 w-80 sm:w-96 rounded-2xl border border-hairline bg-white shadow-2xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-hairline bg-canvas/60 flex items-center justify-between">
                              <div>
                                <div className="text-xs font-bold text-ink">
                                  {tx('Thêm cả Team (Workstream) vào dự án', 'Add Entire Team (Workstream) to Project')}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {tx(
                                    'Tự động thêm toàn bộ nhân sự đang hoạt động trong Team',
                                    'Automatically add all active members of the Team',
                                  )}
                                </div>
                              </div>
                              <Link
                                to="/users"
                                className="text-[11px] font-semibold text-brand-700 hover:underline shrink-0"
                              >
                                {tx('Quản lý Team', 'Manage Teams')}
                              </Link>
                            </div>

                            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                              {teams.map((team) => {
                                const tStyle = getTeamColorStyle(team.color);
                                const unaddedMembers = team.members.filter(
                                  (m) => m.isActive && !memberIdSet.has(m.userId),
                                );
                                return (
                                  <div
                                    key={team.id}
                                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-canvas/60 transition-colors"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ${tStyle.dot}`}
                                        />
                                        <span className="text-xs font-semibold text-ink truncate">
                                          {team.name}
                                        </span>
                                        <span
                                          className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full border ${tStyle.className}`}
                                        >
                                          {team.memberCount} {tx('người', team.memberCount === 1 ? 'member' : 'members')}
                                        </span>
                                      </div>
                                      {team.description && (
                                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                          {team.description}
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      disabled={
                                        unaddedMembers.length === 0 || addTeamToProjectMut.isPending
                                      }
                                      onClick={() => addTeamToProjectMut.mutate(team.id)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                                        unaddedMembers.length === 0
                                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                          : 'bg-brand-600 hover:bg-brand-700 text-white cursor-pointer'
                                      }`}
                                    >
                                      {unaddedMembers.length === 0
                                        ? tx('Đã đủ', 'All added')
                                        : tx(`+ Thêm (${unaddedMembers.length})`, `+ Add (${unaddedMembers.length})`)}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {availableUsers.length > 0 && (
                    <div className={showMemberPicker ? 'relative z-30' : 'relative'}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMemberPicker((prev) => !prev);
                          setShowTeamPicker(false);
                        }}
                        className="relative z-30 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-xs shadow-brand-600/20 transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {tx('Thêm thành viên', 'Add Members')}
                        {selectedUserIds.size > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded-full bg-white/25 text-white font-mono text-[10px]">
                            {selectedUserIds.size}
                          </span>
                        )}
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${showMemberPicker ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {showMemberPicker && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setShowMemberPicker(false)}
                          />
                          <div className="absolute right-0 mt-2 z-30 w-80 sm:w-96 rounded-2xl border border-hairline bg-white shadow-2xl overflow-hidden">
                            {/* Search Input */}
                            <div className="p-3 border-b border-hairline bg-canvas/60 space-y-2">
                              <div className="relative">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  autoFocus
                                  value={memberPickerSearch}
                                  onChange={(e) => setMemberPickerSearch(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setShowMemberPicker(false);
                                  }}
                                  placeholder={tx(
                                    'Tìm theo tên, email, vai trò hoặc team...',
                                    'Search by name, email, role, or team...',
                                  )}
                                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-hairline rounded-lg focus:outline-none focus:border-brand-600"
                                />
                                {memberPickerSearch && (
                                  <button
                                    type="button"
                                    onClick={() => setMemberPickerSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              {teams.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  <span className="text-[10px] font-medium text-slate-400 mr-0.5">
                                    {tx('Chọn theo Team:', 'Select by Team:')}
                                  </span>
                                  {teams.map((t) => {
                                    const availIds = t.members
                                      .filter((m) => m.isActive && !memberIdSet.has(m.userId))
                                      .map((m) => m.userId);
                                    if (availIds.length === 0) return null;
                                    const allSelected = availIds.every((id) =>
                                      selectedUserIds.has(id),
                                    );
                                    const tStyle = getTeamColorStyle(t.color);
                                    return (
                                      <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedUserIds((prev) => {
                                            const next = new Set(prev);
                                            if (allSelected) {
                                              for (const id of availIds) next.delete(id);
                                            } else {
                                              for (const id of availIds) next.add(id);
                                            }
                                            return next;
                                          });
                                        }}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold cursor-pointer ${
                                          allSelected
                                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                                            : 'border-hairline bg-white text-slate-600 hover:border-brand-300'
                                        }`}
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full ${tStyle.dot}`} />
                                        {t.name} (+{availIds.length})
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[11px] px-0.5">
                                <span className="text-slate-500">
                                  {tx('Có thể thêm:', 'Available:')}{' '}
                                  <strong>{filteredAvailable.length}</strong>{' '}
                                  {tx('người', filteredAvailable.length === 1 ? 'user' : 'users')}
                                </span>
                                {filteredAvailable.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedUserIds((prev) => {
                                        const next = new Set(prev);
                                        if (allFilteredSelected) {
                                          for (const u of filteredAvailable) next.delete(u.id);
                                        } else {
                                          for (const u of filteredAvailable) next.add(u.id);
                                        }
                                        return next;
                                      });
                                    }}
                                    className="font-semibold text-brand-700 hover:underline cursor-pointer"
                                  >
                                    {allFilteredSelected
                                      ? tx('Bỏ chọn danh sách này', 'Deselect list')
                                      : tx(`Chọn tất cả (${filteredAvailable.length})`, `Select all (${filteredAvailable.length})`)}
                                  </button>
                                )}
                              </div>
                            </div>

                        {/* Checklist */}
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                          {filteredAvailable.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400">
                              {tx('Không tìm thấy thành viên phù hợp.', 'No matching members found.')}
                            </div>
                          ) : (
                            filteredAvailable.map((u) => {
                              const checked = selectedUserIds.has(u.id);
                              const uRole = ROLE_STYLE[u.role];
                              return (
                                <label
                                  key={u.id}
                                  className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                                    checked ? 'bg-brand-50/70' : 'hover:bg-canvas'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedUserIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(u.id)) next.delete(u.id);
                                        else next.add(u.id);
                                        return next;
                                      });
                                    }}
                                    className="rounded border-slate-300 accent-brand-600 cursor-pointer shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-ink truncate">
                                      {u.fullName}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                      {u.email}
                                    </div>
                                  </div>
                                  <span
                                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${
                                      uRole?.className ?? ''
                                    }`}
                                  >
                                    {uRole?.label ?? u.role}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>

                        {/* Footer */}
                        <div className="px-3.5 py-2.5 border-t border-hairline bg-canvas/60 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-600">
                            {tx('Đã chọn', 'Selected')}{' '}
                            <strong className="text-ink">{selectedUserIds.size}</strong>{' '}
                            {tx('thành viên', selectedUserIds.size === 1 ? 'member' : 'members')}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {selectedUserIds.size > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedUserIds(new Set())}
                                className="px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-200/70 rounded-lg cursor-pointer"
                              >
                                {tx('Bỏ chọn', 'Clear')}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={selectedUserIds.size === 0 || addMembersBulkMut.isPending}
                              onClick={() =>
                                addMembersBulkMut.mutate(Array.from(selectedUserIds))
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg cursor-pointer"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              {addMembersBulkMut.isPending
                                ? tx('Đang thêm...', 'Adding...')
                                : tx(`Thêm (${selectedUserIds.size})`, `Add (${selectedUserIds.size})`)}
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                  )}
                </div>
              );
            })()}
          </div>

          {members.length > 4 && (
            <div className="relative max-w-xs mb-3">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={memberListSearch}
                onChange={(e) => setMemberListSearch(e.target.value)}
                placeholder={tx('Lọc thành viên theo tên, email, team...', 'Filter members by name, email, team...')}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-canvas border border-hairline rounded-lg focus:bg-white focus:outline-none focus:border-brand-600"
              />
            </div>
          )}

          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {members
              .filter((m) => {
                const q = memberListSearch.trim().toLowerCase();
                if (!q) return true;
                const teamStr = (m.teams ?? []).map((t) => t.name.toLowerCase()).join(' ');
                return (
                  m.fullName.toLowerCase().includes(q) ||
                  m.email.toLowerCase().includes(q) ||
                  teamStr.includes(q) ||
                  (ROLE_STYLE[m.globalRole]?.label ?? m.globalRole).toLowerCase().includes(q)
                );
              })
              .map((m) => {
              const roleMeta = ROLE_STYLE[m.globalRole] ?? ROLE_STYLE[m.projectRole];
              const isGlobalAccount =
                m.globalRole === 'ADMIN' || m.globalRole === 'QA_MANAGER';
              const isSelf = m.userId === currentUser?.id;
              const canRemoveThisMember = canManage && !isGlobalAccount && !isSelf;

              return (
                <div key={m.userId} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900 flex flex-wrap items-center gap-2">
                      <span>{m.fullName}</span>
                      {isSelf && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {tx('Bạn', 'You')}
                        </span>
                      )}
                      {(m.teams ?? []).map((t) => {
                        const tStyle = getTeamColorStyle(t.color);
                        return (
                          <span
                            key={t.id}
                            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${tStyle.className}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${tStyle.dot}`} />
                            {t.name}
                          </span>
                        );
                      })}
                    </div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center justify-center min-w-[112px] text-xs font-medium px-2.5 py-1 rounded-full border ${
                        roleMeta?.className ?? ''
                      }`}
                    >
                      {roleMeta?.label ?? m.globalRole}
                    </span>

                    {canManage && (
                      <div className="w-7 h-7 flex items-center justify-center shrink-0">
                        {canRemoveThisMember && (
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await confirm({
                                title: tx(`Gỡ ${m.fullName} khỏi dự án?`, `Remove ${m.fullName} from project?`),
                                description: tx(
                                  'Người dùng sẽ không còn nhìn thấy dự án này cho tới khi được thêm lại.',
                                  'This user will no longer see this project until added back.',
                                ),
                                confirmText: tx('Gỡ khỏi dự án', 'Remove from Project'),
                                variant: 'danger',
                              });
                              if (ok) removeMemberMut.mutate(m.userId);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title={tx('Gỡ khỏi dự án', 'Remove from project')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Danger Zone (Admin / QA Manager / QA Lead: Archive / Restore / Delete Project) */}
        {canManage && (
          <section className="bg-white rounded-xl border border-rose-200 p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                {tx(
                  'Vùng quản trị dự án (Admin / QA Manager / QA Lead)',
                  'Project Administration Zone (Admin / QA Manager / QA Lead)',
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {tx(
                  'Lưu trữ để tạm ẩn dự án khỏi danh sách làm việc mà vẫn giữ toàn bộ dữ liệu, hoặc xóa vĩnh viễn dự án test không còn sử dụng.',
                  'Archive to hide the project from the active list while preserving all data, or permanently delete an unused project.',
                )}
              </p>
            </div>

            <div className="divide-y divide-rose-100 border border-rose-100 rounded-xl overflow-hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-50/20">
                <div>
                  <div className="text-sm font-semibold text-ink">
                    {project.isArchived
                      ? tx('Khôi phục dự án từ kho lưu trữ', 'Restore Project from Archive')
                      : tx('Lưu trữ dự án (Archive)', 'Archive Project')}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {project.isArchived
                      ? tx(
                          'Đưa dự án hoạt động trở lại trong danh sách dự án của mọi thành viên.',
                          'Make this project active again in the project list for all members.',
                        )
                      : tx(
                          'Ẩn dự án khỏi danh sách chính nhưng giữ nguyên toàn bộ Test Case, Run & lịch sử.',
                          'Hide the project from the main list while preserving all Test Cases, Runs & history.',
                        )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={archiveProjectMut.isPending}
                  onClick={async () => {
                    const nextArchived = !project.isArchived;
                    const ok = await confirm({
                      title: nextArchived
                        ? tx(
                            `Lưu trữ dự án ${project.code} — ${project.name}?`,
                            `Archive project ${project.code} — ${project.name}?`,
                          )
                        : tx(
                            `Khôi phục dự án ${project.code} — ${project.name}?`,
                            `Restore project ${project.code} — ${project.name}?`,
                          ),
                      description: nextArchived
                        ? tx(
                            'Dự án sẽ được ẩn khỏi danh sách chính. Admin / QA Manager / QA Lead có thể bật "Hiện dự án đã lưu trữ" ở trang Dự án để khôi phục lại.',
                            'The project will be hidden from the main list. Admin / QA Manager / QA Lead can enable "Show archived projects" on the Projects page to restore it.',
                          )
                        : tx(
                            'Dự án sẽ xuất hiện lại trong danh sách dự án đang hoạt động.',
                            'The project will appear again in the active projects list.',
                          ),
                      confirmText: nextArchived
                        ? tx('Lưu trữ dự án', 'Archive Project')
                        : tx('Khôi phục dự án', 'Restore Project'),
                      variant: nextArchived ? 'danger' : 'primary',
                    });
                    if (ok) archiveProjectMut.mutate(nextArchived);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl shrink-0 cursor-pointer"
                >
                  {project.isArchived ? (
                    <>
                      <ArchiveRestore className="w-4 h-4" /> {tx('Khôi phục dự án', 'Restore Project')}
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4" /> {tx('Lưu trữ dự án', 'Archive Project')}
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-50/35">
                <div>
                  <div className="text-sm font-semibold text-rose-800">
                    {tx('Xóa vĩnh viễn dự án', 'Permanently Delete Project')}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {tx(
                      'Xóa toàn bộ Test Suites, Test Cases, Test Plans, Test Runs, Defects và cấu hình của dự án',
                      'Delete all Test Suites, Test Cases, Test Plans, Test Runs, Defects, and settings for project',
                    )}{' '}
                    <strong className="font-mono">{project.code}</strong>.{' '}
                    {tx('Hành động này không thể hoàn tác.', 'This action cannot be undone.')}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={deleteProjectMut.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: tx(`Xóa vĩnh viễn dự án ${project.code}?`, `Permanently delete project ${project.code}?`),
                      description: tx(
                        `Toàn bộ dữ liệu của "${project.name}" (${project.stats.totalCases} test case, suites, plans, runs, defects) sẽ bị xóa hoàn toàn và không thể khôi phục!`,
                        `All data for "${project.name}" (${project.stats.totalCases} test cases, suites, plans, runs, defects) will be permanently deleted and cannot be recovered!`,
                      ),
                      confirmText: tx('Xóa vĩnh viễn', 'Delete Permanently'),
                      variant: 'danger',
                    });
                    if (ok) deleteProjectMut.mutate();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> {tx('Xóa dự án', 'Delete Project')}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
