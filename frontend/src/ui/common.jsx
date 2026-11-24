import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, HelpCircle, ShieldCheck, X } from 'lucide-react';
import { EXPERIENCE_LEVEL_OPTIONS, experienceLevelLabel, formatDate24 } from '../core/dateUtils';

export const INPUT_CLASS =
  'w-full py-2.5 px-3.5 text-base rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 transition';
export const SELECT_CLASS = INPUT_CLASS;
export const TEXTAREA_CLASS = INPUT_CLASS;

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 min-h-[44px] py-2.5 rounded-lg shadow-sm active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all';

export const BTN_PRIMARY = `${BTN_BASE} px-5 text-sm sm:text-base font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 focus:ring-emerald-500`;
export const BTN_DARK = `${BTN_BASE} px-5 text-sm sm:text-base font-semibold bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 focus:ring-emerald-500`;
export const BTN_SECONDARY = `${BTN_BASE} px-4 text-sm sm:text-base font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 focus:ring-emerald-500`;
export const BTN_DANGER = `${BTN_BASE} px-4 text-sm font-medium bg-white text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-300 active:bg-red-100 focus:ring-red-500`;
export const CARD_CLASS = 'bg-white border border-slate-200 rounded-xl shadow-sm';

export function AlertBanner({ type = 'error', message, onClose }) {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
        isError ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {isError ? <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
        <span className="break-words">{message}</span>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Zamknij komunikat" className="p-0.5 rounded hover:bg-black/5 shrink-0">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function ModalShell({ title, subtitle, header, onClose, maxWidth = 'max-w-2xl', children, footer, onSubmit }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Container = onSubmit ? 'form' : 'div';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3 sm:p-4" onClick={onClose}>
      <Container
        role="dialog"
        aria-modal="true"
        onSubmit={onSubmit}
        className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[92vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50/70 shrink-0">
          {header || (
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate">{title}</h2>
              {subtitle && <p className="text-xs sm:text-sm text-slate-600 mt-0.5">{subtitle}</p>}
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="Zamknij" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 shrink-0">{footer}</div>}
      </Container>
    </div>
  );
}

function buildPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) pages.push('ellipsis-left');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < totalPages - 1) pages.push('ellipsis-right');
  pages.push(totalPages);
  return pages;
}

export function Pagination({ totalItems, pageSize, currentPage, onPageChange, onPageSizeChange, pageSizeOptions = [5, 10, 20] }) {
  if (totalItems === 0) return null;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const fromItem = (safePage - 1) * pageSize + 1;
  const toItem = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3.5 sm:px-4 py-3 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex flex-wrap items-center justify-between md:justify-start gap-2.5 text-sm text-slate-600">
        <span>Wyświetlanie <strong className="text-slate-900">{fromItem}–{toItem}</strong> z <strong className="text-slate-900">{totalItems}</strong></span>
        {onPageSizeChange && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <span>Na stronie:</span>
            <select
              value={pageSize}
              onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
              className="py-1.5 px-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[40px]"
            >
              {pageSizeOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center justify-between sm:justify-center md:justify-end gap-1 sm:gap-1.5">
        <button type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} aria-label="Poprzednia strona" className="inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2.5 sm:px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <ChevronLeft className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Poprzednia</span>
        </button>
        <div className="flex items-center gap-1 overflow-x-auto">
          {buildPageNumbers(safePage, totalPages).map((item) =>
            typeof item === 'string' ? (
              <span key={item} className="px-1.5 text-slate-400 select-none">&hellip;</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? 'page' : undefined}
                className={`min-h-[44px] min-w-[40px] sm:min-w-[44px] px-2.5 sm:px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${item === safePage ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
              >
                {item}
              </button>
            )
          )}
        </div>
        <button type="button" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)} aria-label="Następna strona" className="inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2.5 sm:px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <span className="hidden sm:inline">Następna</span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
}

export function ExperienceLevelBadge({ level, verified = false, verifiedByName = null, verifiedAt = null, compact = false }) {
  const label = experienceLevelLabel(level);
  const size = compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs';

  if (!label) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 text-slate-600 font-medium ${size}`}>
        <HelpCircle className="w-3 h-3 text-slate-400 shrink-0" />
        <span>Poziom nieokreślony</span>
      </span>
    );
  }
  if (verified) {
    const parts = ['Poziom zatwierdzony przez instruktora', verifiedByName, verifiedAt && `(${formatDate24(verifiedAt)})`].filter(Boolean);
    return (
      <span title={parts.join(' ')} className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-900 font-semibold ${size}`}>
        {compact ? <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
        <span>{label}</span>
        {!compact && <span className="text-emerald-700 font-medium">• Zatwierdzony</span>}
      </span>
    );
  }
  return (
    <span title="Poziom zadeklarowany przez klienta – oczekuje na zatwierdzenie przez instruktora" className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 text-amber-900 font-semibold ${size}`}>
      <Clock className="w-3 h-3 text-amber-600 shrink-0" />
      <span>{label}</span>
      {!compact && <span className="text-amber-700 font-normal">• Deklaracja</span>}
    </span>
  );
}

export function ExperienceLevelSelector({ value, onChange, compact = false }) {
  return (
    <div className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-3 gap-2' : 'md:grid-cols-3 gap-3'}`}>
      {EXPERIENCE_LEVEL_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`text-left rounded-xl border-2 transition-all ${compact ? 'p-3' : 'p-4 flex flex-col justify-between gap-2'} ${
              selected ? 'border-emerald-600 bg-emerald-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`font-bold text-slate-900 ${compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'}`}>{opt.title}</span>
              <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'}`}>
                {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
            </div>
            <p className={`${compact ? 'text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2' : 'text-xs text-slate-600 leading-relaxed'}`}>{opt.description}</p>
          </button>
        );
      })}
    </div>
  );
}
