/**
 * The check, from /start to /result, for each of the 11 situations. Every check uses a skip
 * and a "Not applicable". Two situations are answered by taps to the last question; the others
 * are finished by the developer panel, which answers randomly.
 */
import { ROLES, answer, expect, expectResult, helperToTheEnd, questionOnScreen, startCheck, tapToTheEnd, test, type RoleId } from './support';

/** Answered by taps from the first question to the last. */
const BY_TAPS: readonly RoleId[] = ['emp', 'ug4'];
const AGES = ['18 to 20', '21 to 24', '25 to 29', '30 to 34', '35 to 44', '45 or over'];

test.describe('a full check for each situation', () => {
  ROLES.forEach((role, index) => {
    const byTaps = BY_TAPS.includes(role.id);
    test(`${role.id}: ${byTaps ? 'by taps' : 'with the helper'}`, async ({ page }) => {
      test.setTimeout(120_000);
      const age = AGES[index % AGES.length];
      await startCheck(page, { role: role.id, age, ticker: `T${role.id.toUpperCase()}`.slice(0, 6) });

      const first = await questionOnScreen(page);
      expect(first.current).toBe(1);
      // Five sectors: 31 to 34 questions, depending on the situation.
      expect(first.total).toBeGreaterThanOrEqual(31);
      expect(first.total).toBeLessThanOrEqual(34);

      await answer(page, 1);
      await answer(page, 'skip');
      await answer(page, 'na');
      expect((await questionOnScreen(page)).current).toBe(4);

      if (byTaps) {
        // One more skip and one more "Not applicable" further in, the rest by option.
        const asked = await tapToTheEnd(page, (q) => (q.current === 12 ? 'skip' : q.current === 20 ? 'na' : q.current * 3));
        expect(asked.length).toBeGreaterThanOrEqual(first.total - 6);
      } else {
        await helperToTheEnd(page);
      }

      await expectResult(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Overall\s*\d+\.\d\d/);
      await expect(page.getByText(`Ages ${age}, ${role.short}`)).toBeVisible();
      await expect(page.getByRole('list', { name: 'Sector prices' }).getByRole('listitem')).toHaveCount(5);
    });
  });
});

test('leaving in the middle resumes at the same question', async ({ page, context }) => {
  await startCheck(page, { role: 'gig' });
  await answer(page, 2);
  await answer(page, 'skip');
  await answer(page, 0);
  await answer(page, 3);
  const left = await questionOnScreen(page);
  expect(left.current).toBe(5);

  // Leave by the close control: the front page, which never traps a person in the check.
  await page.getByRole('button', { name: 'Leave the check' }).click();
  await expect(page).toHaveURL(/\/$/);

  // The start screen sends an unfinished check back to its question.
  await page.goto('/start');
  await expect(page).toHaveURL(/\/check$/);
  expect(await questionOnScreen(page)).toEqual(left);

  // A reload, and a new tab of the same browser.
  await page.reload();
  expect(await questionOnScreen(page)).toEqual(left);
  const tab = await context.newPage();
  await tab.goto('/check');
  expect(await questionOnScreen(tab)).toEqual(left);
  await tab.close();

  // The check goes on from there.
  await answer(page, 1);
  expect((await questionOnScreen(page)).current).toBe(6);
});

test('without the Body and Mind consent the check has three sectors and two are not listed', async ({ page }) => {
  test.setTimeout(120_000);
  await startCheck(page, { role: 'free', health: false });
  const first = await questionOnScreen(page);
  // Capability, Wealth, Network and the closing question: no Body and Mind questions.
  expect(first.total).toBeLessThanOrEqual(24);
  expect(first.total).toBeGreaterThanOrEqual(20);

  // By taps, so the three sectors are priced the same way on every run: one skip in
  // Capability, one "Not applicable" in Wealth, an option everywhere else.
  const asked = await tapToTheEnd(page, (q) => (q.current === 2 ? 'skip' : q.current === 9 ? 'na' : q.current * 3));
  expect(asked).toHaveLength(first.total);
  await expectResult(page);

  const board = page.getByRole('list', { name: 'Sector prices' });
  await expect(board.getByRole('listitem')).toHaveCount(5);
  await expect(board.getByText('Not listed')).toHaveCount(2);
  await expect(board.getByRole('listitem').filter({ hasText: 'BODY' })).toContainText('Not listed');
  await expect(board.getByRole('listitem').filter({ hasText: 'MIND' })).toContainText('Not listed');
  for (const code of ['SKIL', 'WLTH', 'NETW']) {
    await expect(board.getByRole('listitem').filter({ hasText: code })).toContainText(/\d+\.\d\d/);
  }
  await expect(page.getByText('BODY and MIND are not listed: you did not agree to share body and mind answers.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Overall\s*\d+\.\d\d/);

  // The market home says the same, and a sector without a price is not a button.
  await page.goto('/market');
  const marketBoard = page.getByRole('list', { name: /^Sector prices/ });
  await expect(marketBoard.getByText('Not listed')).toHaveCount(2);
  await expect(marketBoard.getByRole('button')).toHaveCount(3);

  // The Daily Open stays closed without that consent.
  await page.goto('/open');
  await expect(page.getByText('Daily Open needs your consent for Body and Mind')).toBeVisible();
});
