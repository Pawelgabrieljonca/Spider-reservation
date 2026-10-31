import { ChevronLeft, ChevronRight } from 'lucide-react';

function buildPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }
  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('ellipsis-left');
  for (let p = start; p <= end; p += 1) {
    pages.push(p);
  }
  if (end < totalPages - 1) pages.push('ellipsis-right');
  pages.push(totalPages);
  return pages;
}

export default function Pagination({
  totalItems,
  pageSize,
  currentPage,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20],
}) {
  if (totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const fromItem = (safePage - 1) * pageSize + 1;
  const toItem = Math.min(safePage * pageSize, totalItems);
  const pageNumbers = buildPageNumbers(safePage, totalPages);

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3.5 sm:px-4 py-3 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex flex-wrap items-center justify-between md:justify-start gap-2.5 text-sm text-slate-600">
        <span>
          Wyświetlanie <strong className="text-slate-900">{fromItem}–{toItem}</strong> z{' '}
          <strong className="text-slate-900">{totalItems}</strong>
        </span>

        {onPageSizeChange && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <span>Na stronie:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="py-1.5 px-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[40px]"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between sm:justify-center md:justify-end gap-1 sm:gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Poprzednia strona"
          className="inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2.5 sm:px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Poprzednia</span>
        </button>

        <div className="flex items-center gap-1 overflow-x-auto">
          {pageNumbers.map((item) =>
            typeof item === 'string' ? (
              <span key={item} className="px-1.5 text-slate-400 select-none">
                &hellip;
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? 'page' : undefined}
                className={`min-h-[44px] min-w-[40px] sm:min-w-[44px] px-2.5 sm:px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  item === safePage
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 active:bg-slate-100'
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Następna strona"
          className="inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2.5 sm:px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <span className="hidden sm:inline">Następna</span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
}

