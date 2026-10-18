import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('public journey writes, reviews, edits, and retains an unsigned agreement through sign-up', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Put a date on it.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Make a commitment' }).click();
  await page.getByRole('button', { name: 'Review terms' }).click();
  await expect(
    page.getByText('Give your goal a little more detail.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use the walking example' }).click();
  await page.getByRole('button', { name: 'Review terms' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review your terms' }),
  ).toBeVisible();
  await expect(page.locator('.agreement-sheet')).toContainText(
    'Give up Netflix for the next two evenings.',
  );
  await page.getByRole('button', { name: 'Edit terms' }).click();
  await page.getByLabel('What will you do?').fill('Finish the first chapter');
  await page.getByRole('button', { name: 'Review terms' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('link', { name: 'Create account to confirm' }).click();
  await expect(
    page.getByRole('heading', { name: 'Create an account' }),
  ).toBeVisible();
  await page.goto('/new');
  await expect(page.getByLabel('What will you do?')).toHaveValue(
    'Finish the first chapter',
  );
});
test('sign-in, sign-up and recovery controls are accessible and do not fake a backend', async ({
  page,
}) => {
  await page.goto('/auth');
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await expect(
    page.getByRole('heading', { name: 'Reset your password' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'minlength',
    '12',
  );
});
test('private pages require a session and recovery needs a valid link', async ({
  page,
}) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto('/commitments/11111111-1111-4111-8111-111111111111');
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto('/reset-password');
  await expect(page.getByText('This recovery link has expired')).toBeVisible();
});
test('landing, composer and account screens fit a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    '/',
    '/new',
    '/auth',
    '/reset-password',
    '/privacy',
    '/missing-page',
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
test('public pages have no serious accessibility violations', async ({
  page,
}) => {
  for (const path of ['/', '/new', '/auth', '/privacy']) {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
