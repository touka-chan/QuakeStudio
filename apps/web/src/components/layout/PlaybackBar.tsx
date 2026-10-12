import { Pause, Play, SkipBack } from 'lucide-react';

import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { VIEWPORT } from '@/config/engineeringAssumptions';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';
import type { PlaybackSpeed } from '@/config/engineeringAssumptions';

/* =========================================================================
   Playback bar — sits under the 3D viewport.
   -------------------------------------------------------------------------
   Phase 1: the transport is present and the scrubber moves the readout, but
   nothing plays. Phase 3 wires the clock to the solver output.

   Deliberate decision: it starts PAUSED and says so. A mock animation running
   on loop would imply the simulation is live, which it is not. When Phase 3
   lands, `prefers-reduced-motion` keeps the paused start and lowers the
   default speed.
   ========================================================================= */

const SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2];

export function PlaybackBar() {
  const duration = useConfigStore((s) => s.motion.durationS);
  const {
    time,
    playing,
    speed,
    loop,
    exaggeration,
    setTime,
    setSpeed,
    setLoop,
    setExaggeration,
    togglePlaying,
  } = usePlaybackStore();

  const clampedTime = Math.min(time, duration);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line bg-surface px-4 py-3">
      {/* ---- Transport ---- */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setTime(0)}
          aria-label="Go to start"
          disabled
        >
          <SkipBack aria-hidden="true" />
        </Button>

        <Button
          size="icon"
          onClick={togglePlaying}
          aria-label={playing ? 'Pause' : 'Play'}
          disabled
          className="size-11 rounded-full"
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" className="ml-0.5" />}
        </Button>
      </div>

      {/* ---- Scrubber ---- */}
      <div className="flex min-w-48 flex-1 items-center gap-3">
        <Slider
          value={[clampedTime]}
          min={0}
          max={duration}
          step={0.01}
          onValueChange={(next) => setTime(next[0] ?? 0)}
          aria-label="Simulation time"
          aria-valuetext={`${clampedTime.toFixed(1)} of ${duration} seconds`}
          disabled={false}
        />
        <span className="font-mono-nums shrink-0 text-sm text-muted-foreground">
          <span className="text-foreground">{clampedTime.toFixed(1)}</span> / {duration.toFixed(1)}{' '}
          s
        </span>
      </div>

      {/* ---- Speed ---- */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Speed
        </span>
        <div
          className="flex rounded-app bg-surface-2 p-0.5"
          role="radiogroup"
          aria-label="Playback speed"
        >
          {SPEEDS.map((value) => {
            const selected = speed === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled
                onClick={() => setSpeed(value)}
                className={`rounded-app px-2 py-1 font-mono-nums text-xs transition-colors ${
                  selected
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {value}×
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Motion exaggeration ---- */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="exaggeration"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Motion exaggeration
        </label>
        <Slider
          id="exaggeration"
          value={[exaggeration]}
          min={VIEWPORT.minExaggeration}
          max={VIEWPORT.maxExaggeration}
          step={VIEWPORT.exaggerationStep}
          onValueChange={(next) => setExaggeration(next[0] ?? VIEWPORT.defaultExaggeration)}
          aria-label="Motion exaggeration factor"
          aria-valuetext={`${exaggeration} times real movement`}
          className="w-28"
        />
        <span className="font-mono-nums w-10 text-sm text-primary">×{exaggeration}</span>
      </div>

      {/* ---- Loop ---- */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={loop}
          onChange={(event) => setLoop(event.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
        Loop
      </label>

      <p className="w-full text-xs text-muted-foreground">
        Playback arrives in Phase 3. Right now you can scrub to read the chart at any moment.
      </p>
    </div>
  );
}
