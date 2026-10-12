import { Pause, Play, SkipBack } from 'lucide-react';

import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { VIEWPORT, type PlaybackSpeed } from '@/config/engineeringAssumptions';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import { useConfigStore } from '@/store/configStore';
import { usePlaybackStore } from '@/store/playbackStore';

/* =========================================================================
   Playback bar — sits under the 3D viewport.
   -------------------------------------------------------------------------
   Drives the single playback clock. Nothing here computes displacement: it
   only moves time, and the 3D view and the chart cursor follow from that.

   Starts PAUSED. `prefers-reduced-motion` keeps it paused and halves the
   default speed — an earthquake animation looping unbidden is exactly the
   kind of motion that setting asks us not to produce.
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
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line bg-surface px-4 py-3">
      {/* ---- Transport ---- */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setTime(0)} aria-label="Go to start">
          <SkipBack aria-hidden="true" />
        </Button>

        <Button
          size="icon"
          onClick={togglePlaying}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
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
                onClick={() => setSpeed(value)}
                className={`rounded-app px-2 py-1 font-mono-nums text-xs transition-colors ${
                  selected
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
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
          Motion
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
        Motion is drawn {exaggeration}× larger so millimetres are visible — the numbers are the true
        values.
        {reducedMotion ? ' Reduced-motion is on, so playback starts paused at half speed.' : ''}
      </p>
    </div>
  );
}
