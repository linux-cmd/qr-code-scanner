import { test, expect } from '@playwright/test';

test('renders the scanner shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Scan, check, crop, and save QR codes/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Camera/i })).toBeVisible();
  await expect(page.getByText(/AI stays off/i)).toBeVisible();
});
