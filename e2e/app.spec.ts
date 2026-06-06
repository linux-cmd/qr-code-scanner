import { test, expect } from '@playwright/test';

test('renders the scanner shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Scan, check, crop, and save QR codes/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Camera/i })).toBeVisible();
  await expect(page.getByText(/AI stays off/i)).toBeVisible();
});

test('shows original and final URLs with protocol-preserving labels', async ({ page }) => {
  await page.route('**/api/scan', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        scanId: 'scan-test',
        originalUrl: 'https://www.pret.co.uk/en-GB/pretcoffeesub?utm_source=QR',
        normalizedUrl: 'https://www.pret.co.uk/en-GB/pretcoffeesub?utm_source=QR',
        finalUrl: 'https://www.pret.co.uk/en-GB/club-pret?utm_source=QR',
        canonicalCacheKey: 'https://www.pret.co.uk/en-GB/club-pret',
        domain: 'www.pret.co.uk',
        registrableDomain: 'pret.co.uk',
        hostname: 'www.pret.co.uk',
        displayHostname: 'www.pret.co.uk',
        path: '/en-GB/club-pret',
        query: '?utm_source=QR',
        redirectChain: [
          { url: 'https://www.pret.co.uk/en-GB/pretcoffeesub?utm_source=QR', status: 302, method: 'HEAD', hostname: 'www.pret.co.uk', protocol: 'https:' },
          { url: 'https://www.pret.co.uk/en-GB/club-pret?utm_source=QR', status: 200, method: 'HEAD', hostname: 'www.pret.co.uk', protocol: 'https:' }
        ],
        riskScore: 0,
        riskLevel: 'low',
        confidence: 'low',
        confidenceWording: 'Confidence: low because external threat feeds are disabled. No obvious risk was found in local URL and redirect checks.',
        summaryLabel: 'No obvious risk detected',
        recommendedAction: 'Only open it if you trust the source of the QR code.',
        signals: [{ key: 'noObviousHeuristicRisk', label: 'No obvious risk detected from local URL checks.', severity: 'low', score: 0, category: 'metadata' }],
        threatIntel: [
          {
            source: 'external-threat-feeds',
            status: 'unavailable',
            confidence: 'low',
            rawReference: 'External threat feeds disabled: This result used local URL and redirect checks only.',
            checkedAt: new Date().toISOString(),
            ttlSeconds: 900,
            commercialUseStatus: 'disabled'
          }
        ],
        limitations: ['This scanner reduces risk but cannot guarantee that any destination is safe.'],
        checkedAt: new Date().toISOString(),
        cacheStatus: { threatIntel: 'disabled' },
        aiAvailable: true,
        deepScanAvailable: false
      })
    });
  });

  await page.goto('/');
  await page.getByLabel('URL to scan').fill('https://www.pret.co.uk/en-GB/pretcoffeesub?utm_source=QR');
  await page.getByRole('button', { name: 'Scan URL' }).click();

  const originalField = page.locator('.url-pair').filter({ hasText: 'Original QR URL:' });
  const finalField = page.locator('.url-pair').filter({ hasText: 'Final destination after redirects:' });
  await expect(originalField).toBeVisible();
  await expect(originalField.locator('code')).toHaveText('https://www.pret.co.uk/en-GB/pretcoffeesub?utm_source=QR');
  await expect(finalField).toBeVisible();
  await expect(finalField.locator('code')).toHaveText('https://www.pret.co.uk/en-GB/club-pret?utm_source=QR');
  await expect(page.getByText('Redirect chain detected')).toBeVisible();
  await expect(page.getByText('Redirects stayed within the same site.')).toBeVisible();
  await expect(page.getByText('Disabled: External threat feeds disabled: This result used local URL and redirect checks only.')).toBeVisible();
});
