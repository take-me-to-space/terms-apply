import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
test.skip(
  !process.env.TEST_LOCAL_SUPABASE,
  'Requires real local Supabase auth/database/mail service. Run npm run test:services.',
);

const captured = new Set<string>();
async function captureResponsive(page: Page, name: string) {
  if (!process.env.CAPTURE_DESIGN || captured.has(name)) return;
  captured.add(name);
  await page.locator('main h1').first().waitFor({ state: 'visible' });
  await page.locator('.loading').waitFor({ state: 'hidden' });
  const original = page.viewportSize();
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${name}/${device} must fit the viewport`,
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations, `${name}/${device} accessibility`).toEqual(
      [],
    );
    await page.screenshot({
      path: test.info().outputPath(`${name}-${device}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${name}/320px must fit the viewport`,
  ).toBe(true);
  if (original) await page.setViewportSize(original);
}

async function emailLink(
  request: APIRequestContext,
  email: string,
  subject: RegExp,
) {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(
          'http://127.0.0.1:54324/api/v1/messages',
        );
        const data = await response.json();
        id = data.messages?.find(
          (m: { ID: string; Subject: string; To: { Address: string }[] }) =>
            m.To.some((to) => to.Address === email) && subject.test(m.Subject),
        )?.ID;
        return Boolean(id);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const detail = await (
    await request.get(`http://127.0.0.1:54324/api/v1/message/${id}`)
  ).json();
  const link = String(detail.HTML)
    .match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/)?.[1]
    ?.replaceAll('&amp;', '&');
  if (!link) throw new Error('Auth service email had no verification link');
  return link;
}
async function makeAgreement(page: Page) {
  await page.goto('/new');
  await page.getByRole('button', { name: 'Use the walking example' }).click();
  await captureResponsive(page, 'composer');
  await page.getByRole('button', { name: 'Review terms' }).click();
  await captureResponsive(page, 'review');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm commitment' }).click();
  await expect(page).toHaveURL(/\/commitments\/[\w-]+$/);
  return page.url().split('/').pop()!;
}
test('real signup email, confirmation, persistence, isolation, check-ins, recovery, and deletion', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240_000);
  const email = `terms-${randomUUID()}@example.com`;
  const password = `Local-test-${randomUUID()}!`;
  const admin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  let userId: string | undefined;
  let otherId: string | undefined;
  try {
    await page.goto('/');
    await captureResponsive(page, 'landing');
    await page.goto('/auth?mode=signup');
    await captureResponsive(page, 'signup');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Check your email');
    const link = await emailLink(request, email, /confirm/i);
    await page.goto(link);
    await expect(page).toHaveURL(/\/app$/);
    await captureResponsive(page, 'dashboard-empty');
    const users = await admin.auth.admin.listUsers();
    userId = users.data.users.find((u) => u.email === email)?.id;
    expect(userId).toBeTruthy();
    const id = await makeAgreement(page);
    await page.reload();
    await captureResponsive(page, 'active-detail');
    await expect(
      page.getByRole('heading', { name: 'Walk for 30 minutes', exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath('detail-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath('detail-mobile.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'I’ve completed it' }).click();
    await captureResponsive(page, 'goal-checkin');
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Save report' }).click();
    await expect(page.locator('.badge')).toContainText('Completed on time');
    await expect(
      page.getByRole('heading', { name: 'Completed on time', level: 2 }),
    ).toBeVisible();

    await captureResponsive(page, 'completed-detail');

    // A new browser has no shared storage: signed-in records persist across devices.
    const context = await browser.newContext();
    const otherPage = await context.newPage();
    await otherPage.goto('http://127.0.0.1:5174/auth');
    await otherPage.getByLabel('Email address').fill(email);
    await otherPage.getByLabel('Password', { exact: true }).fill(password);
    await otherPage
      .getByRole('button', { name: 'Sign in', exact: true })
      .click();
    await expect(otherPage).toHaveURL(/\/app$/);
    await otherPage.getByRole('button', { name: 'History' }).click();
    await expect(
      otherPage.getByRole('heading', { name: 'Walk for 30 minutes' }),
    ).toBeVisible();
    await captureResponsive(otherPage, 'dashboard-history');
    await context.close();

    const otherEmail = `terms-${randomUUID()}@example.com`;
    const created = await admin.auth.admin.createUser({
      email: otherEmail,
      password,
      email_confirm: true,
    });
    otherId = created.data.user?.id;
    const other = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const signIn = await other.auth.signInWithPassword({
      email: otherEmail,
      password,
    });
    expect(signIn.error).toBeNull();
    expect(
      (await other.from('commitments').select('*').eq('id', id)).data,
    ).toEqual([]);
    expect(
      (await other.rpc('withdraw_commitment', { p_commitment_id: id })).error,
    ).toBeTruthy();

    const withdrawnId = await makeAgreement(page);
    await page
      .getByRole('button', { name: 'Withdraw this commitment' })
      .click();
    await captureResponsive(page, 'withdrawal');
    await page.getByLabel('Reason (optional)').fill('Plans changed.');
    await page.getByRole('button', { name: 'Withdraw commitment' }).click();
    await expect(page.locator('.badge')).toContainText('Withdrawn');
    expect(
      (
        await admin
          .from('commitments')
          .select('goal')
          .eq('id', withdrawnId)
          .single()
      ).data?.goal,
    ).toBe('Walk for 30 minutes');

    // Backdate only this local fixture to exercise the complete late/pledge flow without a two-day wait.
    const lateId = await makeAgreement(page);
    const sql = `update public.commitments set created_at=now()-interval '3 days', confirmed_at=now()-interval '3 days', deadline_at=now()-interval '2 days', pledge_check_at=now()-interval '1 day' where id='${lateId}'::uuid`;
    execFileSync(
      'docker',
      [
        'exec',
        'supabase_db_terms-apply',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        sql,
      ],
      { stdio: 'pipe' },
    );
    await page.reload();
    await captureResponsive(page, 'active-detail');
    await page.getByRole('button', { name: 'Report the outcome' }).click();
    await page.getByRole('button', { name: 'Save report' }).click();
    await expect(page.locator('.badge')).toContainText('Completed late');
    await captureResponsive(page, 'late-detail');
    await page.getByRole('button', { name: 'Report on my pledge' }).click();
    await captureResponsive(page, 'pledge-checkin');
    await page.getByRole('button', { name: 'Save report' }).click();
    await expect(page.locator('.history')).toContainText('Pledge: not yet');
    execFileSync(
      'docker',
      [
        'exec',
        'supabase_db_terms-apply',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        `update public.pledge_reports set reported_at=now()-interval '2 minutes' where commitment_id='${lateId}'::uuid`,
      ],
      { stdio: 'pipe' },
    );
    await page.getByRole('button', { name: 'Report on my pledge' }).click();
    await captureResponsive(page, 'pledge-checkin');
    await page.getByRole('radio', { name: 'Honoured', exact: true }).check();
    await page.getByRole('button', { name: 'Save report' }).click();
    await expect(page.locator('.badge')).toContainText('Pledge honoured');
    await expect(page.locator('.history')).toContainText('Pledge: not yet');

    await page.goto('/settings');
    await captureResponsive(page, 'settings');
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download my record' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('terms-apply-record.json');
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(
      JSON.parse(Buffer.concat(chunks).toString()).commitments,
    ).toHaveLength(3);
    await page.getByRole('switch', { name: 'Email reminders' }).click();
    await expect(page.getByRole('switch')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('switch').click();
    await expect(page.getByRole('switch')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:5174/');
    await page.goto('/auth');
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await captureResponsive(page, 'recovery');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText(
      'If an account uses that email',
    );
    const recovery = await emailLink(request, email, /reset/i);
    await page.goto(recovery);
    await expect(
      page.getByLabel('New password', { exact: true }),
    ).toBeVisible();
    await captureResponsive(page, 'reset-password');
    const nextPassword = `New-local-${randomUUID()}!`;
    await page.getByLabel('New password', { exact: true }).fill(nextPassword);
    await page.getByLabel('Repeat new password').fill(nextPassword);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByRole('status')).toContainText('Password updated');
    await page.goto('/settings');
    await captureResponsive(page, 'settings');
    await page
      .getByRole('button', { name: 'Delete my account', exact: true })
      .click();
    await captureResponsive(page, 'deletion');
    await page.getByLabel('Your password').fill(nextPassword);
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page
      .getByRole('button', { name: 'Permanently delete my account' })
      .click();
    await expect(page).toHaveURL('http://127.0.0.1:5174/');
    expect(
      (await admin.from('commitments').select('*').eq('user_id', userId!)).data,
    ).toEqual([]);
    expect((await admin.auth.admin.getUserById(userId!)).error).toBeTruthy();
    userId = undefined;
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (otherId) await admin.auth.admin.deleteUser(otherId);
  }
});
