import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* =========================================================================
   Top bar action slot
   -------------------------------------------------------------------------
   Page-level actions that belong beside Publish — the feedback export is the
   first one — render here instead of inside the page's own toolbar. A portal
   keeps the button owned by the page that knows what it exports, while the
   position stays in the workspace chrome.

   Renders nothing when there is no provider, so a page is still safe to mount
   on its own in a test.
   ========================================================================= */

type SlotContextValue = {
  node: HTMLElement | null;
  setNode: (node: HTMLElement | null) => void;
};

const AdminTopBarSlotContext = createContext<SlotContextValue | null>(null);

export function AdminTopBarSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <AdminTopBarSlotContext.Provider value={{ node, setNode }}>
      {children}
    </AdminTopBarSlotContext.Provider>
  );
}

/** The mount point rendered inside `AdminTopBar`, beside Publish. */
export function AdminTopBarSlotTarget() {
  const context = useContext(AdminTopBarSlotContext);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      context?.setNode(node);
    },
    [context],
  );
  return <div ref={attach} className="flex items-center gap-2" />;
}

/** Render page actions in the top bar. */
export function AdminTopBarActions({ children }: { children: ReactNode }) {
  const context = useContext(AdminTopBarSlotContext);
  if (!context?.node) return null;
  return createPortal(children, context.node);
}
