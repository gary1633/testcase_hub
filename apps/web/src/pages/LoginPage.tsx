import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  Layers,
  GitCompareArrows,
  FileSpreadsheet,
  Link2,
  KeyRound,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ThemePicker } from '../components/ThemePicker';
import { LanguageToggle } from '../components/LanguageToggle';
import { api } from '../lib/api';

const REMEMBER_KEY = 'finx_tcms_saved_credentials';

interface SavedCredentials {
  email: string;
  password: string;
}

function loadSavedCredentials(): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCredentials>;
    if (typeof parsed.email === 'string' && typeof parsed.password === 'string') {
      return { email: parsed.email, password: parsed.password };
    }
  } catch {
    // ignore corrupted storage
  }
  return null;
}

const DEMO_ACCOUNTS = [
  {
    label: 'Admin',
    email: 'admin@company.local',
    pass: 'Admin123!',
    descVi: 'Toàn quyền quản trị hệ thống & dự án',
    descEn: 'Full system & project administration access',
    dot: 'bg-brand-500',
  },
  {
    label: 'QA Manager',
    email: 'manager@company.local',
    pass: 'Manager123!',
    descVi: 'Quản lý toàn bộ thành viên & xem mọi dự án',
    descEn: 'Manage all members & view all projects',
    dot: 'bg-indigo-500',
  },
  {
    label: 'QA Lead',
    email: 'lead@company.local',
    pass: 'Lead123!',
    descVi: 'Thêm user, reset MK QA & quản lý dự án',
    descEn: 'Add users, reset QA passwords & manage projects',
    dot: 'bg-purple-500',
  },
  {
    label: 'QA',
    email: 'qa@company.local',
    pass: 'Qa123!',
    descVi: 'Soạn thảo Test Case, chạy Test Run & tạo Bug',
    descEn: 'Author Test Cases, execute Test Runs & log Bugs',
    dot: 'bg-sky-500',
  },
  {
    label: 'PM',
    email: 'pm@company.local',
    pass: 'Pm123!',
    descVi: 'Theo dõi tiến độ & xuất báo cáo dự án',
    descEn: 'Track progress & export project reports',
    dot: 'bg-amber-500',
  },
];

const HIGHLIGHTS = [
  {
    icon: Layers,
    titleVi: 'Kho Test Case đa cấp',
    titleEn: 'Multi-level Test Repository',
    descVi:
      'Kéo thả Suite ↔ Sub-suite linh hoạt, Shared Steps và tìm kiếm nhanh hàng nghìn kịch bản.',
    descEn:
      'Flexible drag-and-drop Suite ↔ Sub-suite tree, Shared Steps, and fast search across thousands of cases.',
  },
  {
    icon: FileSpreadsheet,
    titleVi: 'Import / Export Excel chuẩn',
    titleEn: 'Standard Excel Import / Export',
    descVi:
      'Chuyển đổi nhanh file .xlsx sẵn có, giữ định dạng biểu mẫu và bảng theo dõi lỗi.',
    descEn:
      'Quickly import existing .xlsx files while preserving templates and defect tracking sheets.',
  },
  {
    icon: GitCompareArrows,
    titleVi: 'Lịch sử & So sánh Diff',
    titleEn: 'Version History & Diff Compare',
    descVi:
      'Tự động lưu phiên bản mỗi lần chỉnh sửa, đối chiếu trước – sau và khôi phục tức thì.',
    descEn:
      'Automatically snapshot every edit, compare before-and-after diffs, and restore instantly.',
  },
  {
    icon: Link2,
    titleVi: 'Jira, Webhook & CI/CD',
    titleEn: 'Jira, Webhook & CI/CD',
    descVi:
      'Liên kết ticket Jira, nhận kết quả Playwright / JUnit và xuất báo cáo PDF, PNG, HTML.',
    descEn:
      'Link Jira tickets, ingest Playwright / JUnit results, and export PDF, PNG, HTML reports.',
  },
];

