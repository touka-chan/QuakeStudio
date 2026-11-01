import React, { useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Menu, Moon, Search, Sun, X, type LucideIcon } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import {
  applyTheme,
  prefersDark,
  readStoredTheme,
  storeTheme,
  type ThemePreference,
} from '@/lib/theme';
import { cn } from '@/lib/utils';

type AdminButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type AdminButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<AdminButtonVariant, string> = {
  primary:
    'border border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md',
  secondary: 'border border-line bg-surface text-foreground hover:bg-surface-2',
  ghost: 'border border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
  danger: 'border border-danger/30 bg-danger/5 text-danger hover:bg-danger/10',
};

const BUTTON_SIZES: Record<AdminButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-10 gap-2 px-4 text-sm',
};

export function adminButtonClass(
  variant: AdminButtonVariant = 'secondary',
  size: AdminButtonSize = 'md',
  className?: string,
) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-app font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export function AdminButton({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  icon?: LucideIcon;
}) {
  return (
    <button type={type} className={adminButtonClass(variant, size, className)} {...props}>
      {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-2 text-muted-foreground',
  primary: 'border-primary/20 bg-primary/10 text-primary',
  success: 'border-primary/20 bg-primary/10 text-primary',
  warning: 'border-warning/30 bg-warning-bg text-warning-text',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
};

export function AdminBadge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AdminDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-line bg-surface text-foreground shadow-2xl outline-none',
            size === 'lg' ? 'max-w-3xl' : 'max-w-xl',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="grid size-8 shrink-0 place-items-center rounded-app text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Close dialog"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface/50 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AdminSwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id?: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const generatedId = React.useId();
  const switchId = id ?? generatedId;

  return (
    <div className="flex items-start justify-between gap-4 rounded-app border border-line bg-background/40 p-3">
      <div className="min-w-0">
        <label htmlFor={switchId} className="block text-sm font-medium leading-5">
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

export function AdminSearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onClear: () => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 w-full rounded-app border border-line bg-surface pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-app text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function AdminThemeToggle({ className }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredTheme());
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());

  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const resolved = (preference === 'system' ? (systemDark ? 'dark' : 'light') : preference) as
    | 'light'
    | 'dark';

  useEffect(() => {
    applyTheme(resolved);
    storeTheme(preference);
  }, [resolved, preference]);

  const isDark = resolved === 'dark';

  return (
    <button
      type="button"
      onClick={() => setPreference(isDark ? 'light' : 'dark')}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className={cn(
        'grid size-9 place-items-center rounded-app border border-line bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
    >
      {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}

export function formatAdminDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/* ----------------------------------------------------------------
   Status badges — Published / Live / Draft / Edited / Needs review
   ---------------------------------------------------------------- */

type StatusTone = 'live' | 'draft' | 'edited' | 'warning' | 'needs-review' | 'neutral';

const STATUS_TONES: Record<StatusTone, string> = {
  live: 'border border-primary/25 bg-primary/10 text-primary',
  draft: 'border border-warning/35 bg-warning-bg text-warning-text',
  edited: 'border border-warning/35 bg-warning-bg text-warning-text',
  warning: 'border border-warning/35 bg-warning-bg text-warning-text',
  'needs-review': 'border border-warning/35 bg-warning-bg text-warning-text',
  neutral: 'border border-line bg-surface-2 text-muted-foreground',
};

export function StatusBadge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[8px] border px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap',
        STATUS_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------
   Stat card — headline number with label and optional trend/icon
   ---------------------------------------------------------------- */

export function AdminStatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  trend?: { label: string; tone: 'good' | 'bad' | 'neutral' };
  tone?: StatusTone;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular">{value}</p>
          {hint ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-app bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : trend ? (
          <StatusBadge tone={tone}>{trend.label}</StatusBadge>
        ) : null}
      </div>
      {trend ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {trend.tone === 'good' ? '▲' : trend.tone === 'bad' ? '▼' : '—'} {trend.label.toLowerCase()}
        </p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group rounded-card border border-line bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {body}
      </button>
    );
  }

  return <div className="rounded-card border border-line bg-surface p-4 shadow-sm">{body}</div>;
}

/* ----------------------------------------------------------------
   Alert banner — yellow draft / needs-review banner
   ---------------------------------------------------------------- */

export function DraftBanner({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-warning/35 bg-warning-bg p-4 text-warning-text">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-warning text-warning-text/70" aria-hidden="true">
            !
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            {detail ? <p className="mt-0.5 text-xs leading-5">{detail}</p> : null}
          </div>
        </div>
        {action ? <div className="ml-auto flex shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Top bar — search, draft status, preview, publish
   ---------------------------------------------------------------- */

export function AdminTopBar({
  draftCount,
  onSearchChange,
  searchValue,
  onPublish,
  onPreview,
  onMenu,
  searchPlaceholder,
}: {
  draftCount?: number;
  onSearchChange?: React.ChangeEventHandler<HTMLInputElement>;
  searchValue?: string;
  onPublish?: () => void;
  onPreview?: () => void;
  onMenu?: () => void;
  searchPlaceholder?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur-[6px]">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {onMenu ? (
            <button
              type="button"
              onClick={onMenu}
              aria-label="Open admin navigation"
              aria-controls="admin-mobile-nav"
              className="grid size-9 shrink-0 place-items-center rounded-app border border-line bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
            >
              <Menu className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          <div className="relative min-w-0 flex-1 lg:max-w-2xl">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchValue}
              placeholder={searchPlaceholder ?? 'Search settings, text, glossary...'}
              aria-label="Search admin"
              className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-30 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={onSearchChange}
            />
            <kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-[4px] border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:block">
              ⌃K
            </kbd>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          {draftCount != null && draftCount > 0 ? (
            <span className="flex items-center gap-1.5 rounded-[10px] border border-warning/35 bg-warning-bg px-2.5 py-1.5 text-xs font-medium text-warning-text">
              <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-warning text-warning-text/70" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline">
                Draft · {draftCount} unpublished change{draftCount === 1 ? '' : 's'}
              </span>
              <span className="sm:hidden">{draftCount} draft</span>
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <AdminButton variant="ghost" size="sm" onClick={onPreview}>
              <span className="hidden sm:inline">Preview in simulator</span>
              <span className="sm:hidden">Preview</span>
            </AdminButton>
            <AdminButton variant="primary" size="sm" onClick={onPublish}>
              <span className="hidden sm:inline">Publish changes</span>
              <span className="sm:hidden">Publish</span>
            </AdminButton>
          </div>
        </div>
      </div>
    </header>
  );
}

export function AdminTabNav({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface-2/60 p-1 shadow-sm">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`rounded-[8px] px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isActive
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface/60'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------
   Breadcrumb — Simulation / Engineering, Content / Templates
   ---------------------------------------------------------------- */

export function AdminBreadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? (
            <span className="mx-0.5" aria-hidden="true">
              /
            </span>
          ) : null}
          {item.href ? (
            <a href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </a>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------
   Side edit panel — slide-over drawer used by templates / glossary
   ---------------------------------------------------------------- */

export function AdminEditPanel({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed right-0 top-0 z-50 h-full w-[calc(100%-2rem)] max-w-[38rem] flex flex-col overflow-hidden rounded-bl-card border-l border-line bg-surface text-foreground shadow-2xl outline-none',
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 shrink-0">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {subtitle ? (
                <DialogPrimitive.Description className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {subtitle}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              className="grid size-8 shrink-0 place-items-center rounded-app text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Close panel"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 shrink-0 px-5 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ----------------------------------------------------------------
   Table — heading row + body row shells
   ---------------------------------------------------------------- */

export function AdminTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function AdminTableHeadCell({ children }: { children: React.ReactNode }) {
  return <th className="text-left p-3 font-medium">{children}</th>;
}

export function AdminTableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function AdminTableRow({
  children,
  highlighted = false,
  className,
}: {
  children: React.ReactNode;
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        'border-b border-line bg-surface/50 hover:bg-surface-2 transition-colors focus-within:ring-2 focus-within:ring-primary/10',
        highlighted ? 'ring-1 ring-primary/20' : '',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function AdminTableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('p-3 align-top text-sm', className)}>{children}</td>;
}

/* ----------------------------------------------------------------
   Activity item — recent activity feed row
   ---------------------------------------------------------------- */

export function ActivityItem({
  avatar,
  name,
  action,
  meta,
  time,
}: {
  avatar: React.ReactNode;
  name: string;
  action: string;
  meta?: string;
  time: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold">{avatar}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5">
          <span className="font-medium text-foreground">{name}</span>{' '}
          <span className="font-normal">{action}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {meta ? <span>{meta} · </span> : null}{time}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Empty section — consistent empty state
   ---------------------------------------------------------------- */

export function AdminEmptySection({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface/50 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------
   Section header — title + description + actions row
   ---------------------------------------------------------------- */

export function AdminSectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

