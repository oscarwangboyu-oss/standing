/**
 * The team dashboard: closed to a wrong passphrase, and with the right one the gates between
 * stages next to the actual numbers.
 */
import { E2E_TEAM_PASSPHRASE } from '../../playwright.config';
import { expect, personWithCheck, test } from './support';

test('/team rejects a wrong passphrase and shows the gates with the right one', async ({ page, watch }) => {
  // The dashboard has something to count.
  await personWithCheck(page, { role: 'emp' });

  // The browser logs the 401 of the wrong passphrase. Nothing else may be logged.
  watch.allow(/status of 401/);
  await page.goto('/team');
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.getByLabel('Team passphrase').fill('not-the-passphrase');
  await page.getByRole('button', { name: 'Open the dashboard' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'That passphrase is not right.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Stage gates' })).toHaveCount(0);

  await page.getByLabel('Team passphrase').fill(E2E_TEAM_PASSPHRASE);
  await page.getByRole('button', { name: 'Open the dashboard' }).click();
  const gates = page.getByRole('region', { name: 'Stage gates' });
  await expect(gates).toBeVisible();
  for (const gate of ['Finish rate', 'Highest skip rate of one question', 'Retest correlation', 'Back on day 7', 'Back on day 30', 'Payday Check share']) {
    await expect(gates.getByRole('heading', { name: gate })).toBeVisible();
  }
  await expect(gates.getByText('70% or more', { exact: true })).toBeVisible();
  await expect(gates.getByText('10% or less', { exact: true })).toBeVisible();
  await expect(gates.getByText('0.75 or more', { exact: true })).toBeVisible();
  await expect(gates.getByText('25% or more', { exact: true })).toBeVisible();
  await expect(gates.getByText('12% or more', { exact: true })).toBeVisible();
  // Every gate carries a verdict in words.
  expect(await gates.getByText(/^(Met|Not met|No data yet)$/).count()).toBe(6);
  // At least one real person has finished a check by now.
  await expect(gates.getByRole('listitem').filter({ hasText: 'Finish rate' }).getByText(/\d+ of \d+/)).toBeVisible();

  // The other sections are there, and no data is marked as simulated in this database.
  for (const section of ['Overview', 'Questions', 'Prices', 'Norms', 'Returns', 'Micro apps', 'Scoring tests', 'Result page']) {
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: section, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Simulated data')).toHaveCount(0);

  // Lock closes it again.
  await page.getByRole('button', { name: 'Lock' }).click();
  await expect(page.getByLabel('Team passphrase')).toBeVisible();

  // The API itself refuses a call without the passphrase.
  const direct = await page.request.get('/api/team/gates');
  expect(direct.status()).toBe(401);
});
