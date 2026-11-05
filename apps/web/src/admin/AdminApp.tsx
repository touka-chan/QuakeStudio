import { useEffect, useState } from 'react';

import { ContentEffects } from '@/components/content/ContentEffects';
import { BRANDING } from '@/content/branding';
import { apiLogin, apiLogout, apiMe, type ApiLogin } from '@/api/auth';
import { isBackendAvailable } from '@/api/client';
import { isBackendEnabled, isBackendRequired } from '@/api/config';
import { readSession, signIn, signOut, type AdminSession } from './auth';
import { AdminContentProvider, useAdminContent } from './AdminContext';
import { AdminLogin } from './AdminLogin';
import { AdminShell } from './AdminShell';

type AuthMode = 'checking' | 'backend' | 'local';

function toSession(login: ApiLogin): AdminSession {
  return {
    email: login.admin.email,
    signedInAt: new Date().toISOString(),
  };
}

export default function AdminApp() {
  const backendEnabled = isBackendEnabled();
  const backendRequired = isBackendRequired();
  const [mode, setMode] = useState<AuthMode>(() => (backendEnabled ? 'checking' : 'local'));
  const [session, setSession] = useState<AdminSession | null>(() =>
    backendEnabled ? null : readSession(),
  );
  const [path, setPath] = useState(() => window.location.pathname || '/admin');

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;

    void (async () => {
      const available = await isBackendAvailable();
      if (cancelled) return;
      if (!available) {
        if (!backendRequired) {
          // Local development: keep the offline demo path usable.
          setMode('local');
          setSession(readSession());
          return;
        }
        // A hosted build must not fall back to the public demo credentials.
        setMode('backend');
        setSession(null);
        return;
      }

      setMode('backend');
      try {
        const me = await apiMe();
        if (!cancelled) setSession(me ? toSession(me) : null);
      } catch {
        if (cancelled) return;
        // The probe succeeded but the session call failed. Falling back to the
        // browser demo would be confusing, so show the sign-in screen instead.
        setSession(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backendEnabled, backendRequired]);

  function navigate(to: string): void {
    // App decides between the simulator and the admin workspace from the
    // initial pathname, so a pushState to "/" would leave the admin mounted.
    // Leaving admin is a real page change: reload the simulator.
    if (to === '/') {
      window.location.assign('/');
      return;
    }
    window.history.pushState({}, '', to);
    setPath(to);
  }

  async function handleLogout(): Promise<void> {
    if (mode === 'backend') {
      try {
        await apiLogout();
      } catch {
        // The cookie may already be gone. Clear the local view regardless.
      }
    }
    signOut();
    setSession(null);
    // Stay in the admin workspace and show the sign-in screen. A sign-out
    // that drops the researcher into the public simulator makes it look like
    // the account disappeared; the login page now carries its own link back
    // to the simulation instead.
    navigate('/admin');
  }

  if (mode === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">
        Checking the API…
      </div>
    );
  }

  if (!session) {
    return (
      <AdminLogin
        backendEnabled={mode === 'backend'}
        onSignIn={async (email, password) => {
          if (mode === 'backend') {
            try {
              const result = await apiLogin(email, password);
              setSession(toSession(result));
              navigate('/admin');
              return { ok: true };
            } catch (error) {
              return {
                ok: false,
                message:
                  error instanceof Error
                    ? error.message
                    : 'The API did not accept those credentials.',
              };
            }
          }
          if (!signIn(email, password)) {
            return { ok: false, message: 'Those are not the demo credentials.' };
          }
          setSession(readSession());
          navigate('/admin');
          return { ok: true };
        }}
      />
    );
  }

  return (
    <AdminContentProvider backendEnabled={mode === 'backend'}>
      <ContentEffects />
      <AdminShell path={path} navigate={navigate} email={session.email} onLogout={handleLogout} />
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
