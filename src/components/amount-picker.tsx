"use client";

import { useState } from "react";
import { useFieldState } from "./ui/form";

/** Suggested amounts as large touch targets, plus an optional custom amount. */
export function AmountPicker({ suggestions, currency, allowCustom, min, max }: { suggestions: number[]; currency: string; allowCustom: boolean; min: number; max: number }) {
  const [value, setValue] = useState<string>(suggestions[0] ? String(suggestions[0]) : "");
  const [custom, setCustom] = useState(suggestions.length === 0);
  const { error } = useFieldState("amount");
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Amount</legend>
      {suggestions.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={!custom && value === String(s)}
              onClick={() => { setCustom(false); setValue(String(s)); }}
              className={`min-h-12 rounded-lg border text-sm font-semibold ${!custom && value === String(s) ? "border-plum-700 bg-plum-800 text-white" : "border-line bg-white hover:bg-violet-50"}`}
            >
              {fmt(s)}
            </button>
          ))}
          {allowCustom && (
            <button type="button" aria-pressed={custom} onClick={() => { setCustom(true); setValue(""); }} className={`min-h-12 rounded-lg border text-sm font-semibold ${custom ? "border-plum-700 bg-plum-800 text-white" : "border-line bg-white hover:bg-violet-50"}`}>
              Other
            </button>
          )}
        </div>
      )}
      {custom ? (
        <div>
          <label htmlFor="amount" className="text-sm font-medium">Amount ({currency})</label>
          <input id="amount" name="amount" type="number" inputMode="decimal" min={min} max={max} step="0.01" required value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 block min-h-12 w-full rounded-lg border border-line bg-white px-3 text-lg" aria-invalid={error ? true : undefined} />
          <p className="mt-1 text-xs text-muted">Between {fmt(min)} and {fmt(max)}</p>
        </div>
      ) : (
        <input type="hidden" name="amount" value={value} />
      )}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
