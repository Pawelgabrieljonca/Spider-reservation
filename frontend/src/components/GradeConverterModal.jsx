import { useEffect, useState } from 'react';
import { ArrowLeftRight, Info, X } from 'lucide-react';
import { BTN_SECONDARY, SELECT_CLASS } from '../styles/ui';
import { GRADE_CONVERSION_TABLE, getGradeBadgeClasses } from '../utils/grades';

export default function GradeConverterModal({ isOpen, onClose, initialGrade = 'VI+' }) {
  const [selectedKurtyka, setSelectedKurtyka] = useState(initialGrade || 'VI+');

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeRow =
    GRADE_CONVERSION_TABLE.find((r) => r.kurtyka === selectedKurtyka) ||
    GRADE_CONVERSION_TABLE[8];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grade-converter-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nagłówek modala */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h2 id="grade-converter-title" className="text-lg sm:text-xl font-bold text-slate-900">
                Tabela i przelicznik skal wspinaczkowych
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Na CW Spider obowiązuje skala krakowska (Kurtyki)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij przelicznik"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Szybki przelicznik interaktywny */}
        <div className="px-5 sm:px-6 py-4 bg-emerald-50/60 border-b border-emerald-200/80 space-y-3">
          <label
            htmlFor="quick-grade-converter"
            className="block text-sm font-semibold text-slate-800"
          >
            Szybki przelicznik – wybierz stopień w skali krakowskiej:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
            <div>
              <select
                id="quick-grade-converter"
                value={activeRow.kurtyka}
                onChange={(e) => setSelectedKurtyka(e.target.value)}
                className={`${SELECT_CLASS} font-mono font-bold`}
              >
                {GRADE_CONVERSION_TABLE.map((row) => (
                  <option key={row.kurtyka} value={row.kurtyka}>
                    {row.kurtyka} ({row.french})
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-slate-500">Krakowska (Kurtyki)</div>
              <div className="font-mono text-lg font-extrabold text-emerald-700 mt-0.5">
                {activeRow.kurtyka}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-slate-500">Francuska</div>
              <div className="font-mono text-lg font-extrabold text-slate-900 mt-0.5">
                {activeRow.french}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
              <div className="text-xs text-slate-500">UIAA</div>
              <div className="font-mono text-lg font-extrabold text-slate-900 mt-0.5">
                {activeRow.uiaa}
              </div>
            </div>
          </div>
        </div>

        {/* Pełna tabela porównawcza */}
        <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-4">
          <div className="flex items-start gap-2 text-xs sm:text-sm text-slate-600 mb-3">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Kliknij dowolny wiersz w tabeli, aby podświetlić odpowiadające sobie wyceny w trzech
              najpopularniejszych systemach.
            </span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-sm sm:text-base">
              <thead className="bg-slate-100 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600 sticky top-0">
                <tr>
                  <th className="py-3 px-4">Krakowska (Kurtyki)</th>
                  <th className="py-3 px-4">Francuska</th>
                  <th className="py-3 px-4">UIAA</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Poziom</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {GRADE_CONVERSION_TABLE.map((row) => {
                  const isSelected = row.kurtyka === activeRow.kurtyka;
                  return (
                    <tr
                      key={row.kurtyka}
                      onClick={() => setSelectedKurtyka(row.kurtyka)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-emerald-50 font-semibold'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-block font-mono font-bold text-sm px-2.5 py-0.5 rounded-md border ${getGradeBadgeClasses(
                            row.kurtyka
                          )}`}
                        >
                          {row.kurtyka}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-800">
                        {row.french}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">{row.uiaa}</td>
                      <td className="py-2.5 px-4 text-sm text-slate-500 hidden sm:table-cell">
                        {row.level}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stopka modala */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Zamknij tabelę
          </button>
        </div>
      </div>
    </div>
  );
}

