/**
 * Settings: export, the recovery code on a second device, and delete. After a delete the
 * device holds nothing and /market leads to the start.
 */
import { readFile } from 'node:fs/promises';
import { expect, personWithCheck, secondDevice, test } from './support';

test('export saves a JSON file with the server rows and what is kept on the device', async ({ page }) => {
  await personWithCheck(page, { role: 'seek', ticker: 'XPRT', state: 'Georgia' });
  await page.goto('/settings');
  await expect(page.getByRole('region', { name: 'Ticker' }).getByText('XPRT')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Export my data/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^standing-export-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    user: Record<string, unknown>;
    tables: Record<string, Array<Record<string, unknown>>>;
    about: Record<string, string>;
    onThisDevice: Record<string, unknown>;
  };
  expect(Object.keys(exported.tables).length).toBeGreaterThanOrEqual(10);
  expect(exported.tables.sessions).toHaveLength(1);
  expect(exported.tables.sessions[0]).toMatchObject({ ticker: 'XPRT', us_state: 'GA' });
  expect(exported.tables.question_events.length).toBeGreaterThan(60);
  expect(exported.tables.results).toHaveLength(1);
  expect(exported.onThisDevice).toHaveProperty('payday');
  // The hashes of the device token and of the recovery code are left out.
  expect(JSON.stringify(exported)).not.toMatch(/token_hash|recovery_hash/);
});

test('a recovery code connects a second device to the same record', async ({ page, browser, watch }, testInfo) => {
  await personWithCheck(page, { role: 'care', ticker: 'RCVR' });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Show code' }).click();
  const code = (await page.getByRole('status', { name: 'Your recovery code' }).innerText()).trim();
  expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);

  // The second device starts where a new visitor does: the start screen links to the code.
  const other = await secondDevice(browser, testInfo, watch);
  await other.page.goto('/start');
  await other.page.getByRole('link', { name: 'Use your recovery code' }).click();
  await other.page.waitForURL(/\/settings\?restore=1$/);
  await expect(other.page.getByText('This device holds no record')).toBeVisible();
  // The sheet is already open.
  const sheet = other.page.getByRole('dialog', { name: 'Connect this device' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Recovery code').fill(code.toLowerCase());
  await sheet.getByRole('button', { name: 'Connect this device' }).click();
  await other.page.waitForURL(/\/market$/);
  await expect(other.page.getByRole('main').getByText('RCVR', { exact: true }).first()).toBeVisible();
  await other.context.close();
});

test('delete removes the record, and /market then leads to the start', async ({ page }) => {
  await personWithCheck(page, { role: 'oth', age: '45 or over' });

  // A returning person lands on the market, from the front page too.
  await page.goto('/');
  await expect(page).toHaveURL(/\/market$/);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  const token = await page.evaluate(() => JSON.parse(window.localStorage.getItem('standing.v1.device') ?? '{}').deviceToken as string);
  expect(token).toBeTruthy();

  await page.getByRole('button', { name: /^Delete my data/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete my data' });
  const confirm = sheet.getByRole('button', { name: 'Delete everything' });
  await expect(confirm).toBeDisabled();
  await sheet.getByRole('checkbox', { name: 'I understand that this cannot be undone.' }).check();
  await confirm.click();
  await expect(page).toHaveURL(/\/$/);

  // Nothing is left on the device, and the server no longer knows the token.
  expect(await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('standing.')))).toEqual([]);
  const me = await page.request.get('/api/me', { headers: { authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(401);

  await page.goto('/market');
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Start your check');
});
