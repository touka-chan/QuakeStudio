import { lazy, Suspense } from 'react';

import { ContentEffects } from '@/components/content/ContentEffects';
import { AppShell } from '@/components/layout/AppShell';

const AdminApp = lazy(() => import('./admin/AdminApp'));

export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return (
      <Suspense fallback={<div className="grid min-h-dvh place-items-center bg-background text-muted-foreground">Loading admin…</div>}>
        <AdminApp />
      </Suspense>
    );
  }

  return (
    <>
      <ContentEffects />
      <AppShell />
    </>
  );
}
