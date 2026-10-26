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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
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
    <section className={cn('rounded-card border border-line bg-surface p-5', className)}>
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
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="block text-xs text-destructive">{error}</span> : null}
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
      className="rounded-app bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
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

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-app border border-line px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-app bg-destructive px-4 py-2 text-sm font-medium text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
