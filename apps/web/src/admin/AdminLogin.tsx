import { useState } from 'react';

import { DEMO_CREDENTIALS } from './auth';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AdminLogin({ onSignIn }: { onSignIn: (email: string, password: string) => boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSignIn(email, password)) {
      setError('Those are not the demo credentials.');
      return;
    }
    setError(null);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4 text-foreground">
      <form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-card border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <h1 className="text-xl font-semibold">QuakeStudio admin</h1>
            <p className="text-sm text-muted-foreground">Demo sign-in for local content management.</p>
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

        <Button type="submit" className="w-full">
          Sign in
        </Button>

        <div className="rounded-app bg-surface-2 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Demo credentials</p>
          <p>{DEMO_CREDENTIALS.email}</p>
          <p>{DEMO_CREDENTIALS.password}</p>
        </div>
      </form>
    </div>
  );
}
