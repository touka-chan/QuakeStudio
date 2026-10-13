import { useMemo, useState } from 'react';
import { Check, Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadCsv } from '@/lib/csv';
import { SUS_ITEMS, SUS_SCALE, type SusAnswers, type SusScaleValue } from './susItems';
import { aggregateSus, scoreSus, SUS_TARGET_SCORE } from './susScore';

/* =========================================================================
   Usability feedback
   -------------------------------------------------------------------------
   Collects the System Usability Scale, scores it, and exports the result.

   THIS COLLECTS DATA; IT DOES NOT PRODUCE EVIDENCE. A score from one person
   is one data point. QuakeStudio ships no results because usability testing
   needs real participants — see `docs/usability-plan.md` for how to run the
   study.

   Two design choices worth defending:

   • Responses are NEVER auto-saved. A participant who closes the tab mid-way
     should be able to reopen and finish; silently persisting a half-finished
     form is how a study ends up with responses nobody knowingly submitted.

   • Nothing leaves the device. There is no backend, so "export" is a file the
     researcher chooses to send on. That is also the honest privacy story for a
     tool used by students.
   ========================================================================= */

export type SusResponse = {
  /** ISO timestamp — when it was submitted, not when it was opened. */
  readonly submittedAt: string;
  readonly answers: Readonly<Record<string, SusScaleValue>>;
  readonly score: number;
  /** Free-text remarks, optional. */
  readonly comments?: string;
  /** Optional context a facilitator can attach out of band. */
  readonly participantId?: string;
};

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [answers, setAnswers] = useState<SusAnswers>({});
  const [comments, setComments] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [submitted, setSubmitted] = useState<SusResponse[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const answeredCount = useMemo(
    () => SUS_ITEMS.filter((item) => typeof answers[item.number] === 'number').length,
    [answers],
  );

  const preview = useMemo(() => {
    try {
      return scoreSus(answers);
    } catch {
      return null;
    }
  }, [answers]);

  const aggregate = useMemo(() => aggregateSus(submitted.map((r) => r.score)), [submitted]);

  const submit = () => {
    if (!preview) return;
    const response: SusResponse = {
      submittedAt: new Date().toISOString(),
      answers: Object.fromEntries(SUS_ITEMS.map((item) => [item.number, answers[item.number]!])),
      score: preview.score,
      comments: comments.trim() || undefined,
      participantId: participantId.trim() || undefined,
    };
    setSubmitted((previous) => [...previous, response]);
    setAnswers({});
    setComments('');
    setParticipantId('');
    setStatus('Response recorded locally. Nothing has been sent anywhere.');
  };

  const exportResponses = () => {
    const payload = {
      format: 'quakestudio-sus',
      version: 1,
      instrument: 'System Usability Scale — Bangor, Kortum & Miller (2008)',
      exportedAt: new Date().toISOString(),
      targetScore: SUS_TARGET_SCORE,
      responses: submitted,
    };
    downloadCsv('quakestudio-sus-responses.json', JSON.stringify(payload, null, 2));
    setStatus(`Exported ${submitted.length} response${submitted.length === 1 ? '' : 's'}.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Usability feedback</DialogTitle>
          <DialogDescription>
            Ten questions about your experience. Your answers stay in this browser until you export
            them, and are never sent anywhere automatically.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="questionnaire" className="flex min-h-0 flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="questionnaire">Questionnaire</TabsTrigger>
            <TabsTrigger value="responses">
              Responses
              {submitted.length > 0 ? (
                <Badge variant="outline" className="ml-1.5 text-[10px]">
                  {submitted.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="questionnaire" className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full pr-3">
              <div className="space-y-4">
                <ol className="space-y-5">
                  {SUS_ITEMS.map((item) => (
                    <li key={item.number}>
                      <fieldset>
                        <legend className="mb-1.5 text-sm">
                          {item.number}. {item.text}
                        </legend>
                        <RadioGroup
                          value={answers[item.number]?.toString() ?? ''}
                          onValueChange={(value) =>
                            setAnswers((previous) => ({
                              ...previous,
                              [item.number]: Number(value) as SusScaleValue,
                            }))
                          }
                          className="flex flex-wrap gap-x-3 gap-y-1"
                          aria-label={`Question ${item.number}`}
                        >
                          {SUS_SCALE.map((label, index) => {
                            const value = (index + 1) as SusScaleValue;
                            const id = `sus-${item.number}-${value}`;
                            return (
                              <div key={label} className="flex items-center gap-1.5">
                                <RadioGroupItem value={value.toString()} id={id} />
                                <Label htmlFor={id} className="cursor-pointer text-xs font-normal">
                                  {label}
                                </Label>
                              </div>
                            );
                          })}
                        </RadioGroup>
                      </fieldset>
                    </li>
                  ))}
                </ol>

                <div className="space-y-2 border-t border-line pt-3">
                  <label className="block text-sm font-medium" htmlFor="sus-participant">
                    Participant ID{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    id="sus-participant"
                    value={participantId}
                    onChange={(event) => setParticipantId(event.target.value)}
                    placeholder="e.g. P03"
                    className="w-40 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
                  />

                  <label className="mt-3 block text-sm font-medium" htmlFor="sus-comments">
                    Anything else?{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    id="sus-comments"
                    value={comments}
                    onChange={(event) => setComments(event.target.value)}
                    rows={3}
                    placeholder="What confused you, what you expected to happen, what you would change."
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="responses" className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full pr-3">
              {submitted.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No responses yet. Answer the questionnaire and submit one to see how it scores.
                </p>
              ) : (
                <div className="space-y-3">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      System Usability Scale responses collected in this browser
                    </caption>
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-muted-foreground">
                        <th scope="col" className="py-1.5 pr-2 font-medium">
                          ID
                        </th>
                        <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                          Score
                        </th>
                        <th scope="col" className="py-1.5 text-right font-medium">
                          Submitted
                        </th>
                      </tr>
                    </thead>
                    <tbody className="font-mono-nums">
                      {submitted.map((response, index) => (
                        <tr
                          key={`${response.submittedAt}-${index}`}
                          className="border-b border-line last:border-0"
                        >
                          <td className="py-1.5 pr-2">
                            {response.participantId ?? `response ${index + 1}`}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{response.score}</td>
                          <td className="py-1.5 text-right text-xs text-muted-foreground">
                            {new Date(response.submittedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {aggregate ? (
                    <div className="rounded-app border border-line p-3 text-sm">
                      <p className="font-medium">So far</p>
                      <p className="font-mono-nums text-muted-foreground">
                        mean {aggregate.mean} · median {aggregate.median} · n ={' '}
                        {aggregate.participants}
                      </p>
                      {aggregate.participants < 5 ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Treat this as a smoke test only. Fewer than five participants gives a mean
                          far too wide to compare against anything.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {status ? (
          <p
            role="status"
            className="shrink-0 rounded-app bg-surface-2 px-3 py-2 text-xs text-muted-foreground"
          >
            {status}
          </p>
        ) : null}

        <DialogFooter className="shrink-0 flex-wrap justify-between gap-2 border-t border-line pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={exportResponses}
            disabled={submitted.length === 0}
          >
            <Download aria-hidden="true" />
            Export responses
          </Button>

          <div className="flex items-center gap-2">
            <span className="font-mono-nums text-xs text-muted-foreground">
              {answeredCount}/{SUS_ITEMS.length} answered
              {preview ? ` · would score ${preview.score}` : ''}
            </span>
            <Button size="sm" onClick={submit} disabled={!preview}>
              <Check aria-hidden="true" />
              Submit response
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