interface GoogleAccountsIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    ux_mode?: 'popup' | 'redirect';
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      width?: number;
      locale?: string;
    },
  ) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsIdApi;
      };
    };
  }
}

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const { tx, lang } = useLanguage();
  const navigate = useNavigate();

  const initialSaved = loadSavedCredentials();
  const [email, setEmail] = useState(initialSaved?.email ?? '');
  const [password, setPassword] = useState(initialSaved?.password ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(Boolean(initialSaved ?? true));
  const rememberMeRef = useRef(rememberMe);
  rememberMeRef.current = rememberMe;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  const { data: publicConfig } = useQuery({
    queryKey: ['auth-public-config'],
    queryFn: api.getPublicConfig,
    staleTime: 60_000,
    retry: false,
  });
  const demoMode = publicConfig?.demoMode === true;
  const googleAuthEnabled =
    publicConfig?.googleAuthEnabled === true && Boolean(publicConfig.googleClientId);
  const googleClientId = publicConfig?.googleClientId ?? null;

  useEffect(() => {
    if (demoMode && !initialSaved && !email && !password) {
      setEmail('admin@company.local');
      setPassword('Admin123!');
    }
  }, [demoMode]);

  // Dynamically load Google Identity Services ONLY when Google SSO is configured on server
  useEffect(() => {
    if (!googleAuthEnabled || !googleClientId) return;
    let cancelled = false;

    const initGoogleButton = () => {
      if (cancelled || !googleBtnRef.current || !window.google?.accounts?.id) return;
      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        ux_mode: 'popup',
        callback: async (resp) => {
          if (!resp.credential) return;
          setError(null);
          setGoogleSubmitting(true);
          try {
            await loginWithGoogle(resp.credential, rememberMeRef.current);
            navigate('/projects', { replace: true });
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : tx('Đăng nhập Google thất bại', 'Google sign-in failed'),
            );
          } finally {
            setGoogleSubmitting(false);
          }
        },
      });
      const containerWidth = Math.min(380, Math.max(260, googleBtnRef.current.clientWidth || 360));
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'signin_with',
        width: containerWidth,
        locale: lang === 'en' ? 'en' : 'vi',
      });
    };

    if (window.google?.accounts?.id) {
      initGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.getElementById('google-gsi-client-script') as
      | HTMLScriptElement
      | null;
    if (existingScript) {
      existingScript.addEventListener('load', initGoogleButton);
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', initGoogleButton);
      };
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogleButton;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.onload = null;
    };
  }, [googleAuthEnabled, googleClientId, loginWithGoogle, navigate, lang, tx]);

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState<string | null>(null);

  const openForgotModal = () => {
    setForgotEmail(email);
    setForgotNote('');
    setForgotError(null);
    setForgotSuccessMsg(null);
    setShowForgot(true);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSubmitting(true);
    try {
      const res = await api.forgotPassword({ email: forgotEmail, note: forgotNote });
      setForgotSuccessMsg(res.message);
    } catch (err) {
      setForgotError(
        err instanceof Error
          ? err.message
          : tx('Không thể gửi yêu cầu', 'Unable to submit request'),
      );
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, rememberMe);
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      navigate('/projects', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tx('Đăng nhập thất bại', 'Sign-in failed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDemo = DEMO_ACCOUNTS.find((a) => a.email === email);

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-canvas">
      {/* Left Brand Showcase Panel */}
      <div className="hidden lg:flex lg:col-span-6 bg-[#10131C] text-white relative overflow-hidden px-12 xl:px-16 py-10 flex-col justify-between border-r border-white/[0.06]">
        {/* Architectural grid & theme-reactive ambient radiance */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
        />
        <div
          className="absolute -top-36 -right-32 w-[480px] h-[480px] rounded-full blur-3xl opacity-35 pointer-events-none transition-colors duration-300"
          style={{
            background: 'radial-gradient(circle, var(--color-brand-600) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-44 -left-28 w-[420px] h-[420px] rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-300"
          style={{
            background: 'radial-gradient(circle, var(--color-brand-400) 0%, transparent 70%)',
          }}
        />

        {/* Top brand bar */}
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="force-light bg-white rounded-xl px-3.5 py-2 shadow-sm">
              <img src="/finx-logo.png" alt="FinX" className="h-5 w-auto object-contain" />
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-slate-200">
              Quality Assurance Platform
            </span>
          </div>
        </div>

        {/* Center value proposition */}
        <div className="relative z-10 max-w-lg my-auto py-8">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-300 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {tx(
                'Quản lý kiểm thử tập trung · Chuẩn tài chính số',
                'Centralized QA Management · Built for Digital Finance',
              )}
            </span>
          </div>
          <h1 className="text-3xl xl:text-4xl font-bold tracking-[-0.025em] leading-[1.18] text-white">
            FinX TestCase Hub
          </h1>
          <p className="text-sm xl:text-[15px] text-slate-300 mt-3 leading-relaxed">
            {tx(
              'Chuẩn hóa quy trình thiết kế Test Case, thực thi Test Run, theo dõi Defect và đồng bộ báo cáo trực quan cho đội ngũ QA & PM.',
              'Standardize Test Case authoring, Test Run execution, Defect tracking, and visual quality reporting for QA, PM & PO teams.',
            )}
          </p>

          <div className="grid grid-cols-2 gap-3.5 mt-8">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.titleEn}
                  className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.09] transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-brand-600/30 border border-brand-400/35 text-brand-200 flex items-center justify-center mb-2.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-[13px] font-semibold text-white leading-snug">
                    {tx(item.titleVi, item.titleEn)}
                  </div>
                  <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                    {tx(item.descVi, item.descEn)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subtle footer trust strip */}
        <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400 pt-4 border-t border-white/[0.08]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            {tx(
              'Phân quyền RBAC · Lưu lịch sử thay đổi toàn diện',
              'Role-Based Access Control · Full Version Audit Trail',
            )}
          </span>
          <span>FinX Engineering</span>
        </div>
      </div>

      {/* Right Sign-In Workspace */}
      <div className="lg:col-span-6 flex flex-col justify-between p-5 sm:p-8 lg:p-10 bg-canvas">
        {/* Top utility bar */}
        <div className="flex items-center justify-between lg:justify-end gap-2">
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="force-light bg-white rounded-xl border border-hairline px-3 py-1.5 shadow-2xs">
              <img
                src="/finx-logo.png"
                alt="FinX"
                className="h-5 w-auto object-contain select-none"
              />
            </div>
            <span className="text-sm font-bold text-ink tracking-tight">TestCase Hub</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle compact />
            <ThemePicker compact />
          </div>
        </div>

        {/* Centered Elevated Sign-In Card */}
        <div className="w-full max-w-[448px] mx-auto my-auto py-6">
          <div className="bg-white rounded-2xl border border-hairline shadow-sm p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-[22px] font-bold text-ink tracking-[-0.02em]">
                {tx('Đăng nhập hệ thống', 'Sign in to your workspace')}
              </h2>
              <p className="text-[13px] text-slate-500 mt-1">
                {tx(
                  'Nhập tài khoản nội bộ để truy cập kho Test Case và dự án của bạn.',
                  'Enter your workspace credentials to access your Test Repository and projects.',
                )}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  {tx('Email công ty', 'Work email')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-colors"
                    placeholder="name@company.local"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {tx('Mật khẩu', 'Password')}
                  </label>
                  <button
                    type="button"
                    onClick={openForgotModal}
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800 hover:underline cursor-pointer"
                  >
                    {tx('Quên mật khẩu?', 'Forgot password?')}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 text-sm bg-white border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword
                        ? tx('Ẩn mật khẩu', 'Hide password')
                        : tx('Hiện mật khẩu', 'Show password')
                    }
                    title={
                      showPassword
                        ? tx('Ẩn mật khẩu', 'Hide password')
                        : tx('Hiện mật khẩu', 'Show password')
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-ink rounded-lg transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-[13px] text-slate-600 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-brand-600 cursor-pointer"
                />
                <span>{tx('Ghi nhớ đăng nhập trên thiết bị này', 'Remember me on this device')}</span>
              </label>

              {error && (
                <div
                  role="alert"
                  className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || googleSubmitting}
                className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-brand-600/20 transition-all cursor-pointer"
              >
                {submitting ? tx('Đang đăng nhập...', 'Signing in...') : tx('Đăng nhập', 'Sign in')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {googleAuthEnabled && (
              <div className="mt-5">
                <div className="relative flex items-center justify-center my-4">
                  <div className="w-full border-t border-hairline" />
                  <span className="px-3 text-xs text-slate-400 bg-white shrink-0">
                    {tx('hoặc tiếp tục với', 'or continue with')}
                  </span>
                  <div className="w-full border-t border-hairline" />
                </div>
                <div
                  ref={googleBtnRef}
                  className={`flex justify-center min-h-[42px] ${
                    googleSubmitting ? 'opacity-60 pointer-events-none' : ''
                  }`}
                />
                {googleSubmitting && (
                  <p className="text-center text-xs text-slate-500 mt-2">
                    {tx('Đang xác thực tài khoản Google...', 'Verifying Google account...')}
                  </p>
                )}
              </div>
            )}

            {demoMode && (
              <div className="mt-6 pt-5 border-t border-hairline">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {tx('Tài khoản mẫu (Demo)', 'Demo Accounts')}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {tx('Chọn nhanh theo vai trò', 'Quick fill by role')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {DEMO_ACCOUNTS.map((acc) => {
                    const selected = email === acc.email;
                    return (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => {
                          setEmail(acc.email);
                          setPassword(acc.pass);
                          setError(null);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                          selected
                            ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-2xs'
                            : 'border-hairline bg-canvas/60 text-slate-600 hover:border-brand-300 hover:text-ink'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${acc.dot}`} />
                        {acc.label}
                      </button>
                    );
                  })}
                </div>

                {selectedDemo && (
                  <p className="text-[11px] text-slate-500 mt-2.5 bg-canvas/80 border border-hairline/80 rounded-lg px-3 py-1.5">
                    <strong className="text-ink">{selectedDemo.label}:</strong>{' '}
                    {tx(selectedDemo.descVi, selectedDemo.descEn)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom subtle spacing/copyright on mobile & desktop */}
        <div className="text-center text-[11px] text-slate-400">
          FinX TestCase Hub ·{' '}
          {tx('Nền tảng quản lý kiểm thử nội bộ', 'Internal QA Management Platform')}
        </div>
      </div>

      {showForgot && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="animate-modal bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between bg-canvas/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-ink">
                    {tx('Quên mật khẩu', 'Forgot Password')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {tx(
                      'Gửi yêu cầu cấp mật khẩu tạm tới Quản trị',
                      'Request a temporary password from Administrators',
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgot(false)}
                aria-label={tx('Đóng', 'Close')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              {forgotSuccessMsg ? (
                <div className="text-center py-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="text-base font-bold text-ink">
                    {tx('Đã gửi yêu cầu thành công', 'Request Sent Successfully')}
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">{forgotSuccessMsg}</p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {tx(
                      'Sau khi Admin / QA Manager / QA Lead cấp mật khẩu tạm, bạn sẽ được yêu cầu đặt lại mật khẩu mới ở lần đăng nhập kế tiếp.',
                      'Once an Admin, QA Manager, or QA Lead issues a temporary password, you will be prompted to set a new password on your next sign-in.',
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForgot(false)}
                    className="mt-5 w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
                  >
                    {tx('Quay lại đăng nhập', 'Back to Sign In')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {lang === 'en' ? (
                      <>
                        Enter your account email. Your request will appear in{' '}
                        <strong className="text-ink">Member Management</strong> so an administrator
                        can issue a temporary password.
                      </>
                    ) : (
                      <>
                        Nhập email tài khoản của bạn. Yêu cầu sẽ hiển thị ngay trong trang{' '}
                        <strong className="text-ink">Quản lý Thành viên</strong> để được cấp mật
                        khẩu tạm thời.
                      </>
                    )}
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {tx('Email tài khoản *', 'Account Email *')}
                    </label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@company.local"
                      className="w-full px-3.5 py-2.5 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {tx('Ghi chú (tùy chọn)', 'Note (optional)')}
                    </label>
                    <textarea
                      rows={2}
                      maxLength={300}
                      value={forgotNote}
                      onChange={(e) => setForgotNote(e.target.value)}
                      placeholder={tx(
                        'VD: Mình vừa đổi máy mới, nhờ cấp lại mật khẩu giúp nhé.',
                        'e.g. I switched to a new laptop, please help reset my password.',
                      )}
                      className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                    />
                  </div>

                  {forgotError && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                      {forgotError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                    >
                      {tx('Hủy', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={forgotSubmitting}
                      className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl cursor-pointer"
                    >
                      {forgotSubmitting
                        ? tx('Đang gửi...', 'Sending...')
                        : tx('Gửi yêu cầu', 'Submit Request')}
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
