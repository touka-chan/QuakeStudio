import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

import { isBackendRequired } from '@/api/config';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEMO_CREDENTIALS } from './auth';

export type SignInResult = { ok: true } | { ok: false; message: string };

export function AdminLogin({
  onSignIn,
  backendEnabled,
}: {
  onSignIn: (email: string, password: string) => Promise<SignInResult>;
  backendEnabled: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await onSignIn(email, password);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4 text-foreground">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-6 rounded-card border border-line bg-surface p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-xl font-semibold">QuakeStudio admin</h1>
            <p className="text-sm text-muted-foreground">
              {backendEnabled
                ? 'Sign in to the QuakeStudio content service.'
                : 'Demo sign-in for local content management.'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-password">Password</Label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>

        {backendEnabled ? (
          <p className="rounded-app bg-surface-2 p-3 text-xs text-muted-foreground">
            {isBackendRequired() ? (
              'Uses the hosted content API configured for this build. Ask the project owner for an account.'
            ) : (
              <>
                Uses the local API at <span className="font-mono">localhost:8000</span>. Start it
                with <span className="font-mono">npm run backend:dev</span>.
              </>
            )}
          </p>
        ) : (
          <div className="rounded-app bg-surface-2 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Demo credentials</p>
            <p>{DEMO_CREDENTIALS.email}</p>
            <p>{DEMO_CREDENTIALS.password}</p>
          </div>
        )}

        <Button asChild variant="outline" className="w-full">
          <a href="/">
            <ExternalLink aria-hidden="true" />
            Open simulation
          </a>
        </Button>
      </form>
    </div>
  );
}
