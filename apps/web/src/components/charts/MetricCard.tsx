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
        'rounded-card border border-line bg-surface p-3',
        tone === 'caution' && 'border-accent-yellow/50',
      )}
      data-testid={testId}
    >
      <div className="flex items-start gap-1">
        <p className="text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase">
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
          'font-mono-nums mt-1.5 text-2xl leading-none font-semibold tabular-nums',
          tone === 'caution' ? 'text-accent-yellow-text' : 'text-foreground',
        )}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        ) : null}
      </p>

      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
