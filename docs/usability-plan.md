# Usability study plan

**QuakeStudio Phase 6** · target: mean SUS ≥ 68

This is the plan for running the study. QuakeStudio ships the instrument, the
scoring and the analysis; **the results come from people**, which is why there
is no results file in this repository yet.

---

## What is built, and what is missing

| Piece | Status |
|---|---|
| The SUS questionnaire, in the app | ✅ Feedback button in the top bar |
| Scoring, matching the published rule | ✅ `apps/web/src/feedback/susScore.ts` |
| Cross-check that TS and Python agree | ✅ `npm run usability:cross-check` |
| Analysis and report generation | ✅ `python tools/usability/analyze.py` |
| **Participants** | ❌ needs recruiting |
| **Results** | ❌ needs running |

Everything below is about the last two.

---

## Before you start

### Ethics and consent

This is a university project with no commercial data collection, but it still
involves people, and civil engineering students are a small population — someone
in a class may recognise a response.

- Get your department's approval before recruiting. Ask specifically whether
  consent forms are required.
- Tell participants: **their name is never collected.** The optional Participant
  ID exists so a facilitator can link a response to their notes, not to
  identify them. Use a code you assign (`P01`, `P02`), never a name or email.
- Tell participants the responses are anonymous to each other and reported only
  in aggregate.
- Offer to delete their response on request, and say how.

### The licence note

The SUS is the work of Bangor, Kortum & Miller and the authors hold rights to
the instrument. It is used here without charge for evaluation, which is its
intended use. Confirm the terms before redistributing the repository publicly.

---

## How many participants

**Aim for 10.** Five is the floor at which a mean becomes directionally useful;
below that the confidence interval spans most of the scale and the number is
noise.

Do not chase a bigger sample by changing who is eligible. A homogeneous group of
volunteers will report a better score than the students who actually struggle
with the tool — and the students who struggle are the ones you need to hear.

`analyze.py` refuses to declare a study complete below `--min-participants`
(default 5) and exits non-zero, so a thin sample cannot be quietly reported.

---

## Who to recruit

**Civil or structural engineering students who have not used QuakeStudio
before.** Second year is roughly the point where the material (dynamics, drift,
natural period) is familiar enough to be useful but new enough that the tool
should teach them something.

| Good | Not useful |
|---|---|
| Second/third-year civil students | The project team themselves |
| Students who have taken structural dynamics | Final-year students writing their thesis on this |
| A mix of genders and backgrounds | Only your own study group |
| People who have not seen a demo | Anyone primed beforehand |

Record only what affects interpretation: year of study, and whether they have
taken structural dynamics. Nothing else — you do not need demographics you will
not analyse.

---

## Session format

**15 minutes, one at a time, in person if possible.** Remote is acceptable; say
so in the write-up, because it changes what participants can point at.

### Running order

1. **Consent and framing** (2 min).
   > "This is about whether the tool is understandable, not whether you are
   > good at structural engineering. There are no wrong answers. I'm testing the
   > software."

   That sentence matters. Without it, participants assume they are being tested
   on their subject knowledge, and they perform rather than report.

2. **Think aloud, on three tasks** (8 min).

   Tasks, in this order:

   - **T1.** *Set up a 10-storey concrete building, shake it at 0.4 g, and tell
     me the peak displacement.*
   - **T2.** *Make it sway less. Tell me what you changed and why.*
   - **T3.** *Compare it against a second building using the same earthquake,
     and tell me which one responds more strongly.*

   T2 is the important one. It is a goal, not a script — if the participant goes
   somewhere else, follow them. T3 should be the last task, because comparison
   mode is the most recent feature and should not contaminate T1 or T2.

3. **SUS questionnaire** (3 min).
   Hand them the Feedback dialog. **Do not explain the items** — the wording is
   the instrument, and a facilitator who paraphrases it changes the measurement.

4. **Debrief** (2 min).
   > "What would you tell the next person about this tool?"
   > "Was there anything you expected to happen and it didn't?"

### The two rules that keep the data clean

- **Do not help.** When a participant gets stuck, note it and move on. A rescue
  removes the evidence that something was unclear — and that is the finding.
