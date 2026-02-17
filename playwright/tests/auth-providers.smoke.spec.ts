import { expect, test, type Page } from '@playwright/test';
import { authStorageKeys, testIds } from '../../src/testIds';

const login = async (page: Page) => {
  await page.goto('/login');
  await page.getByTestId(testIds.auth.loginUsernameInput).fill('admin');
  await page.getByTestId(testIds.auth.loginPasswordInput).fill('password');
  await page.getByTestId(testIds.auth.loginSubmitButton).click();
  await expect(page).toHaveURL(/\/$/);
};

test.describe('auth smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('login success and failure', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId(testIds.auth.loginUsernameInput).fill('bad-user');
    await page.getByTestId(testIds.auth.loginPasswordInput).fill('wrong');
    await page.getByTestId(testIds.auth.loginSubmitButton).click();
    await expect(page.getByTestId(testIds.auth.loginError)).toBeVisible();

    await page.getByTestId(testIds.auth.loginUsernameInput).fill('admin');
    await page.getByTestId(testIds.auth.loginPasswordInput).fill('password');
    await page.getByTestId(testIds.auth.loginSubmitButton).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('guarded route redirects to /login', async ({ page }) => {
    await page.goto('/providers');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fproviders/);
    await expect(page.getByTestId(testIds.auth.loginPage)).toBeVisible();
  });

  test('provider create/toggle/delete persists across reload', async ({ page }) => {
    await login(page);

    await page.goto('/providers');
    await page.getByTestId(testIds.providers.addButton).click();
    await page.getByTestId(testIds.providers.labelInput).fill('E2E Provider');
    await page.getByTestId(testIds.providers.keyInput).fill('e2e-secret-key');
    await page.getByTestId(testIds.providers.saveButton).click();

    const row = page.getByTestId(/providers-row-/).filter({ hasText: 'E2E Provider' }).first();
    await expect(row).toBeVisible();

    const toggle = row.getByRole('switch');
    await expect(toggle).toHaveAttribute('data-state', 'checked');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'unchecked');

    await page.reload();
    const persistedRow = page.getByTestId(/providers-row-/).filter({ hasText: 'E2E Provider' }).first();
    await expect(persistedRow).toBeVisible();
    await expect(persistedRow.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');

    await persistedRow.getByTestId(/providers-row-delete-/).click();
    await expect(page.getByTestId(/providers-row-/).filter({ hasText: 'E2E Provider' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId(/providers-row-/).filter({ hasText: 'E2E Provider' })).toHaveCount(0);
  });

  test('unauthorized access when session is missing or expired', async ({ page }) => {
    await login(page);
    await page.goto('/providers');
    await expect(page).toHaveURL('/providers');

    await page.evaluate((sessionKey) => localStorage.removeItem(sessionKey), authStorageKeys.session);
    await page.goto('/providers');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fproviders/);

    await login(page);
    await page.evaluate((sessionKey) => {
      const raw = localStorage.getItem(sessionKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      parsed.expiresAt = new Date(Date.now() - 60_000).toISOString();
      localStorage.setItem(sessionKey, JSON.stringify(parsed));
    }, authStorageKeys.session);

    await page.goto('/providers');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fproviders/);
  });
});
