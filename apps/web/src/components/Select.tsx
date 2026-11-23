import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export interface SelectOption {
  value: string;
  label: string;
  dotClassName?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'default' | 'dark' | 'custom';
  'aria-label'?: string;
}

interface MenuCoords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = '',
  menuClassName = '',
  size = 'sm',
  variant = 'default',
  'aria-label': ariaLabel,
}: SelectProps) {
  const { tx } = useLanguage();
  const resolvedPlaceholder = placeholder ?? tx('Chọn...', 'Select...');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<MenuCoords | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const computeCoords = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const estimatedMenuHeight = Math.min(options.length * 36 + 16, 280);
    const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
    const spaceAbove = rect.top - gap - 12;
    const openUp = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(280, openUp ? spaceAbove : spaceBelow));
    const minMenuWidth = Math.max(rect.width, 160);
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - minMenuWidth - 8),
    );

    setCoords({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left,
      width: minMenuWidth,
      maxHeight,
      openUp,
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    computeCoords();
    const selectedIdx = options.findIndex((o) => o.value === value);
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
  }, [open, computeCoords, options, value]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          const next = prev + 1;
          return next >= options.length ? 0 : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? options.length - 1 : next;
        });
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (highlightedIndex >= 0 && options[highlightedIndex] && !options[highlightedIndex].disabled) {
          e.preventDefault();
          onChange(options[highlightedIndex].value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    const handleReposition = () => computeCoords();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, options, highlightedIndex, onChange, computeCoords]);

  const sizeClass =
    size === 'xs'
      ? 'px-2.5 py-1 text-xs rounded-lg gap-1.5'
      : size === 'md'
        ? 'px-3.5 py-2 text-sm rounded-xl gap-2'
        : 'px-3 py-1.5 text-sm rounded-lg gap-2';

  const variantClass =
    variant === 'custom'
      ? ''
      : variant === 'dark'
        ? 'bg-slate-800 hover:bg-slate-700/90 text-white border border-slate-600/80 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30'
        : 'bg-white hover:border-slate-300 text-ink border border-hairline focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20';

  const openRingClass =
    open && variant === 'default'
      ? 'border-brand-600 ring-2 ring-brand-600/20'
      : open && variant === 'dark'
        ? 'border-brand-400 ring-2 ring-brand-500/30'
        : '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        className={`inline-flex items-center justify-between text-left transition-all outline-none select-none ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${variant === 'custom' ? '' : sizeClass} ${variantClass} ${openRingClass} ${className}`}
      >
        <span className="inline-flex items-center gap-2 min-w-0 truncate">
          {selectedOption?.dotClassName && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${selectedOption.dotClassName}`} />
          )}
          <span className="truncate">
            {selectedOption ? selectedOption.label : resolvedPlaceholder}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            variant === 'dark' ? 'text-slate-300' : 'text-slate-400'
          } ${open ? 'rotate-180 text-brand-600' : ''}`}
        />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              minWidth: coords.width,
              maxWidth: Math.max(coords.width, 320),
              maxHeight: coords.maxHeight,
            }}
            className={`z-[120] overflow-y-auto rounded-xl bg-white border border-slate-200/95 ring-1 ring-ink/[0.04] shadow-xl shadow-slate-900/12 p-1.5 ${menuClassName}`}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => {
                    if (opt.disabled) return;
                    onChange(opt.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-left transition-colors ${
                    opt.disabled
                      ? 'opacity-45 cursor-not-allowed'
                      : 'cursor-pointer'
                  } ${
                    isSelected
                      ? 'bg-brand-50 text-brand-700 font-semibold'
                      : isHighlighted
                        ? 'bg-canvas text-ink'
                        : 'text-slate-700 hover:bg-canvas hover:text-ink'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 min-w-0 truncate">
                    {opt.dotClassName && (
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotClassName}`} />
                    )}
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
