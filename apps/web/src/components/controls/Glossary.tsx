import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GLOSSARY } from '@/config/glossary';

export type GlossaryTerm = keyof typeof GLOSSARY;

/** A term rendered with a tooltip that defines it in plain language. */
export function GlossaryTip({ term, children }: { term: GlossaryTerm; children?: ReactNode }) {
  const definition = GLOSSARY[term];
  return (
    <Tooltip>
      <TooltipTrigger
        // The dotted underline is the affordance; the tooltip carries meaning.
        className="cursor-help decoration-dotted underline-offset-4 hover:underline"
        aria-label={`${term}: ${definition}`}
      >
        {children ?? term}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        <span className="font-medium">{term}</span> — {definition}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A compact glossary marker: an info icon that reveals the definition.
 *
 * Use this beside an existing label. `GlossaryTip` renders the term as its own
 * clickable text, which duplicates the label when the term is already shown —
 * "Strength pga ⓘ" reads as two separate controls for one idea.
 */
export function GlossaryIcon({ term }: { term: GlossaryTerm }) {
  const definition = GLOSSARY[term];
  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-line text-[9px] leading-none text-muted-foreground hover:bg-surface-2 focus-visible:outline-2"
        aria-label={`What is ${term}?`}
      >
        i
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        <span className="font-medium">{term}</span> — {definition}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A single info affordance combining an optional glossary definition and an
 * optional field-specific explanation.
 *
 * Two identical ⓘ icons side by side read as two unrelated controls, so a
 * field that has both shows one marker with both explanations stacked.
 */
export function TermTip({ term, help }: { term?: GlossaryTerm; help?: string }) {
  const definition = term ? GLOSSARY[term] : undefined;
  if (!definition && !help) return null;

  const label = term ? `What is ${term}?` : 'More information';

  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-line text-[9px] leading-none text-muted-foreground hover:bg-surface-2 focus-visible:outline-2"
        aria-label={label}
      >
        i
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {definition ? (
          <p>
            <span className="font-medium">{term}</span> — {definition}
          </p>
        ) : null}
        {definition && help ? <p className="mt-1.5">{help}</p> : help ? <p>{help}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** An info icon that reveals a longer explanation on hover or focus. */
export function InfoTip({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex size-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-muted-foreground hover:bg-surface-2 focus-visible:outline-2"
        aria-label={label ?? 'More information'}
      >
        i
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{children}</TooltipContent>
    </Tooltip>
  );
}
