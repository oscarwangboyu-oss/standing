/**
 * Friend compare: one person makes an invite link, a second browser opens it, takes the check
 * and accepts, and both see the two skylines side by side.
 */
import { expect, expectResult, helperToTheEnd, personWithCheck, secondDevice, startCheck, test } from './support';

test('an invite is created, accepted on a second device, and both see the comparison', async ({ page, browser, watch }, testInfo) => {
  test.setTimeout(120_000);
  await personWithCheck(page, { role: 'emp', ticker: 'ALFA' });

  await page.goto('/compare');
  await page.getByRole('button', { name: 'Create an invite link' }).click();
  await expect(page.getByRole('heading', { name: 'Your invite link' })).toBeVisible();
  const link = await page.getByRole('main').getByText(/\/i\/[A-Za-z0-9_-]{16,}/).first().innerText();
  // The new invite is shown once, in its own card, and not repeated in the waiting list.
  const waiting = page.getByRole('list', { name: 'Invites that were not accepted yet' });
  await expect(waiting).toHaveCount(0);
  // Back on the page later, it is listed as waiting, with a button to copy it again.
  await page.reload();
  await expect(waiting.getByRole('listitem')).toHaveCount(1);
  await expect(waiting.getByRole('button', { name: 'Copy link' })).toBeVisible();

  // The friend: another browser with nothing on it.
  const friend = await secondDevice(browser, testInfo, watch);
  await friend.page.goto(`${new URL(link).pathname}?debug=1`);
  await expect(friend.page.getByRole('heading', { level: 1 })).toHaveText('ALFA invited you to compare');
  await friend.page.getByRole('button', { name: 'Start the check' }).click();
  await friend.page.waitForURL(/\/start/);
  await startCheck(friend.page, { role: 'grad', ticker: 'BRVO', onStart: true });
  await helperToTheEnd(friend.page);
  await expectResult(friend.page);

  // The invite was kept on the friend's device and accepted when the check finished.
  await expect(friend.page.getByText('Your comparison with ALFA is ready.')).toBeVisible();
  await friend.page.getByRole('link', { name: 'Open the comparison' }).click();
  await expect(friend.page.getByRole('heading', { level: 1 })).toHaveText('Side by side');
  await expect(friend.page.getByRole('region', { name: /^BRVO, overall \d+\.\d\d/ })).toBeVisible();
  await expect(friend.page.getByRole('region', { name: /^ALFA, overall \d+\.\d\d/ })).toBeVisible();
  await expect(friend.page.getByRole('table').getByRole('row')).toHaveCount(6);

  // The person who sent the link sees the same comparison from their side.
  await page.goto('/compare');
  const row = page.getByRole('list', { name: 'Your comparisons' }).getByRole('link', { name: /^BRVO/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Side by side');
  await expect(page.getByRole('region', { name: /^ALFA, overall \d+\.\d\d/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /^BRVO, overall \d+\.\d\d/ })).toBeVisible();
  await expect(page.getByText('Solid line: ALFA. Dotted line: BRVO. The dashed ring is 100.')).toBeVisible();

  // The link works once.
  const third = await secondDevice(browser, testInfo, watch);
  await third.page.goto(new URL(link).pathname);
  await expect(third.page.getByRole('heading', { level: 1 })).toHaveText('This invite was already used');

  await friend.context.close();
  await third.context.close();
});
