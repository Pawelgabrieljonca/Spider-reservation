import { CheckCircle2, Clock, HelpCircle, ShieldCheck } from 'lucide-react';
import { experienceLevelLabel, formatDate24 } from '../utils/dateUtils';

/**
 * Etykieta poziomu zaawansowania wspinacza z wyraźnym rozróżnieniem
 * poziomu zatwierdzonego przez instruktora oraz deklaracji własnej klienta.
 */
export default function ExperienceLevelBadge({
  level,
  verified = false,
  verifiedByName = null,
  verifiedAt = null,
  compact = false,
}) {
  const label = experienceLevelLabel(level);

  if (!label) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 text-slate-600 font-medium ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'
        }`}
      >
        <HelpCircle className="w-3 h-3 text-slate-400 shrink-0" />
        <span>Poziom nieokreślony</span>
      </span>
    );
  }

  if (verified) {
    const titleParts = ['Poziom zatwierdzony przez instruktora'];
    if (verifiedByName) titleParts.push(verifiedByName);
    if (verifiedAt) titleParts.push(`(${formatDate24(verifiedAt)})`);

    return (
      <span
        title={titleParts.join(' ')}
        className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-900 font-semibold ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'
        }`}
      >
        {compact ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        )}
        <span>{label}</span>
        {!compact && <span className="text-emerald-700 font-medium">• Zatwierdzony</span>}
      </span>
    );
  }

  return (
    <span
      title="Poziom zadeklarowany przez klienta – oczekuje na zatwierdzenie przez instruktora"
      className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 text-amber-900 font-semibold ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'
      }`}
    >
      <Clock className="w-3 h-3 text-amber-600 shrink-0" />
      <span>{label}</span>
      {!compact && <span className="text-amber-700 font-normal">• Deklaracja</span>}
    </span>
  );
}

