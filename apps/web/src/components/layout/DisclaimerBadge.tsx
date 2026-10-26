import { Building2 } from 'lucide-react';

import { BRANDING } from '@/content/branding';

/* =========================================================================
   Disclaimer badge — persistent, top bar, never dismissible.
   -------------------------------------------------------------------------
   The brief is explicit that this must always be visible. It is not a toast,
   not dismissible, and not hidden on small screens — it wraps instead. A user
   who reads only this line cannot be misled about what the tool does.
   ========================================================================= */

export function DisclaimerBadge() {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-full bg-warning-bg px-3 py-1.5 text-xs text-warning-text sm:px-4"
    >
      <Building2 aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span className="leading-snug">{BRANDING.disclaimerShort}</span>
    </p>
  );
}
