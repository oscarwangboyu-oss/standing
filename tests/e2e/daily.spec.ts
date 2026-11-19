/**
 * The four micro apps. Daily Open records and moves the price by at most the daily limit;
 * Payday Check sends bands and no amount; Weekly Win and People Nudge record and keep the
 * title and the names on the device.
 */
import type { Page, Request } from '@playwright/test';
import { deviceToken, expect, personWithCheck, test, utcDay } from './support';

/** The daily limit of algorithm 1 (src/engine/config.ts, live.dailyMoveLimit). */
const LIMIT = 2;

async function threeTaps(page: Page, sleep: string, exercise: string, state: string): Promise<void> {
  await page.getByRole('radio', { name: sleep, exact: true }).click();
  await page.getByRole('radio', { name: exercise, exact: true }).click();
  await page.getByRole('radio', { name: state, exact: true }).click();
}

/** The streak count: a figure and its words, in one paragraph. */
const streak = (page: Page) => page.getByRole('paragraph').filter({ hasText: /days? in a row$/ });

const posts = (page: Page, path: string): Request[] => {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === path) seen.push(request);
  });
  return seen;
};

test.describe('Daily Open', () => {
  // The server counts days in UTC. The device does too, so "today" means the same on both.
  test.use({ timezoneId: 'UTC' });

  test('records the day, and the price moves by at most 2 points a day', async ({ page }) => {
    test.setTimeout(120_000);
    await personWithCheck(page, { role: 'emp' });
    const sent = posts(page, '/api/daily');

    // Today.
    await page.goto('/open');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Daily Open');
    await threeTaps(page, 'Under 5 hours', 'None', 'Bad');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Today's open");
    await expect(streak(page)).toHaveText(/^1\s*day in a row$/);
    expect(sent).toHaveLength(1);
    expect(sent[0].postDataJSON()).toEqual({ localDate: utcDay(), day: utcDay(), sleep: 0, exercise: 0, state: 1 });
    // One day of records does not replace a check answer: the price stands.
    await expect(page.getByRole('list', { name: 'Body and Mind prices' }).getByText('No move today.')).toHaveCount(2);

    // Yesterday can be filled in today.
    await page.getByRole('button', { name: 'Fill in yesterday' }).click();
    await threeTaps(page, 'Under 5 hours', 'None', 'Bad');
    await expect(streak(page)).toHaveText(/^2\s*days in a row$/);
    expect(sent[1].postDataJSON()).toMatchObject({ localDate: utcDay(), day: utcDay(-1) });

    // A second entry for a day is not stored: the first one stands.
    const token = await deviceToken(page);
    const headers = { authorization: `Bearer ${token}` };
    const again = await page.request.post('/api/daily', { headers, data: { localDate: utcDay(), day: utcDay(), sleep: 4, exercise: 4, state: 4 } });
    expect(again.status()).toBe(200);
    expect((await again.json()).stored).toBe(false);

    // Daily records count once 4 of the last 7 days have one. The screen reaches today and
    // yesterday, so the day before yesterday is entered the way yesterday's device would have
    // sent it, and the fourth day is entered on the screen with the device clock one day on.
    const earlier = await page.request.post('/api/daily', {
      headers,
      data: { localDate: utcDay(-1), day: utcDay(-2), sleep: 0, exercise: 0, state: 1 },
    });
    expect(earlier.status()).toBe(201);

    const before = (await (await page.request.get(`/api/me?today=${utcDay()}`, { headers })).json()).live;
    await page.clock.setFixedTime(new Date(`${utcDay(1)}T12:00:00Z`));
    await page.goto('/open');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Daily Open');
    const [response] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === '/api/daily' && r.request().method() === 'POST'),
      threeTaps(page, 'Under 5 hours', 'None', 'Bad'),
    ]);
    expect(response.status()).toBe(201);
    const { live } = await response.json();
    expect(live.today).toBe(utcDay(1));
    expect(live.moveLimit).toBe(LIMIT);

    // Every sector moved by at most the limit, and the daily records moved Body or Mind.
    for (const area of ['C', 'W', 'N', 'B', 'M']) {
      const change = live.sectors[area].change as number | null;
      if (change !== null) expect(Math.abs(change), `change of ${area}`).toBeLessThanOrEqual(LIMIT + 1e-9);
    }
    const body = live.sectors.B.change as number;
    const mind = live.sectors.M.change as number;
    expect(Math.abs(body) + Math.abs(mind)).toBeGreaterThan(0);
    for (const area of ['B', 'M'] as const) {
      const moved = live.sectors[area].price - before.sectors[area].price;
      expect(Math.abs(moved), `price of ${area} against the day before`).toBeLessThanOrEqual(LIMIT + 1e-9);
    }
    expect(live.overall.price).not.toBe(before.overall.price);

    // The screen says the same: a change pill on the rows that moved, and the rule.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Today's open");
    const board = page.getByRole('list', { name: 'Body and Mind prices' });
    await expect(board).toContainText(/(up|down)\s*[+−-]\d+\.\d\d/);
    const shown = (await board.innerText()).match(/[+−-]\d+\.\d\d/g) ?? [];
    expect(shown.length).toBeGreaterThan(0);
    for (const figure of shown) expect(Math.abs(Number(figure.replace('−', '-')))).toBeLessThanOrEqual(LIMIT);
    await expect(page.getByText(/Prices move at most 2 points a day/)).toBeVisible();
    await expect(streak(page)).toHaveText(/^4\s*days in a row$/);

    // The market home shows the move too.
    await page.goto('/market');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Overall\s*\d+\.\d\d/);
    await expect(page.getByText('since yesterday').first()).toBeVisible();
  });
});

