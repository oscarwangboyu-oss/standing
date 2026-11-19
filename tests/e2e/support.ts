/**
 * Shared parts of the flow tests.
 *
 * - `test` watches every page of the test: a console error, an uncaught error, or a request to
 *   another origin fails the test when it ends. A test that expects an error names it with
 *   `watch.allow(/pattern/)`.
 * - The helpers walk the screens the way a person does: /start step by step, /check by taps
 *   or with the developer panel (?debug=1), which answers randomly to the end.
 *
 * Every test makes its own person, so the files can run in any order against one database.
 */
import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

export { expect };

export interface Watch {
  /** Console errors matching the pattern are expected in this test. */
  allow(pattern: RegExp): void;
  /** Watch a second browser context (another device) as well. */
  also(context: BrowserContext): void;
}

export const test = base.extend<{ watch: Watch }>({
  watch: [
    async ({ context, baseURL }, use) => {
      const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
      const errors: string[] = [];
      const foreign: string[] = [];
      const allowed: RegExp[] = [];
      const watchPage = (page: Page) => {
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(`${page.url()} console: ${message.text()}`);
        });
        page.on('pageerror', (error) => errors.push(`${page.url()} uncaught: ${error.message}`));
      };
      const watchContext = (ctx: BrowserContext) => {
        for (const page of ctx.pages()) watchPage(page);
        ctx.on('page', watchPage);
        ctx.on('request', (request) => {
          const url = request.url();
          if (/^(data|blob|about):/.test(url)) return;
          if (new URL(url).origin !== origin) foreign.push(url);
        });
      };
      watchContext(context);
      await use({ allow: (pattern) => void allowed.push(pattern), also: watchContext });
      expect(
        errors.filter((line) => !allowed.some((pattern) => pattern.test(line))),
        'console errors and uncaught errors',
      ).toEqual([]);
      expect(foreign, 'requests to another origin').toEqual([]);
    },
    { auto: true },
  ],
});

/** A second device: a new browser context with the phone settings of the project. */
export async function secondDevice(browser: Browser, testInfo: TestInfo, watch: Watch): Promise<{ context: BrowserContext; page: Page }> {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    deviceScaleFactor: use.deviceScaleFactor,
  });
  watch.also(context);
  return { context, page: await context.newPage() };
}

// ---------------------------------------------------------------- the bank, as the screens word it

