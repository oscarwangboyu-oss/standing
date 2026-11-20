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
    // One day of records does not replace a check answer: the price stands. (The check was
    // answered at random, so a sector may lack a price; no row may show a change either way.)
    // When no row moved, the rows carry no line of their own: the breakdown under them says why.
    const dayOne = page.getByRole('list', { name: 'Body and Mind prices' });
    await expect(dayOne.getByText('No move today.')).toHaveCount(0);
    await expect(dayOne.getByText(/[+−]\d+\.\d\d/)).toHaveCount(0);

    // Yesterday was before the first check, so the screen does not offer it.
    await expect(page.getByRole('button', { name: 'Fill in yesterday' })).toHaveCount(0);
    // The server still takes it, the way an older screen would have sent it.
    const token0 = await deviceToken(page);
    const backfill = await page.request.post('/api/daily', {
      headers: { authorization: `Bearer ${token0}` },
      data: { localDate: utcDay(), day: utcDay(-1), sleep: 0, exercise: 0, state: 1 },
    });
    expect(backfill.status()).toBe(201);
    await page.reload();
    await expect(streak(page)).toHaveText(/^2\s*days in a row$/);

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
    // The rules sit in the closed "How this counts" section.
    await page.getByText('How this counts').click();
    await expect(page.getByText(/Prices move at most 2 points a day/)).toBeVisible();
    await expect(streak(page)).toHaveText(/^4\s*days in a row$/);

    // The market home shows the move too.
    await page.goto('/market');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Overall\s*\d+\.\d\d/);
    await expect(page.getByText('since yesterday').first()).toBeVisible();
  });

  test('taps made offline stay on the device and are sent on the next open', async ({ page: first, context, watch }) => {
    let page = first;
    test.setTimeout(120_000);
    // The request that fails while offline.
    watch.allow(/ERR_INTERNET_DISCONNECTED|Failed to fetch/);
    await personWithCheck(page, { role: 'emp' });
    const headers = { authorization: `Bearer ${await deviceToken(page)}` };
    const recordedToday = async () =>
      (await (await page.request.get(`/api/me?today=${utcDay()}`, { headers })).json()).live.streak.recordedToday as boolean;

    await page.goto('/open');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Daily Open');
    await context.setOffline(true);
    await threeTaps(page, '7 to 9 hours', '20 to 39 minutes', 'Good');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saved on this device');
    await expect(page.getByText('It is sent when the connection returns.')).toBeVisible();
    await expect(page.getByText(/Nothing was lost/)).toHaveCount(0);

    // The taps wait on the device, and nothing reached the server (the test's own API call is
    // not subject to the page's offline setting). A reload while offline is not driven here:
    // the browser's offline emulation lets requests made while the page unloads through, which
    // a phone without a connection never would.
    const waiting = async () =>
      ((await page.evaluate(() => JSON.parse(localStorage.getItem('standing.v1.pending-daily') ?? '{}').waiting)) ?? []) as unknown[];
    expect(await waiting()).toHaveLength(1);
    expect(await recordedToday()).toBe(false);
    await page.close();
    await context.setOffline(false);

    // Back online, the next open sends the kept taps, and the screen shows the day as recorded.
    page = await context.newPage();
    await page.goto('/open');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Today's open");
    await expect.poll(recordedToday).toBe(true);
    await expect(page.getByText('7 to 9 hours')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('standing.v1.pending-daily') ?? '{}').waiting)).toEqual([]);
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

  // The four numbers, in the order of the form. Take-home pay is empty on the first payday.
  const income = page.getByLabel('Take-home pay this pay period');
  await expect(income).toHaveValue('');
  await income.fill('4317');
  await page.getByLabel('Money you can use now').fill('9526');
  await page.getByLabel('Paid toward debt this pay period').fill('1183');
  await page.getByLabel('Saved or invested this pay period').fill('1419');
  await page.getByRole('button', { name: 'Save this payday' }).click();
  await expect(page.getByRole('heading', { name: 'Payday recorded' })).toBeVisible();

  // The request: exactly the allowed fields, small whole numbers, and none of the typed amounts.
  expect(sent).toHaveLength(1);
  const raw = sent[0].postData() ?? '';
  const body = sent[0].postDataJSON() as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(['baselineDay', 'debtShare', 'id', 'localDate', 'periods', 'runway', 'saveShare']);
  // The random id is left out of the search, so its letters and digits cannot look like an amount.
  const rest = raw.replace(String(body.id), '');
  for (const amount of ['2468', '4317', '9526', '1183', '1419', '4,317', '9,526', '1,183', '1,419']) expect(rest).not.toContain(amount);
  expect(rest).not.toMatch(/income|spending|savings|balance|essential|amount/i);
  expect(body.periods).toBe(1);
  for (const field of ['saveShare', 'debtShare', 'runway'] as const) {
    const value = body[field];
    expect(Number.isInteger(value), field).toBe(true);
    expect(value as number).toBeGreaterThanOrEqual(0);
    expect(value as number).toBeLessThanOrEqual(4);
  }
  // The runway comes from the money available now: no baseline day.
  expect(body.baselineDay).toBeNull();

  // The screen says what was sent, what the money now would cover, and keeps the amounts on the device.
  await expect(page.getByText('No amount was sent.')).toBeVisible();
  // $9,526 over $2,468 a month is 3.86 months.
  await expect(page.getByRole('heading', { name: 'About 3.9 months of essential spending' })).toBeVisible();
  await expect(page.getByText('Take-home $4,317, money now $9,526, to debt $1,183, saved $1,419')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Payday recorded' }).or(page.getByRole('list', { name: 'Wealth now' })).getByRole('listitem')).toHaveCount(1);

  // The server refuses a request that carries an amount.
  const token = await deviceToken(page);
  const refused = await page.request.post('/api/payday', {
    headers: { authorization: `Bearer ${token}` },
    data: { ...body, id: 'e2e-amount-refused-0001', balance: 9526 },
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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Log saved');
  await expect(page.getByText('1 of 2 reached this week.')).toBeVisible();
  await expect(page.getByText('No name was sent.')).toBeVisible();
  // What was sent sits in the closed "How this counts" section.
  await page.getByText('How this counts').click();
  await expect(page.getByText('Reached: 1 friend.')).toBeVisible();

  expect(sent).toHaveLength(1);
  const raw = sent[0].postData() ?? '';
  expect(raw).not.toContain('Marisol');
  expect(raw).not.toContain('Teodor');
  expect(sent[0].postDataJSON()).toMatchObject({ planned: 2, reached: ['friend'] });

  await page.goto('/log');
  await expect(page.getByRole('link', { name: /^People Nudge.*Done this week/ })).toBeVisible();
});
