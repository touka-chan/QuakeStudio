import { useEffect, useState } from 'react';

import { ContentEffects } from '@/components/content/ContentEffects';
import { BRANDING } from '@/content/branding';
import { readSession, signIn, signOut } from './auth';
import { AdminContentProvider, useAdminContent } from './AdminContext';
import { AdminLogin } from './AdminLogin';
import { AdminShell } from './AdminShell';

export default function AdminApp() {
  const [session, setSession] = useState(() => readSession());
  const [path, setPath] = useState(() => window.location.pathname || '/admin');

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(to: string): void {
    window.history.pushState({}, '', to);
    setPath(to);
  }

  if (!session) {
    return (
      <AdminLogin
        onSignIn={(email, password) => {
          if (!signIn(email, password)) return false;
          setSession(readSession());
          navigate('/admin');
          return true;
        }}
      />
    );
  }

  return (
    <AdminContentProvider>
      <ContentEffects />
      <AdminShell path={path} navigate={navigate} onLogout={() => { signOut(); setSession(null); navigate('/'); }} />
    </AdminContentProvider>
  );
}

export function AdminDocumentTitle() {
  const { content } = useAdminContent();
  useEffect(() => {
    document.title = `Admin — ${content.branding.appName || BRANDING.appName}`;
  }, [content.branding.appName]);
  return null;
}
