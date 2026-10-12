import { expect, test } from '@playwright/test';

test.describe('QuakeStudio — Phase 0 smoke', () => {
  test('loads and shows the app title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'QuakeStudio' })).toBeVisible();
  });

  test('shows the educational-simulation disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/not a structural safety assessment/i).first()).toBeVisible();
  });

  test('theme toggle switches to dark and survives a reload', async ({ page }) => {
    await page.goto('/');

    // Pin the starting point so the test does not depend on the machine's OS
    // colour scheme, then walk the fixed cycle: light -> dark -> system.
    await page.evaluate(() => localStorage.setItem('quakestudio.theme', 'light'));
    await page.reload();

    await page.getByRole('button', { name: /theme: light/i }).click();
    await expect(page.getByRole('button', { name: /theme: dark/i })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Reload must not flash back to light: the inline script in index.html
    // re-applies the stored theme before React mounts.
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: /theme: dark/i })).toBeVisible();
  });

  test('renders every design-system section without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /brand & surface tokens/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /shaking-intensity scale/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /typography/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /engineering assumptions/i })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
