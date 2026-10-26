const SESSION_KEY = 'quakestudio.admin.session';

export type AdminSession = {
  email: string;
  signedInAt: string;
};

export const DEMO_CREDENTIALS = {
  email: 'admin@quakestudio.local',
  password: 'admin123',
} as const;

export function readSession(): AdminSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (typeof parsed.email !== 'string' || typeof parsed.signedInAt !== 'string') return null;
    return parsed as AdminSession;
  } catch {
    return null;
  }
}

export function signIn(email: string, password: string): boolean {
  if (email.trim().toLowerCase() !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
    return false;
  }
  const session: AdminSession = {
    email: DEMO_CREDENTIALS.email,
    signedInAt: new Date().toISOString(),
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return true;
}

export function signOut(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore blocked storage; the UI still forgets the session on reload.
  }
}
