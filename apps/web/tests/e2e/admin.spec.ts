import { expect, test } from '@playwright/test';

/*
 * Admin workspace chrome.
 *
 * The API is stubbed out on purpose. These tests are about the workspace, not
 * the backend, and the browser-only path is the one every CI machine can
 * reproduce without a PostgreSQL service running.
 */
test.describe('admin workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/**', (route) => route.abort());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin');
    await page.getByLabel('Email').fill('admin@quakestudio.local');
    await page.getByLabel('Password').fill('admin123');
    await page.getByRole('button', { name: 'Sign in' }).click();
  });

  test('keeps Export and the theme toggle beside Publish', async ({ page }) => {
    await page.goto('/admin/feedback');

    await expect(page.getByRole('button', { name: /export excel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /switch to dark theme/i })).toBeVisible();
    // The page toolbar no longer carries a second export button.
    await expect(page.getByRole('button', { name: /export json/i })).toHaveCount(0);
  });

  test('shows toasts at the bottom of the viewport', async ({ page }) => {
    await page.getByRole('button', { name: 'Branding', exact: true }).click();
    await page.getByRole('button', { name: /save branding/i }).click();

    const toast = page.getByText(/changes saved\./i);
    await expect(toast).toBeVisible();

    const box = await toast.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect(box, 'the toast should have a measurable position').not.toBeNull();
    expect(box!.y, 'toasts are anchored to the bottom, not the top').toBeGreaterThan(height / 2);
  });

  test('sign out returns to the admin login page with a simulator link', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.locator('.swal2-confirm').click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('link', { name: 'Open simulation' })).toBeVisible();
  });
});
