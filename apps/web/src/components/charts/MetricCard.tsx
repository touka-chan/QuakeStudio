import { Info } from 'lucide-react';

import { cn } from '@/lib/utils';

/* =========================================================================
   Metric card
   -------------------------------------------------------------------------
   The three headline numbers. The value uses JetBrains Mono with tabular
   figures so the digits do not shift as the value updates — that jitter is
   genuinely distracting when a number refreshes several times a second.
   ========================================================================= */

export function MetricCard({
  label,
  value,
  unit,
  detail,
  help,
  tone = 'default',
  testId,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  help?: string;
  tone?: 'default' | 'positive' | 'caution';
  testId?: string;
}) {
  return (
    <div
      className={cn(
        // `flex flex-col` so the caption sits under the number and any slack
        // goes to the bottom, keeping three cards the same height.
        //
        // It is grid's default `align-items: stretch` that actually equalises
        // them, not anything here — an earlier comment on `h-full` claimed
        // credit for it. `h-full` was removed once a test proved removing it
        // changed nothing. Do not add it back expecting it to do work.
        'flex flex-col rounded-card border border-line bg-surface p-3',
        tone === 'caution' && 'border-accent-yellow/50',
      )}
      data-testid={testId}
    >
      <div className="flex items-start gap-1">
        {/*
         * `min-w-0 flex-1` is load-bearing, not decoration.
         *
         * A flex item defaults to `min-width: auto`, which means it refuses to
         * shrink below its longest word. The label is uppercased and tracked
         * out, so "DISPLACEMENT" needs roughly 96px — wider than the ~62px of
         * content a card got in a 3-column grid on a 360px phone. Without
         * `min-w-0` the label overflowed its card and was clipped at the
         * rounded border, silently losing the final letter.
         *
         * ResultsPanel now stacks those cards below `sm`, so there is room and
         * this stops firing in practice. It stays because MetricCard is
         * reusable, and the failure it prevents is invisible: the card is
         * clipped, the layout looks fine, and a letter quietly disappears.
         */}
        <p className="min-w-0 flex-1 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {help ? (
          /*
           * role="img" is required for the aria-label to mean anything. An
           * aria-label on a roleless <span> is prohibited: axe reports it as a
           * serious violation and screen readers drop it. This element carries
           * no text of its own — the icon is aria-hidden — so without the role
           * it announces as nothing at all.
           */
          <span role="img" title={help} aria-label={help} className="text-muted-foreground">
            <Info aria-hidden="true" className="size-3" />
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          'font-mono-nums mt-1.5 min-w-0 text-xl leading-none font-semibold tabular-nums sm:text-2xl',
          tone === 'caution' ? 'text-accent-yellow-text' : 'text-foreground',
        )}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {/*
         * The number and its unit stay together, whatever the width.
         *
         * `whitespace-nowrap` on the value alone is not enough — the unit is a
         * sibling span, and at 360px "192.6 mm" fits while "192.6" + "mm" on
         * separate lines does not happen to. But a NARROWER value does break
         * the unit onto its own line, which reads as two unrelated numbers.
         * Wrapping the pair is the fix.
         */}
        <span className="whitespace-nowrap">
          {value}
          {unit ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground sm:text-sm">
              {unit}
            </span>
          ) : null}
        </span>
      </p>

      {detail ? <p className="mt-1 text-xs break-words text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
