import { ClipboardCopy, ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ASSUMPTIONS,
  ASSUMPTION_GROUPS,
  assumptionsFilename,
  assumptionsMarkdown,
  placeholderCount,
  type AssumptionRow,
} from '@/config/assumptionCatalogue';
import { DISCLAIMER_LONG } from '@/config/engineeringAssumptions';
import { GLOSSARY } from '@/config/glossary';
import { APP_VERSION } from '@/types';

/* =========================================================================
   About & Assumptions
   -------------------------------------------------------------------------
   The one place a student — or a reviewer — can find out what the tool is
   actually doing and what it is assuming.

   Two things this page deliberately does:

   1. It states what the results are NOT. A page that lists assumptions
      without saying "these are all placeholders" would let the table imply an
      authority it does not have.

   2. It reads the assumptions from `engineeringAssumptions.ts` at runtime.
      A hand-written list beside the code is a list that eventually
      disagrees with it, and nobody notices until an adviser quotes the wrong
      number to a client.

   The "copy for review" button exports the same catalogue as markdown, so the
   review checklist the engineering adviser works from cannot go stale either.
   ========================================================================= */

/**
 * Contents of the About & Assumptions dialog.
 *
 * Renders `DialogContent` only — `TopBar` supplies the surrounding `Dialog`
 * and `DialogTrigger`, so that Radix knows which button to return focus to
 * when the dialog closes. See the note on `SaveLoadDialog` for why that
 * matters.
 */
export function AssumptionsDialog() {
  const [copied, setCopied] = useState(false);

  const copyForReview = async () => {
    const markdown = assumptionsMarkdown();
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
    } catch {
      // Clipboard access can be denied. Falling back to a download keeps the
      // feature useful rather than failing silently.
      const { downloadCsv } = await import('@/lib/csv');
      downloadCsv(assumptionsFilename(), markdown);
    }
  };

  return (
    <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
      <DialogHeader>
        <DialogTitle>About &amp; assumptions</DialogTitle>
        <DialogDescription>
          What QuakeStudio does, what it assumes, and what its results do not tell you.
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="about" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="assumptions">
            Assumptions
            <Badge
              variant="outline"
              className="ml-1.5 border-accent-yellow/40 text-[10px] text-accent-yellow-text"
            >
              {placeholderCount()} to review
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="glossary">Glossary</TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-3">
            <div className="space-y-4 text-sm">
              <p className="rounded-app border border-accent-yellow/40 bg-warning-bg px-3 py-2.5 text-warning-text">
                {DISCLAIMER_LONG}
              </p>

              <section className="space-y-1.5">
                <h3 className="font-semibold">What this is</h3>
                <p className="text-muted-foreground">
                  A teaching tool. Build a simplified building, shake it with a synthetic
                  earthquake, and watch how it responds. The point is to build intuition about how
                  buildings move — why taller buildings sway slower, why stiffening a frame helps,
                  and what resonance looks like.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-semibold">What the results do and do not mean</h3>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">They are internally consistent.</strong> The
                    software has been checked against an independent Python implementation of the
                    same model and agrees to about one part in ten billion.
                  </li>
                  <li>
                    <strong className="text-foreground">They are not validated engineering.</strong>{' '}
                    Every coefficient is a placeholder. An engineer has not reviewed them yet, and
                    this tool has not been compared against a real building.
                  </li>
                  <li>
                    <strong className="text-foreground">
                      The relationships are trustworthy; the absolute values are not.
                    </strong>{' '}
                    A braced frame really does sway less than a moment frame of the same height. How
                    much less — by the numbers shown here — is not established.
                  </li>
                  <li>
                    <strong className="text-foreground">
                      Never use this to assess a real structure.
                    </strong>{' '}
                    It models one direction, linear-elastic behaviour, and a fixed base. Real
                    buildings do none of those things under strong shaking.
                  </li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-semibold">How the model works</h3>
                <p className="text-muted-foreground">
                  The building is treated as a stack of floors that can move sideways, joined by
                  springs. Mass comes from floor area and material; stiffness is calibrated so the
                  building reaches a target natural period from a standard formula. The earthquake
                  shakes the ground, and the floors follow with their own lag. The equations are
                  integrated forward in time with Newmark-β at a fixed 0.01 s step.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-semibold">What is deliberately missing</h3>
                <p className="text-muted-foreground">
                  One horizontal direction, linear-elastic response, no torsion, no soil
                  interaction, and synthetic rather than recorded ground motion. These are scope
                  decisions for an MVP, not oversights.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-semibold">Version</h3>
                <p className="font-mono-nums text-xs text-muted-foreground">
                  QuakeStudio {APP_VERSION} · runs entirely in your browser · no data leaves this
                  device unless you export it yourself
                </p>
              </section>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="assumptions" className="min-h-0 flex-1 overflow-hidden">
          <AssumptionsTab />
        </TabsContent>

        <TabsContent value="glossary" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <GlossaryTab />
        </TabsContent>
      </Tabs>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <Button variant="outline" size="sm" onClick={() => void copyForReview()}>
          <ClipboardCopy aria-hidden="true" />
          {copied ? 'Copied — paste into the review' : 'Copy assumptions for review'}
        </Button>
        <a
          href="https://github.com/touka-chan/QuakeStudio/blob/main/docs/assumptions.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Full engineering notes and the review checklist
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      </div>
    </DialogContent>
  );
}

