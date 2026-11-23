import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { tx } = useLanguage();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((result: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(result);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    if (resolverRef.current) {
      resolverRef.current(false);
    }
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!options) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options, settle]);

  const isDanger = (options?.variant ?? 'danger') === 'danger';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {options && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#11131A]/45 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-hairline bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  isDanger
                    ? 'bg-rose-50 text-rose-600 border-rose-200'
                    : 'bg-brand-50 text-brand-700 border-brand-200'
                }`}
              >
                {isDanger ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <HelpCircle className="w-5 h-5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3
                    id="confirm-dialog-title"
                    className="text-[15px] font-bold text-ink leading-snug"
                  >
                    {options.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => settle(false)}
                    aria-label={tx('Đóng', 'Close')}
                    className="p-1 -mr-1 -mt-1 text-slate-400 hover:text-ink rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {options.description && (
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                    {options.description}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-canvas/70 border-t border-hairline flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-hairline hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                {options.cancelText || tx('Hủy', 'Cancel')}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => settle(true)}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-xs transition-colors cursor-pointer ${
                  isDanger
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                    : 'bg-brand-600 hover:bg-brand-700 shadow-brand-600/20'
                }`}
              >
                {options.confirmText || tx('Xác nhận', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx.confirm;
}
