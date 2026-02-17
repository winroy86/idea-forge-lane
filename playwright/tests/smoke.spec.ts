import { test, expect } from '@playwright/test';
import { TID } from '../../src/testIds';

test('navigation tabs are visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId(TID.navDashboard)).toBeVisible();
  await expect(page.getByTestId(TID.navAgents)).toBeVisible();
  await expect(page.getByTestId(TID.navSkills)).toBeVisible();
  await expect(page.getByTestId(TID.navProviders)).toBeVisible();
  await expect(page.getByTestId(TID.navSettings)).toBeVisible();
});

test('can open create-room dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId(TID.roomCreateBtn).click();
  await expect(page.getByTestId(TID.roomNameInput)).toBeVisible();
  await expect(page.getByTestId(TID.roomCreateConfirm)).toBeVisible();
});