/* ------------------------------------------------------------------------- */

function AssumptionsTab() {
  return (
    <ScrollArea className="h-full pr-3">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Read straight from{' '}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">
            engineeringAssumptions.ts
          </code>
          , so these are the values the simulation actually runs on — not a summary that could drift
          away from them.
        </p>

        {ASSUMPTION_GROUPS.map((group) => {
          const rows = ASSUMPTIONS.filter((row) => row.group === group);
          if (rows.length === 0) return null;

          return (
            <section key={group} aria-labelledby={`assumptions-${group}`}>
              <h3 id={`assumptions-${group}`} className="mb-1.5 text-sm font-semibold">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {rows.map((row) => (
                  <AssumptionItem key={row.id} row={row} />
                ))}
              </ul>
            </section>
          );
        })}

        <p className="text-xs text-muted-foreground">
          “Needs review” means an engineer has not signed the value off. “Fixed by method” marks a
          choice that belongs to the numerical method rather than to the building, so there is
          nothing to confirm.
        </p>
      </div>
    </ScrollArea>
  );
}

/**
 * One assumption.
 *
 * The status is carried by a word and a symbol, never by colour alone — the
 * whole point of this page is to be readable by someone assessing how much to
 * trust the output.
 */
function AssumptionItem({ row }: { row: AssumptionRow }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-app border border-line px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="text-sm">{row.label}</span>
        <span className="block text-xs text-muted-foreground">{row.note}</span>
      </span>

      <span className="font-mono-nums shrink-0 text-sm tabular-nums">
        {row.value}
        {row.units !== '—' ? (
          <span className="ml-1 text-xs text-muted-foreground">{row.units}</span>
        ) : null}
      </span>

      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          row.placeholder
            ? 'bg-accent-yellow/15 text-accent-yellow-text'
            : 'bg-surface-2 text-muted-foreground'
        }`}
      >
        <span aria-hidden="true">{row.placeholder ? '☐' : '☑'}</span>{' '}
        {row.placeholder ? 'needs review' : 'fixed by method'}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------------- */

function GlossaryTab() {
  const [query, setQuery] = useState('');

  const entries = useMemo(() => {
    const all = Object.entries(GLOSSARY).sort(([a], [b]) => a.localeCompare(b));
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      ([term, definition]) =>
        term.toLowerCase().includes(needle) || definition.toLowerCase().includes(needle),
    );
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative shrink-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search terms…"
          aria-label="Search glossary terms"
          className="pl-8"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-3">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        ) : (
          <dl className="space-y-2">
            {entries.map(([term, definition]) => (
              <div key={term} className="rounded-app border border-line px-3 py-2">
                <dt className="text-sm font-medium">{term}</dt>
                <dd className="text-sm text-muted-foreground">{definition}</dd>
              </div>
            ))}
          </dl>
        )}
      </ScrollArea>

      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {entries.length} of {Object.keys(GLOSSARY).length} terms
      </p>
    </div>
  );
}
