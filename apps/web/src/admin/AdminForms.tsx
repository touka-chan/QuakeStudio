import React from 'react';
import { Save } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AdminButton } from './AdminUI';

export function AdminPageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:self-end">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-card border border-line bg-surface/80 p-5 shadow-sm backdrop-blur-sm sm:p-6',
        className,
      )}
    >
      {title || description || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={title || description || actions ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-semibold text-foreground tracking-tight">{label}</span>
      <div className="focus-within:ring-2 focus-within:ring-primary/20 rounded-app">{children}</div>
      {hint && !error ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="block text-xs font-medium text-destructive">{error}</span> : null}
    </label>
  );
}

export function AdminInput(props: React.ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={`h-9 w-full rounded-app border border-line bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${props.className ?? ''}`}
    />
  );
}

export function AdminTextarea(props: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full rounded-app border border-line bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${props.className ?? ''}`}
    />
  );
}

export function AdminSelect(props: React.ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={`h-9 w-full rounded-app border border-line bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${props.className ?? ''}`}
    />
  );
}

export function SaveButton({
  saving,
  onClick,
  children,
  className,
}: {
  saving?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AdminButton
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={saving}
      variant="primary"
      icon={Save}
      className={className}
    >
      {saving ? 'Saving...' : children}
    </AdminButton>
  );
}

export function IssueList({ issues }: { issues: { path: string; message: string }[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-app border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <ul className="list-disc space-y-1 pl-5">
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            {issue.path ? <span className="font-medium">{issue.path}: </span> : null}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
