import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdminLogin } from '@/admin/AdminLogin';

/*
 * After sign-out the admin stays on the login page. The login page is now the
 * one place a researcher can step back into the simulator from.
 */
describe('admin login page', () => {
  it('links to the simulation website', () => {
    render(<AdminLogin backendEnabled={false} onSignIn={async () => ({ ok: true })} />);
    expect(screen.getByRole('link', { name: 'Open simulation' })).toHaveAttribute('href', '/');
  });

  it('keeps the link when the hosted API is configured', () => {
    render(<AdminLogin backendEnabled onSignIn={async () => ({ ok: true })} />);
    expect(screen.getByRole('link', { name: 'Open simulation' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Sign in to the QuakeStudio content service.')).toBeInTheDocument();
  });
});
