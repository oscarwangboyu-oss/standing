/**
 * The result screen: every section is on it, nothing is fetched from another origin (the
 * `watch` fixture), and the share sheet makes the image as a story (1080 by 1920) and as a
 * post (1080 by 1350).
 */
import { readFile } from 'node:fs/promises';
import { expect, expectResult, personWithCheck, startCheck, tapToTheEnd, test } from './support';

test('the result shows every section', async ({ page }) => {
  test.setTimeout(120_000);
  // Every question is answered by a tap, so every section has something to show. Both mood
  // questions get "Nearly every day", which is what the mind notice is for, and the taps come
  // faster than a question can be read, which is what the timing note is for.
  await startCheck(page, { role: 'emp', ticker: 'RSLT' });
  await tapToTheEnd(page, (q) => {
    const mood = q.options.findIndex((option) => /nearly every day/i.test(option));
    return mood >= 0 ? mood : q.current * 3;
  });
  await expectResult(page);
  const main = page.getByRole('main');

  // The mind notice comes first, with the number to call. MIND is not tagged as the laggard
  // and the market comment does not say it trails.
  const notice = page.getByRole('note').filter({ hasText: 'A note about mood' });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('link', { name: '988' })).toHaveAttribute('href', 'tel:988');
  const noticeBox = await notice.boundingBox();
  const priceBox = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(noticeBox && priceBox && noticeBox.y + noticeBox.height <= priceBox.y).toBe(true);
  await expect(page.getByRole('list', { name: 'Sector prices' }).getByRole('listitem').filter({ hasText: 'MIND' })).not.toContainText('Laggard');
  await expect(main).not.toContainText('MIND is the laggard');

  // The timing note.
  await expect(main.getByRole('note').filter({ hasText: 'Answer timing' })).toContainText(/answers? came faster than the question could be read/);

  // Head and key figures.
  await expect(main.getByText('RSLT', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Overall\s*\d+\.\d\d/);
  await expect(main.getByText('First record, no change yet')).toBeVisible();
  // On a first record the high and the low would repeat the price, so the strip shows how many sectors are listed instead.
  for (const term of ['Issue price', 'Sectors listed', 'Data grade']) {
    await expect(main.getByText(term, { exact: true })).toBeVisible();
  }
  await expect(main.getByText('All-time high', { exact: true })).toHaveCount(0);

  // Price history and the market comment. One record has no line: the ruler shows the price on the whole scale.
  const history = page.getByRole('region', { name: 'Price history' });
  await expect(history.getByRole('img', { name: /^Scale from 55 to 145\. This price is \d+\.\d\d\./ })).toBeVisible();
  await expect(history.getByText('One record so far. The line starts with your next record.')).toBeVisible();
  await expect(history.getByText(/leads at|within \d+ points of each other|has a price/)).toBeVisible();

  // Sectors.
  const board = page.getByRole('list', { name: 'Sector prices' });
  for (const code of ['SKIL', 'WLTH', 'NETW', 'BODY', 'MIND']) {
    await expect(board.getByRole('button', { name: new RegExp(`^${code} `) })).toBeVisible();
  }
  // Every position bar spans the same width, so the 100 tick of each row lines up with the scale under the board.
  const barWidths = await board.getByRole('listitem').evaluateAll((rows) =>
    rows.map((row) => Math.round((row.children[1]?.firstElementChild as HTMLElement | null)?.getBoundingClientRect().width ?? -1)),
  );
  expect(barWidths.length).toBe(5);
  expect(new Set(barWidths).size).toBe(1);

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
  // The way on to the market, where the prices continue day by day.
  await expect(main.getByRole('link', { name: /^Your market/ })).toHaveAttribute('href', '/market');
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

test('share makes a story PNG by default and a post PNG on request', async ({ page }) => {
  await personWithCheck(page, { role: 'owner', ticker: 'SHRE' });
  await page.getByRole('button', { name: 'Share my skyline' }).click();
  const sheet = page.getByRole('dialog', { name: 'Share your skyline' });
  await expect(sheet).toBeVisible();
  const shape = sheet.getByRole('radiogroup', { name: 'Image shape' });
  await expect(shape.getByRole('radio', { name: /Story/ })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.getByText(/1080 by 1920 pixels, PNG\./)).toBeVisible();

  const save = async (width: number, height: number) => {
    const [download] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: 'Save image' }).click()]);
    expect(download.suggestedFilename()).toBe('standing-shre.png');
    const file = await readFile(await download.path());
    // PNG signature, then the IHDR chunk with width and height.
    expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(file.readUInt32BE(16)).toBe(width);
    expect(file.readUInt32BE(20)).toBe(height);
    expect(file.length).toBeGreaterThan(20_000);
    await expect(sheet.getByText('Image saved')).toBeVisible();
  };
  await save(1080, 1920);

  await shape.getByRole('radio', { name: /Post/ }).click();
  await expect(shape.getByRole('radio', { name: /Post/ })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.getByText(/1080 by 1350 pixels, PNG\./)).toBeVisible();
  await expect(sheet.getByRole('img', { name: /Share image for SHRE/ })).toHaveAttribute('viewBox', '0 0 1080 1350');
  await save(1080, 1350);
});