- **Do not defend the tool.** If they ask whether the numbers are right, say:
  *"I can't answer that."* Defending it biases everything they say afterwards.

### What to record during the session

- Task completion (yes / partly / no, plus how long)
- Where they paused, and what they said at that moment
- Wrong turns — especially if they use a control to do the wrong thing
- Anything they tried that does not exist (a zoom control, an undo button)

Transcribe quotes verbatim during the session, not from memory afterwards.

---

## After the sessions

### Collect the responses

In the app: **Feedback → Responses → Export responses**. That produces
`quakestudio-sus-responses.json`.

Keep one file per participant, then merge them into a single array, or run
`analyze.py` per participant and aggregate by hand. The format is:

```json
{
  "format": "quakestudio-sus",
  "version": 1,
  "responses": [
    {
      "submittedAt": "2026-10-20T14:03:11.000Z",
      "participantId": "P01",
      "answers": { "1": 5, "2": 2, "...": 0 },
      "score": 72.5,
      "comments": "I wasn't sure which building was being edited."
    }
  ]
}
```

### Analyse

```bash
python tools/usability/analyze.py responses.json
```

Writes `docs/usability-results.md`. The numbers are computed, not typed in, and
the report refuses to describe an under-powered sample as a study.

---

## Interpreting the result honestly

### SUS is relative, not absolute

A score of 68 means "better than roughly half of the systems in Bangor's
reference corpus". It does **not** mean "68% usable", and the same score is good
in one domain and mediocre in another. Say "above average for the systems in
the comparison corpus", never "68% of users found it easy".

### Report the interval, not just the mean

With n = 10 and a typical spread, the 95% interval is roughly ±10 points. A
mean of 69 with an interval of 58–80 has not demonstrated that it clears 68.

### The item analysis is the actionable part

The mean tells you whether something is wrong. The per-item table tells you
what. A study scoring 64 with item 7 at 2.2 and item 1 at 4.5 is not a study
that failed — it is a study that found a specific, fixable problem.

Two items need reading with care:

- **Item 7** ("very cumbersome") is a strong wording. A low score here is real.
- **Items 8 and 10** are scored *contrary to how they read* — item 8 is worded
  positively but reversed, item 10 is worded negatively but scored forward. That
  is the published instrument. `apps/web/src/feedback/susScore.ts` explains it,
  and `npm run usability:cross-check` proves the TypeScript and Python scorers
  agree about it.

### Qualitative findings usually matter more

One participant saying *"I assumed the orange meant danger"* is worth more than
three points of SUS mean. Report the sessions, not just the number.

### Do not report SUS as evidence about the engineering

Participants were judging a **tool**. Every coefficient is still a placeholder
(`docs/assumptions.md`). A participant who found the tool confusing was not
commenting on the physics, and a high SUS score is not a vote of confidence in
the numbers.

---

## Known risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Facilitator familiarity** | If you built it, you will explain things unasked | Run two pilot sessions and discard them |
| **Priming** | A demo before the task inflates scores | Nobody sees the tool before their session |
| **Recruitment bias** | Volunteers are enthusiasts | Record that they volunteered; treat it as a limitation |
| **Author effects** | Classmates may answer to please | Make responses anonymous, and say so |
| **The near-resonance default** | The default shaking (1.4 Hz) is close to the default building's frequency (1.59 Hz), so the chart is dense and the displacement large | Expect it to be mentioned. Do not change the default before measuring — you would be measuring your own change, not the tool's |
| **Small n** | A single outlier moves the mean visibly | Report the median and the interval alongside |

---

## What to hand the client

1. `docs/usability-results.md` — generated, with the sample size and interval
2. `docs/usability-findings.md` — what participants actually said and did,
   including the things that went wrong
3. A short section in the README noting the study was run, when, with whom, and
   what the number does and does not mean

Keep the raw `responses.json` — it is small, and a client or adviser who
disagrees with the analysis should be able to check the arithmetic.

---

## Also available

`docs/heuristic-evaluation.md` is an expert review of the app against Nielsen's
ten usability heuristics. It is **not** a substitute for this study — an expert
review finds what an expert notices, which is a different and biased set. Run
the study anyway.