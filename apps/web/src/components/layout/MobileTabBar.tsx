import { Building, LineChart, Sliders } from 'lucide-react';

import { cn } from '@/lib/utils';

/* =========================================================================
   Mobile tab bar
   -------------------------------------------------------------------------
   Below 1024px the three zones cannot sit side by side, so they become three
   tabs: Build / Simulate / Results. The 3D viewport stays visible on the
   Simulate tab, which is where students spend their time.
   ========================================================================= */

export type MobileTab = 'build' | 'simulate' | 'results';

const TABS = [
  { id: 'build', label: 'Build', icon: Sliders },
  { id: 'simulate', label: 'Simulate', icon: Building },
  { id: 'results', label: 'Results', icon: LineChart },
] as const satisfies ReadonlyArray<{ id: MobileTab; label: string; icon: typeof Building }>;

export function MobileTabBar({
  value,
  onChange,
}: {
  value: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="flex shrink-0 border-t border-line bg-surface lg:hidden"
      role="tablist"
    >
      {TABS.map((tab) => {
        const selected = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors',
              selected ? 'font-semibold text-primary' : 'text-muted-foreground',
            )}
          >
            <tab.icon aria-hidden="true" className="size-5" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
