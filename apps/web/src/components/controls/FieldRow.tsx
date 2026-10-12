import { useId } from 'react';

import { Slider } from '@/components/ui/slider';
import { TermTip, type GlossaryTerm } from './Glossary';

/* =========================================================================
   FieldRow — the one control used by every numeric setting
   -------------------------------------------------------------------------
   Label on the left with its value right-aligned in mono, slider beneath, and
   an optional glossary tooltip. Keeping every setting on this one component
   is what makes the left panel feel consistent.

   The slider is keyboard operable and carries an accessible name and an
   aria-valuetext in real units ("3 metres"), not a raw number.
   ========================================================================= */

export type FieldRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Value shown to the user, already formatted. */
  display?: string;
  /** Appended after the display value, e.g. "m" or "g". */
  unit?: string;
  glossary?: GlossaryTerm;
  /** Long explanation shown in an info tooltip. */
  help?: string;
  disabled?: boolean;
  /** Non-blocking problem with this field. */
  error?: string;
};

export function FieldRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  unit,
  glossary,
  help,
  disabled,
  error,
}: FieldRowProps) {
  const id = useId();

  const text = display ?? String(value);
  const unitSuffix = unit ? ` ${unit}` : '';

  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className="text-sm">
            {label}
          </label>
          <TermTip term={glossary} help={help} />
        </div>
        <span
          className={`font-mono-nums text-sm ${error ? 'text-danger' : 'text-primary'}`}
          aria-live="polite"
        >
          {text}
          {unitSuffix}
        </span>
      </div>

      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0] ?? value)}
        aria-label={label}
        aria-valuetext={`${text}${unitSuffix}`}
        aria-invalid={error ? true : undefined}
      />

      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