/** The 11 situations of the question bank, with the short name the quote line shows. */
export const ROLES = [
  { id: 'ug4', label: "Bachelor's student", short: "bachelor's student" },
  { id: 'cc', label: 'Community college or associate student', short: 'community college student' },
  { id: 'grad', label: "Graduate student (master's, doctorate, professional degree)", short: 'graduate student' },
  { id: 'emp', label: 'Employed full-time', short: 'employed full-time' },
  { id: 'gig', label: 'Part-time, gig work or several jobs', short: 'part-time or gig work' },
  { id: 'free', label: 'Freelance or sole proprietor (no employees)', short: 'freelance' },
  { id: 'owner', label: 'Founder or business owner (with employees or partners)', short: 'business owner' },
  { id: 'seek', label: 'Looking for work, or between jobs', short: 'looking for work' },
  { id: 'care', label: 'Caring for family full-time', short: 'caring for family' },
  { id: 'ret', label: 'Retired', short: 'retired' },
  { id: 'oth', label: 'Other', short: 'other situation' },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

const STATE_QUESTION = 'Which state do you live in?';
const ROLE_QUESTION = 'Which best describes your main situation now?';

// ---------------------------------------------------------------- /start

export interface StartOptions {
  role?: RoleId;
  /** An age band as the bank words it. */
  age?: string;
  /** The Body and Mind consent. */
  health?: boolean;
  ticker?: string;
  /** A state by name, for example "Georgia". */
  state?: string;
  /** Load the developer panel (?debug=1). */
  debug?: boolean;
  /** True when the page already shows the first step of /start. */
  onStart?: boolean;
}

/** Walks /start from the introduction to the first question of the check. */
export async function startCheck(page: Page, options: StartOptions = {}): Promise<void> {
  const role = ROLES.find((r) => r.id === (options.role ?? 'emp'));
  if (!role) throw new Error(`no such role: ${options.role}`);
  const heading = page.getByRole('heading', { level: 1 });

  if (!options.onStart) await page.goto(options.debug === false ? '/start' : '/start?debug=1');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await page.getByRole('radio', { name: 'Yes, I am 18 or older' }).click();
  await page.getByRole('radio', { name: options.age ?? '25 to 29', exact: true }).click();
  await expect(heading).toHaveText(ROLE_QUESTION);
  await page.getByRole('radio', { name: role.label, exact: true }).click();
  await expect(heading).not.toHaveText(ROLE_QUESTION);

  // The background questions of the situation: one to three of them, then the state.
  for (let asked = 0; asked < 6; asked += 1) {
    const text = await heading.innerText();
    if (text === STATE_QUESTION) break;
    await page.getByRole('radio').first().click();
    await expect(heading).not.toHaveText(text);
  }
  await expect(heading).toHaveText(STATE_QUESTION);
  if (options.state) await page.getByLabel('State').selectOption({ label: options.state });
  await page.getByRole('button', { name: /^Continue/ }).click();

  await expect(heading).toHaveText('Pick a ticker');
  if (options.ticker !== undefined) await page.getByLabel('Ticker').fill(options.ticker);
  await page.getByRole('button', { name: /^Continue/ }).click();

  await expect(heading).toHaveText('May we ask about your body and mind?');
  await page.getByRole('radio', { name: options.health === false ? /^No, leave them out/ : /^Yes, include Body and Mind/ }).click();
  await page.waitForURL(/\/check(\?|$)/);
  await expect(page.locator('#q-text')).toBeVisible();
}

// ---------------------------------------------------------------- /check

export interface QuestionOnScreen {
  current: number;
  total: number;
  text: string;
  options: string[];
}

interface Seen {
  done: boolean;
  current: number;
  total: number;
  text: string;
  options: string[];
}

/** Waits for a question to be on screen (or for the result) and reads it. */
async function see(page: Page, timeout = 30_000): Promise<Seen> {
  const handle = await page.waitForFunction(
    () => {
      if (window.location.pathname === '/result') return { done: true, current: 0, total: 0, text: '', options: [] as string[] };
      const title = document.getElementById('q-text');
      const count = title?.previousElementSibling?.querySelector('p')?.textContent ?? '';
      const match = /(\d+) of (\d+)/.exec(count);
      if (!title || !match) return null;
      const options = Array.from(title.parentElement?.querySelectorAll('[role="radio"]') ?? []).map((o) => o.textContent ?? '');
      return { done: false, current: Number(match[1]), total: Number(match[2]), text: title.textContent ?? '', options };
    },
    undefined,
    { timeout },
  );
  return (await handle.jsonValue()) as Seen;
}

/** The question on screen. */
export async function questionOnScreen(page: Page): Promise<QuestionOnScreen> {
  const seen = await see(page);
  if (seen.done) throw new Error('the check is over');
  return { current: seen.current, total: seen.total, text: seen.text, options: seen.options };
}

export type Answer = 'skip' | 'na' | number;

/**
 * Answers one question the way a person does and waits until it has left the screen. A tap in
 * the first 150 ms after a question appears is ignored by the app (it guards against a double
 * tap), so the tap waits a moment, and is repeated if the question is still there.
 */
export async function answer(page: Page, how: Answer): Promise<QuestionOnScreen> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const question = await questionOnScreen(page);
    await page.waitForTimeout(220);
    if (how === 'skip') await page.getByRole('button', { name: 'Skip', exact: true }).click();
    else if (how === 'na') await page.getByRole('button', { name: 'Not applicable', exact: true }).click();
    else await page.locator('#q-text ~ [role="radiogroup"] [role="radio"]').nth(how % question.options.length).click();
    const left = await page
      .waitForFunction(
        (number) => {
          if (window.location.pathname === '/result') return true;
          const title = document.getElementById('q-text');
          if (!title) return true;
          const count = title.previousElementSibling?.querySelector('p')?.textContent ?? '';
          return !new RegExp(`(^|\\D)${number} of `).test(count);
        },
        question.current,
        { timeout: 2_500 },
      )
      .then(() => true)
      .catch(() => false);
    if (left) return question;
  }
  throw new Error('the question did not take the answer');
}

/**
 * Answers every remaining question by taps and ends on /result. `pick` decides each answer
 * from the question; by default an option that depends on the question number.
 */
export async function tapToTheEnd(page: Page, pick: (question: QuestionOnScreen) => Answer = (q) => q.current * 3): Promise<QuestionOnScreen[]> {
  const asked: QuestionOnScreen[] = [];
  for (let turn = 0; turn < 80; turn += 1) {
    const seen = await see(page);
    if (seen.done) break;
    asked.push(await answer(page, pick(seen)));
  }
  await page.waitForURL(/\/result(\?|$)/);
  return asked;
}

/** The developer panel answers randomly to the end. Needs a page that was opened with ?debug=1. */
export async function helperToTheEnd(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Developer panel' }).click();
  await page.getByRole('button', { name: 'Answer randomly to the end' }).click();
  await page.waitForURL(/\/result(\?|$)/, { timeout: 45_000 });
}

/** The result screen with its prices on it. */
export async function expectResult(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/result(\?|$)/);
  await expect(page.getByRole('list', { name: 'Sector prices' })).toBeVisible();
}

/** A person with a completed check, made the short way: /start by taps, then the helper. */
export async function personWithCheck(page: Page, options: StartOptions = {}): Promise<void> {
  await startCheck(page, options);
  await helperToTheEnd(page);
  await expectResult(page);
}

/** The device token this browser holds, for the few calls a test makes next to the screens. */
export async function deviceToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const raw = window.localStorage.getItem('standing.v1.device');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { deviceToken?: string; value?: { deviceToken?: string } };
    return parsed.deviceToken ?? parsed.value?.deviceToken ?? null;
  });
  if (!token) throw new Error('this browser holds no device token');
  return token;
}

/** A UTC day as YYYY-MM-DD, `offset` days from today. */
export function utcDay(offset = 0): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}
