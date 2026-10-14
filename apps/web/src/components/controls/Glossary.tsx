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
 * The shared info affordance behind every glossary marker in the app.
 *
 * The visible circle is 14px. The button around it is 44px, which is what you
 * can actually hit. The responsive audit measured these at 14x14 beside every
 * slider label - about half a fingertip's contact patch. WCAG 2.5.8 asks for
 * 24px; 44 is comfortable in practice.
 *
 * Three details that each cost a mistake to find:
 *
 * The inner span carries the visible circle, so the LOOK is unchanged. An
 * earlier attempt widened the hit area with a transparent `::after` instead,
 * which does work - but `getBoundingClientRect` still reports the 14px box, so
 * the audit could not see the fix and could not tell whether it had swallowed
 * part of the slider below. A real box measures honestly.
 *
 * `-my-[14px]` hands the bleed back to the layout, so a label row does not grow
 * by 28px just because its help icon became reachable.
 *
 * These were three near-identical tooltip triggers with the class string copied
 * three times. One implementation means the target size cannot drift apart
 * between them.
 */
function InfoTrigger({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        className="group -my-[14px] relative inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={label}
      >
        <span
          aria-hidden="true"
          className="grid size-3.5 place-items-center rounded-full border border-line text-[9px] leading-none text-muted-foreground group-hover:bg-surface-2"
        >
          i
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{children}</TooltipContent>
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
    <InfoTrigger label={`What is ${term}?`}>
      <span className="font-medium">{term}</span> — {definition}
    </InfoTrigger>
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

  return (
    <InfoTrigger label={term ? `What is ${term}?` : 'More information'}>
      {definition ? (
        <p>
          <span className="font-medium">{term}</span> — {definition}
        </p>
      ) : null}
      {definition && help ? <p className="mt-1.5">{help}</p> : help ? <p>{help}</p> : null}
    </InfoTrigger>
  );
}

/** An info icon that reveals a longer explanation on hover or focus. */
export function InfoTip({ children, label }: { children: ReactNode; label?: string }) {
  return <InfoTrigger label={label ?? 'More information'}>{children}</InfoTrigger>;
}
