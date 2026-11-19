/**
 * The front door: the landing page leads into /start, and the public pages load on their own.
 * (A returning person landing on /market is in settings.spec.ts, where one exists.)
 */
import { expect, test } from './support';

test('the landing page links into /start', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const start = page.getByRole('main').getByRole('link', { name: /Start/ }).first();
  await expect(start).toHaveAttribute('href', '/start');
  await start.click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Start your check');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('a person under 18 is stopped and nothing is saved', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await page.getByRole('radio', { name: 'No, I am under 18' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Standing is for people 18 or older');
  expect(await page.evaluate(() => window.localStorage.getItem('standing.v1.device'))).toBeNull();
});

for (const path of ['/about', '/method', '/privacy', '/terms']) {
  test(`${path} loads`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/teambayutech@gmail\.com/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
