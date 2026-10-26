import { Activity, Building2, Layers, Waves, type LucideIcon } from 'lucide-react';

import { BRANDING } from '@/content/branding';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  building: Building2,
  waves: Waves,
  layers: Layers,
  activity: Activity,
};

export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  const Icon = ICONS[BRANDING.logoIcon] ?? Building2;
  return (
    <div
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-app bg-primary text-primary-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <Icon className={cn('size-5', iconClassName)} />
    </div>
  );
}
