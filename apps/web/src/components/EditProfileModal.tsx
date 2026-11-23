import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Mail, User, X } from 'lucide-react';
import { api } from '../lib/api';
import { ROLE_STYLE, getInitials } from '../lib/badges';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';

const REMEMBER_KEY = 'finx_tcms_saved_credentials';

interface EditProfileModalProps {
  onClose: () => void;
  onOpenChangePassword?: () => void;
}

export function EditProfileModal({ onClose, onOpenChangePassword }: EditProfileModalProps) {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { tx, lang } = useLanguage();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);

  const previousEmail = user?.email ?? '';

  const mutation = useMutation({
    mutationFn: api.updateMe,
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['users'] });

      // Keep saved login credentials synced if email changed
      try {
        const raw = localStorage.getItem(REMEMBER_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { email?: string; password?: string };
          if (parsed.email && parsed.email.toLowerCase() === previousEmail.toLowerCase()) {
            localStorage.setItem(
              REMEMBER_KEY,
              JSON.stringify({ email: updatedUser.email, password: parsed.password }),
            );
          }
        }
      } catch {
        // ignore storage errors
      }

      toast.success(
        tx('Đã cập nhật thông tin cá nhân!', 'Profile updated successfully!'),
      );
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof Error
          ? err.message
          : tx('Không thể cập nhật thông tin cá nhân', 'Unable to update profile'),
      );
    },
  });

  if (!user) return null;

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const hasChanges =
    trimmedName !== user.fullName || trimmedEmail !== user.email.toLowerCase();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (trimmedName.length < 2) {
      setError(tx('Họ tên cần tối thiểu 2 ký tự.', 'Full name must be at least 2 characters.'));
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(tx('Vui lòng nhập địa chỉ email hợp lệ.', 'Please enter a valid email address.'));
      return;
    }

    if (!hasChanges) {
      onClose();
      return;
    }

    mutation.mutate({
      fullName: trimmedName,
      email: trimmedEmail,
    });
  };

  const joinedDate = new Date(user.createdAt).toLocaleDateString(
    lang === 'vi' ? 'vi-VN' : 'en-US',
    { year: 'numeric', month: 'short', day: 'numeric' },
  );

  return (
    <div className="fixed inset-0 bg-ink/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-hairline shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between bg-canvas/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-600 text-white text-sm font-semibold flex items-center justify-center shrink-0 shadow-xs">
              {getInitials(trimmedName || user.fullName)}
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-ink">
                {tx('Thông tin cá nhân', 'Personal Profile')}
              </h2>
              <p className="text-xs text-slate-500">
                {tx('Cập nhật họ tên và email tài khoản', 'Update your name and account email')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx('Đóng', 'Close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-canvas/80 border border-hairline text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{tx('Vai trò:', 'Role:')}</span>
              <span
                className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                  ROLE_STYLE[user.role]?.className || 'bg-slate-100 text-slate-700'
                }`}
              >
                {ROLE_STYLE[user.role]?.label || user.role}
              </span>
            </div>
            <span className="text-slate-500">
              {tx('Tham gia:', 'Joined:')} <strong className="text-ink font-medium">{joinedDate}</strong>
            </span>
          </div>

          <div>
            <label
              htmlFor="profile-full-name"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              {tx('Họ và tên *', 'Full name *')}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="profile-full-name"
                type="text"
                required
                maxLength={255}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={tx('Nhập họ và tên', 'Enter full name')}
                className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-hairline rounded-xl bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="profile-email"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              {tx('Email đăng nhập *', 'Account email *')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="profile-email"
                type="email"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-hairline rounded-xl bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between gap-2 border-t border-hairline">
            {onOpenChangePassword ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenChangePassword();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {tx('Đổi mật khẩu', 'Change password')}
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-ink hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                {tx('Hủy', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {mutation.isPending
                  ? tx('Đang lưu...', 'Saving...')
                  : tx('Lưu thay đổi', 'Save changes')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
