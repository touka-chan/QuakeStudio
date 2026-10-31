import React from 'react';
import { cn } from '@/lib/utils';

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-2 text-base text-muted-foreground leading-relaxed max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 sm:self-end">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-card border border-line bg-surface/80 p-6 shadow-sm ring-1 ring-white/5 backdrop-blur-sm', className)}>
      {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className={title || description ? 'mt-4' : ''}>{children}</div>
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
}: {
  saving?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={saving}
      className="rounded-app bg-gradient-to-br from-primary to-primary/90 px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/20 hover:from-primary/95 hover:to-primary/85 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
    >
      {saving ? "Saving..." : children}
    </button>
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
