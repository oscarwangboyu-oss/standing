/**
 * The result screen: every section is on it, nothing is fetched from another origin (the
 * `watch` fixture), and the share sheet makes the 1080 by 1350 image.
 */
import { readFile } from 'node:fs/promises';
import { expect, personWithCheck, test } from './support';

test('the result shows every section', async ({ page }) => {
  await personWithCheck(page, { role: 'emp', ticker: 'RSLT' });
  const main = page.getByRole('main');

  // Head and key figures.
  await expect(main.getByText('RSLT', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Overall\s*\d+\.\d\d/);
  await expect(main.getByText('First record, no change yet')).toBeVisible();
  for (const term of ['Issue price', 'All-time high', 'All-time low', 'Data grade']) {
    await expect(main.getByText(term, { exact: true })).toBeVisible();
  }

  // Price history and the market comment.
  const history = page.getByRole('region', { name: 'Price history' });
  await expect(history.getByRole('img', { name: /Overall price over 1 record/ })).toBeVisible();
  await expect(history.getByText(/leads at|within \d+ points of each other|has a price/)).toBeVisible();

  // Sectors.
  const board = page.getByRole('list', { name: 'Sector prices' });
  for (const code of ['SKIL', 'WLTH', 'NETW', 'BODY', 'MIND']) {
    await expect(board.getByRole('button', { name: new RegExp(`^${code} `) })).toBeVisible();
  }

  // Shape: the type (or the sentence that says why there is none) and the pentagon.
  const shape = page.getByRole('region', { name: 'Your shape' });
  await expect(shape.getByText(/Your type|there is no type this time|It needs two priced sectors/)).toBeVisible();
  await expect(shape.getByRole('img', { name: /Pentagon chart of five sector prices/ })).toBeVisible();

  // Position, contrasts, checks.
  const position = page.getByRole('region', { name: 'Position' });
  await expect(position.getByRole('img', { name: /A ladder of 10 rungs/ })).toBeVisible();
  await expect(position.getByText('The gap')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contrasts', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Consistency checks' })).toBeVisible();
  await expect(main.getByText(/Data grade [ABC], \d+ points?\./)).toBeVisible();

  // The baseline statement, the actions, the footer statements.
  await expect(main.getByText('The baseline is provisional')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share my skyline' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compare with a friend' })).toBeVisible();
  await expect(page.getByText(/not a medical diagnosis, not financial advice and not a credit score/)).toBeVisible();
  expect(await page.getByRole('group', { name: 'Was this part useful?' }).count()).toBeGreaterThanOrEqual(6);

  // "Why it moved" opens from a sector and says this is the first record.
  await board.getByRole('button', { name: /^SKIL / }).click();
  const why = page.getByRole('dialog');
  await expect(why.getByText(/This is your first record/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(why).toBeHidden();

  // The answer to "Was this part useful?" is taken.
  await page.getByRole('group', { name: 'Was this part useful?' }).first().getByRole('button', { name: 'Yes' }).click();

  // No sideways scroll at this width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('share makes a 1080 by 1350 PNG', async ({ page }) => {
  await personWithCheck(page, { role: 'owner', ticker: 'SHRE' });
  await page.getByRole('button', { name: 'Share my skyline' }).click();
  const sheet = page.getByRole('dialog', { name: 'Share your skyline' });
  await expect(sheet).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: 'Save image' }).click()]);
  expect(download.suggestedFilename()).toBe('standing-shre.png');
  const path = await download.path();
  const file = await readFile(path);
  // PNG signature, then the IHDR chunk with width and height.
  expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(file.readUInt32BE(16)).toBe(1080);
  expect(file.readUInt32BE(20)).toBe(1350);
  expect(file.length).toBeGreaterThan(20_000);
  await expect(sheet.getByText('Image saved')).toBeVisible();
});
