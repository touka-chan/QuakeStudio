import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';

import App from '@/App';
import { STORAGE_KEYS } from '@/config/engineeringAssumptions';
import { readStoredTheme, resolveTheme, storeTheme } from '@/lib/theme';

describe('theme selection', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('defaults to following the OS when nothing is stored', () => {
    expect(readStoredTheme()).toBe('system');
  });

  it('round-trips a stored preference', () => {
    storeTheme('dark');
    expect(readStoredTheme()).toBe('dark');
    storeTheme('light');
    expect(readStoredTheme()).toBe('light');
  });

  it('ignores a corrupt stored value rather than throwing', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'chartreuse');
    expect(readStoredTheme()).toBe('system');
  });

  it('resolves an explicit preference without consulting the OS', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });
});

describe('App (Phase 0 design system proof page)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('renders the QuakeStudio heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'QuakeStudio' })).toBeInTheDocument();
  });

  it('always shows the educational-simulation disclaimer', () => {
    render(<App />);
    expect(
      screen.getByText(/educational simulation using simplified assumptions/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/not a structural safety assessment/i)).toBeInTheDocument();
  });

  it('cycles system -> light -> dark -> system and persists each choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    // The cycle order is fixed: light, dark, system. Starting from the default
    // ('system'), the first click moves to 'light'.
    expect(screen.getByRole('button', { name: /theme: system/i })).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(screen.getByRole('button', { name: /theme: system/i }));
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(screen.getByRole('button', { name: /theme: light/i }));
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await user.click(screen.getByRole('button', { name: /theme: dark/i }));
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('system');
    expect(screen.getByRole('button', { name: /theme: system/i })).toBeInTheDocument();
  });

  it('restores a stored dark preference on mount', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'dark');
    render(<App />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: /theme: dark/i })).toBeInTheDocument();
  });

  it('renders the placeholder register so every value is visible for review', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /engineering assumptions/i })).toBeInTheDocument();
    expect(screen.getByText('Concrete')).toBeInTheDocument();
    expect(screen.getByText('600 kg/m²')).toBeInTheDocument();
  });
});