test('Payday Check posts bands and no amount', async ({ page }) => {
  await personWithCheck(page, { role: 'emp' });
  const sent = posts(page, '/api/payday');

  await page.goto('/log/payday');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Payday Check');
  await page.getByRole('radio', { name: 'Every two weeks' }).click();
  await page.getByLabel('Essential spending in a month').fill('2468');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Take-home income this pay period').fill('2317');
  await page.getByLabel('Spending this pay period').fill('1583');
  await page.getByLabel('Saved or invested this pay period').fill('419');
  await page.getByRole('button', { name: 'Save this payday' }).click();
  await expect(page.getByRole('heading', { name: 'Payday recorded' })).toBeVisible();

  // The request: the six allowed fields, small whole numbers, and none of the typed amounts.
  expect(sent).toHaveLength(1);
  const raw = sent[0].postData() ?? '';
  const body = sent[0].postDataJSON() as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(['baselineDay', 'id', 'localDate', 'periods', 'runway', 'saveShare']);
  for (const amount of ['2468', '2317', '1583', '419']) expect(raw).not.toContain(amount);
  expect(raw).not.toMatch(/income|spending|savings|essential|amount/i);
  expect(body.periods).toBe(1);
  for (const field of ['saveShare', 'runway'] as const) {
    const value = body[field];
    if (value !== null) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value as number).toBeGreaterThanOrEqual(0);
      expect(value as number).toBeLessThanOrEqual(6);
    }
  }
  expect(body.saveShare).not.toBeNull();

  // The screen says what was sent, and keeps the amounts on the device.
  await expect(page.getByText('No amount was sent.')).toBeVisible();
  await expect(page.getByText('In $2,317, out $1,583, saved $419')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Payday recorded' }).or(page.getByRole('list', { name: 'Wealth now' })).getByRole('listitem')).toHaveCount(1);

  // The server refuses a request that carries an amount.
  const token = await deviceToken(page);
  const refused = await page.request.post('/api/payday', {
    headers: { authorization: `Bearer ${token}` },
    data: { ...body, id: 'e2e-amount-refused-0001', income: 2317 },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error.code).toBe('amounts_not_accepted');

  // The log shows it as done.
  await page.goto('/log');
  await expect(page.getByRole('link', { name: /^Payday Check.*Done today/ })).toBeVisible();
});

test('Weekly Win records and the title stays on the device', async ({ page }) => {
  await personWithCheck(page, { role: 'cc' });
  const sent = posts(page, '/api/weekly-wins');

  await page.goto('/log/win');
  await page.getByRole('radio', { name: /^A course or training/ }).click();
  await page.getByRole('radio', { name: '5 to 9 hours' }).click();
  await page.getByLabel('A name for it (optional)').fill('Welding night class');
  await page.getByRole('button', { name: 'Log this win' }).click();

  await expect(page.getByText('Logged this week').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welding night class' })).toBeVisible();
  await expect(page.getByText('A course, 5 to 9 hours.')).toBeVisible();
  await expect(page.getByText('The name was not sent.')).toBeVisible();

  expect(sent).toHaveLength(1);
  expect(sent[0].postData() ?? '').not.toContain('Welding');
  const body = sent[0].postDataJSON() as Record<string, unknown>;
  expect(body).toMatchObject({ kind: 'course', hours: 2 });
  expect(Object.keys(body).sort()).toEqual(['hours', 'id', 'kind', 'localDate']);

  await page.goto('/log');
  await expect(page.getByRole('link', { name: /^Weekly Win.*Done this week/ })).toBeVisible();
});

test('People Nudge records counts and the names stay on the device', async ({ page }) => {
  await personWithCheck(page, { role: 'ret' });
  const sent = posts(page, '/api/people-nudges');

  await page.goto('/log/people');
  await page.getByLabel('Person 1').fill('Marisol Quint');
  await page.getByRole('radiogroup', { name: 'Who they are to you' }).nth(0).getByRole('radio', { name: 'Friend' }).click();
  await page.getByLabel('Person 2').fill('Uncle Teodor');
  await page.getByRole('radiogroup', { name: 'Who they are to you' }).nth(1).getByRole('radio', { name: 'Family' }).click();
  await page.getByRole('button', { name: 'Keep these for the week' }).click();
  // Picking people sends nothing.
  await expect(page.getByRole('heading', { name: 'Who did you reach?' })).toBeVisible();
  expect(sent).toHaveLength(0);

  await page.getByRole('checkbox', { name: 'Mark Marisol Quint as reached' }).check();
  await page.getByRole('button', { name: "Save this week's log" }).click();
  await expect(page.getByRole('heading', { name: '1 of 2 reached this week.' })).toBeVisible();
  await expect(page.getByText('Reached: 1 friend.')).toBeVisible();
  await expect(page.getByText('No name was sent.')).toBeVisible();

  expect(sent).toHaveLength(1);
  const raw = sent[0].postData() ?? '';
  expect(raw).not.toContain('Marisol');
  expect(raw).not.toContain('Teodor');
  expect(sent[0].postDataJSON()).toMatchObject({ planned: 2, reached: ['friend'] });

  await page.goto('/log');
  await expect(page.getByRole('link', { name: /^People Nudge.*Done this week/ })).toBeVisible();
});
