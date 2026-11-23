import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldAlert, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';

const REMEMBER_KEY = 'finx_tcms_saved_credentials';

interface ChangePasswordModalProps {
  forced?: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ forced = false, onClose }: ChangePasswordModalProps) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const { tx } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: api.changePassword,
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      // Keep saved login credentials synced if user saved them
      try {
        const raw = localStorage.getItem(REMEMBER_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { email?: string; password?: string };
          if (parsed.email && parsed.email.toLowerCase() === updatedUser.email.toLowerCase()) {
            localStorage.setItem(
              REMEMBER_KEY,
              JSON.stringify({ email: parsed.email, password: newPassword }),
            );
          }
        }
      } catch {
        // ignore storage errors
      }
      setSuccess(true);
      toast.success(
        tx('Đã đổi mật khẩu tài khoản thành công!', 'Password changed successfully!'),
      );
      setTimeout(() => {
        onClose();
      }, 1100);
    },
    onError: (err) => {
      setError(
        err instanceof Error
          ? err.message
          : tx('Không thể đổi mật khẩu', 'Unable to change password'),
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError(
        tx('Mật khẩu mới cần tối thiểu 6 ký tự.', 'New password must be at least 6 characters.'),
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(
        tx('Xác nhận mật khẩu mới chưa khớp.', 'Password confirmation does not match.'),
      );
      return;
    }
    if (newPassword === currentPassword) {
      setError(
        tx(
          'Mật khẩu mới phải khác mật khẩu hiện tại.',
          'New password must be different from current password.',
        ),
      );
      return;
    }
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="fixed inset-0 bg-ink/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between bg-canvas/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-ink">
                {forced
                  ? tx('Đổi mật khẩu tạm để tiếp tục', 'Change temporary password to continue')
                  : tx('Đổi mật khẩu tài khoản', 'Change Account Password')}
              </h2>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          {!forced && (
            <button
              type="button"
              onClick={onClose}
              aria-label={tx('Đóng', 'Close')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-6">
          {forced && !success && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                {tx(
                  'Quản trị viên vừa cấp mật khẩu tạm cho tài khoản của bạn. Vui lòng đặt lại mật khẩu cá nhân mới để bảo mật trước khi sử dụng hệ thống.',
                  'An administrator has issued a temporary password for your account. Please set a new personal password to secure your account before continuing.',
                )}
              </span>
            </div>
          )}

          {success ? (
            <div className="py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-base font-bold text-ink">
                {tx('Đổi mật khẩu thành công!', 'Password Changed!')}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {tx(
                  'Mật khẩu mới đã được cập nhật cho tài khoản của bạn.',
                  'Your new password has been updated for your account.',
                )}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {forced
                    ? tx('Mật khẩu tạm hiện tại *', 'Current temporary password *')
                    : tx('Mật khẩu hiện tại *', 'Current password *')}
                </label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={tx('Nhập mật khẩu đang dùng', 'Enter current password')}
                    className="w-full pl-3.5 pr-10 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-ink cursor-pointer"
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {tx('Mật khẩu mới (tối thiểu 6 ký tự) *', 'New password (min. 6 characters) *')}
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={tx('Nhập mật khẩu mới', 'Enter new password')}
                    className="w-full pl-3.5 pr-10 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-ink cursor-pointer"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {tx('Xác nhận mật khẩu mới *', 'Confirm new password *')}
                </label>
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={tx('Nhập lại mật khẩu mới', 'Re-enter new password')}
                  className="w-full px-3.5 py-2 text-sm border border-hairline rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2"
                >
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                {forced ? (
                  <button
                    type="button"
                    onClick={logout}
                    className="text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    {tx('Đăng xuất', 'Sign out')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    {tx('Hủy', 'Cancel')}
                  </button>
                )}

                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl shadow-xs shadow-brand-600/20 cursor-pointer"
                >
                  {mutation.isPending
                    ? tx('Đang cập nhật...', 'Updating...')
                    : tx('Lưu mật khẩu mới', 'Save New Password')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
