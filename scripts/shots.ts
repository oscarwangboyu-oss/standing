/**
 * npm run shots -- [--url http://127.0.0.1:3100] [--out design/shots/final] [--only <substring>]
 *
 * Walks every screen of Standing the way a person does and saves a PNG of each one, named
 * NN-screen-WIDTH-THEME.png, for example 23-market-390-dark.png:
 *
 *   - phone: 390 by 844 at 2x, touch, light and dark. Every screen.
 *   - desktop: 1440 by 900 at 1x, light. Landing, method, start, a check question, result,
 *     market, comparison, settings and team.
 *
 * It does not start a server. Start one first (`npm run preview` or `npm run dev`) and pass its
 * address with --url. The daily screens need the stage 2 switches on, which a local server has.
 * Point it at a local server only: every run makes new people (one browser context per person,
 * each takes the whole check by taps), and they stay in that server's database.
 *
 * The team dashboard needs the passphrase of that server in the environment variable
 * TEAM_PASSPHRASE. Default 'local-team-passphrase', the one `npm run dev` reads from
 * .env.development. Example:
 *
 *   TEAM_PASSPHRASE=audit-pass npm run shots -- --url http://127.0.0.1:3100 --out design/shots/audit
 *
 *   --url U    Address of the running server. Default http://localhost:3000.
 *   --out D    Folder for the images, made when missing. Default design/shots/final.
 *   --only S   Only the images whose file name contains S: --only payday, --only 1440,
 *              --only dark, --only 23-market. The walk still passes the screens before them.
 *
 * Every run makes the same people with the same prices: answers are chosen by their score in the
 * question bank (the order of the options on screen is random), and each answer waits until the
 * question could be read, so none counts at reduced weight. Dates, the norms and algorithm in
 * force, and the counts on the team dashboard can still differ between runs.
 *
 * Clocks run in UTC and motion is reduced (prefers-reduced-motion), so towers and count-ups are
 * final. Fonts are awaited, the pointer leaves the page and the developer button is hidden. In a
 * full-page image the bottom dock is drawn once, at the end of the page. A page taller than Chrome
 * draws in one image is taken in pieces that are joined into one PNG.
 *
 * At the end it prints the images it wrote, the screens it could not reach and why, and every
 * console error, failed request, HTTP error, request to another origin and sideways overflow it
 * saw on the way. It exits with 1 when a screen is missing. Uses the installed Chrome.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { getBank, thresholdFor, type SectionId } from '../src/engine';
import { parseArgs, rejectUnknown } from './lib/args';

// ---------------------------------------------------------------- the screens

/** Every image, in the order a person meets the screens. The number in the file name is the position here. */
const SCREENS = [
  { id: 'landing', desktop: true },
  { id: 'about', desktop: false },
  { id: 'method', desktop: true },
  { id: 'privacy', desktop: false },
  { id: 'terms', desktop: false },
  { id: 'start-intro', desktop: true },
  { id: 'start-notice', desktop: false },
  { id: 'start-adult', desktop: false },
  { id: 'start-age', desktop: false },
  { id: 'start-role', desktop: false },
  { id: 'start-background', desktop: false },
  { id: 'start-state', desktop: false },
  { id: 'start-ticker', desktop: false },
  { id: 'start-health', desktop: false },
  { id: 'check-question', desktop: true },
  { id: 'check-between', desktop: false },
  { id: 'check-mid', desktop: false },
  { id: 'check-focus', desktop: false },
  { id: 'result-top', desktop: false },
  { id: 'result', desktop: true },
  { id: 'result-why', desktop: false },
  { id: 'result-share', desktop: false },
  { id: 'market', desktop: true },
  { id: 'market-why', desktop: false },
  { id: 'open', desktop: false },
  { id: 'open-done', desktop: false },
  { id: 'payday-setup', desktop: false },
  { id: 'payday-entry', desktop: false },
  { id: 'payday-done', desktop: false },
  { id: 'win', desktop: false },
  { id: 'win-done', desktop: false },
  { id: 'people-pick', desktop: false },
  { id: 'people-log', desktop: false },
  { id: 'people-done', desktop: false },
  { id: 'log', desktop: false },
  { id: 'compare-invite-made', desktop: false },
  { id: 'invite', desktop: false },
  { id: 'comparison', desktop: true },
  { id: 'compare-list', desktop: false },
  { id: 'settings', desktop: true },
  { id: 'settings-delete', desktop: false },
  { id: 'settings-delete-ticked', desktop: false },
  { id: 'team-gate', desktop: false },
  { id: 'team', desktop: true },
  { id: 'result-three-sectors', desktop: false },
  { id: 'market-three-sectors', desktop: false },
  { id: 'open-no-consent', desktop: false },
  { id: 'styleguide', desktop: false },
] as const;

type ScreenId = (typeof SCREENS)[number]['id'];

interface Variant {
  label: string;
  width: number;
  height: number;
  scale: number;
  phone: boolean;
  theme: 'light' | 'dark';
}

const VARIANTS: readonly Variant[] = [
  { label: 'phone light', width: 390, height: 844, scale: 2, phone: true, theme: 'light' },
  { label: 'phone dark', width: 390, height: 844, scale: 2, phone: true, theme: 'dark' },
  { label: 'desktop light', width: 1440, height: 900, scale: 1, phone: false, theme: 'light' },
];

/** Applied while an image is taken: the developer panel button and the Next.js dev badge. */
const HIDDEN_WHILE_SHOOTING = 'button[aria-label="Developer panel"], nextjs-portal { display: none !important; }';

/** Added to the reading time of a question before it is answered, in milliseconds. */
const ANSWER_MARGIN_MS = 350;
/** Longest wait for one screen to show what it should, in milliseconds. */
const STEP_TIMEOUT_MS = 30_000;
/** Tallest image Chrome draws in one go without wrapping around, in device pixels (its texture limit is 16,384). */
const MAX_IMAGE_PX = 16_000;
/** Height of one piece of a taller page, in device pixels. */
const PIECE_PX = 8_000;

// ---------------------------------------------------------------- the people

interface Persona {
  ticker: string;
  role: string;
  age: string;
  state?: string;
  health: boolean;
  /** The score (0 to 1) each answer aims for, by section. The closing question is section G. */
  aim: Record<SectionId, number>;
  /** Question numbers that are skipped, as a person skips a question. */
  skip: readonly number[];
}

/** The main person: every screen. A clear leader (SKIL) and a clear laggard (WLTH). */
const MAIN: Persona = {
  ticker: 'ALFA',
  role: 'Employed full-time',
  age: '25 to 29',
  state: 'Georgia',
  health: true,
  aim: { C: 0.85, W: 0.4, N: 0.7, B: 0.6, M: 0.75, G: 0.6 },
  skip: [7],
};

/** The friend who accepts the invite. */
const FRIEND: Persona = {
  ticker: 'BRVO',
  role: "Graduate student (master's, doctorate, professional degree)",
  age: '21 to 24',
  state: 'California',
  health: true,
  aim: { C: 0.6, W: 0.55, N: 0.85, B: 0.75, M: 0.5, G: 0.5 },
  skip: [],
};

/** A person who declines the Body and Mind consent: three sectors. */
const THREE: Persona = {
  ticker: 'TRIO',
  role: 'Freelance or sole proprietor (no employees)',
  age: '30 to 34',
  health: false,
  aim: { C: 0.7, W: 0.6, N: 0.45, B: 0.5, M: 0.5, G: 0.55 },
  skip: [],
};

/** Varies the aim from question to question, so a sector is not one answer repeated. */
const WOBBLE = [0, 0.15, -0.1, 0.1, -0.15, 0.05, -0.05];

const ROLE_QUESTION = 'Which best describes your main situation now?';
const STATE_QUESTION = 'Which state do you live in?';

// ---------------------------------------------------------------- the bank, to answer by score

interface StemFacts {
  area: SectionId;
  /** Score of each option by its English label. null: not scored. */
  scores: Map<string, number | null>;
}

const STEMS: Map<string, StemFacts> = (() => {
  const stems = new Map<string, StemFacts>();
  for (const item of Object.values(getBank().items)) {
    for (const version of item.versions) {
      const facts = stems.get(version.q.en) ?? { area: item.area, scores: new Map<string, number | null>() };
      version.opts.forEach((option, index) => facts.scores.set(option.en.trim(), version.s[index]));
      stems.set(version.q.en, facts);
    }
  }
  return stems;
})();

type Pick = { kind: 'option'; index: number } | { kind: 'skip' };

/**
 * The option whose score is nearest the aim of the persona for this question. The options come
 * in a random order, so nothing here depends on their position: two options as near as each
 * other go to the higher score, and a question missing from the bank takes an option by label.
 */
function pickFor(persona: Persona, q: QuestionSeen): Pick {
  if (persona.skip.includes(q.current)) return { kind: 'skip' };
  const facts = STEMS.get(q.text.trim());
  const byLabel = (): Pick => {
    const sorted = [...q.options].sort();
    return { kind: 'option', index: q.options.indexOf(sorted[(q.current * 3) % sorted.length]) };
  };
  if (!facts) {
    note(`a question is not in the bank, answered by label: ${q.text.trim()}`);
    return byLabel();
  }
  const aim = persona.aim[facts.area] + WOBBLE[q.current % WOBBLE.length];
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestScore = Number.NEGATIVE_INFINITY;
  q.options.forEach((label, index) => {
    const score = facts.scores.get(label.trim());
    if (score === undefined || score === null) return;
    const distance = Math.abs(score - aim);
    const nearer = distance < bestDistance - 1e-9;
    const asNear = Math.abs(distance - bestDistance) <= 1e-9;
    if (nearer || (asNear && (score > bestScore || (score === bestScore && label < q.options[best])))) {
      best = index;
      bestDistance = distance;
      bestScore = score;
    }
  });
  return best >= 0 ? { kind: 'option', index: best } : byLabel();
}

// ---------------------------------------------------------------- what went wrong on the way

const problems: string[] = [];
const missing: Array<{ file: string; reason: string }> = [];
const written: string[] = [];

function note(line: string): void {
  problems.push(line);
}

/** Records console errors, uncaught errors, failed requests, HTTP errors and requests to another origin. */
function watch(context: BrowserContext, label: string, origin: string): void {
  const where = (page: Page) => {
    try {
      const url = new URL(page.url());
      return url.pathname + url.search;
    } catch {
      return page.url();
    }
  };
  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') note(`[${label}] console error on ${where(page)}: ${message.text()}`);
    });
    page.on('pageerror', (error) => note(`[${label}] uncaught error on ${where(page)}: ${error.message}`));
  });
  context.on('requestfailed', (request) => {
    note(`[${label}] request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'no reason'})`);
  });
  context.on('response', (response) => {
    if (response.status() >= 400) note(`[${label}] HTTP ${response.status()}: ${response.request().method()} ${response.url()}`);
  });
  context.on('request', (request) => {
    const url = request.url();
    if (/^(data|blob|about):/.test(url)) return;
    if (new URL(url).origin !== origin) note(`[${label}] request to another origin: ${url}`);
  });
}

// ---------------------------------------------------------------- the camera

class Camera {
  constructor(
    readonly variant: Variant,
    private readonly out: string,
    private readonly only: string | undefined,
  ) {}

  file(id: ScreenId): string {
    const index = SCREENS.findIndex((screen) => screen.id === id);
    return `${String(index + 1).padStart(2, '0')}-${id}-${this.variant.width}-${this.variant.theme}.png`;
  }

  /** True when this variant takes an image of the screen and the --only filter lets it through. */
  wants(...ids: ScreenId[]): boolean {
    return ids.some((id) => {
      const screen = SCREENS.find((s) => s.id === id);
      if (!screen || (!this.variant.phone && !screen.desktop)) return false;
      return this.only === undefined || this.file(id).includes(this.only);
    });
  }

  /**
   * Takes the image. `full`: the whole page. `viewport`: what the screen shows, for the top of a
   * page and for a sheet over it. `quick` leaves out the wait for loading blocks and images, for a
   * screen that is up for a moment only.
   */
  async shot(page: Page, id: ScreenId, options: { view?: 'full' | 'viewport'; quick?: boolean; keepScroll?: boolean } = {}): Promise<void> {
    if (!this.wants(id)) return;
    const file = this.file(id);
    if (!options.quick) await settle(page);
    if (!options.keepScroll) await page.evaluate(() => window.scrollTo(0, 0));
    // The pointer leaves the page. A full-page capture would otherwise draw the hover style of
    // whatever is under the last tap, even on a phone, which has no hover.
    await page.mouse.move(-1, -1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) note(`[${this.variant.label}] ${file}: the page scrolls sideways by ${overflow}px`);
    const path = join(this.out, file);
    const full = (options.view ?? 'full') === 'full';
    if (full) await pinBottomBars(page);
    try {
      const size = full ? await pageSize(page) : null;
      if (size && size.height * this.variant.scale > MAX_IMAGE_PX) await writeFile(path, await tallShot(page, size, this.variant.scale));
      else await page.screenshot({ path, fullPage: full, animations: 'disabled', style: HIDDEN_WHILE_SHOOTING });
    } finally {
      if (full) await unpinBottomBars(page);
    }
    written.push(path);
    console.log(`  ${file}`);
  }

  /** Every file this variant should write, for the list of what is missing. */
  expected(): string[] {
    return SCREENS.filter((screen) => this.wants(screen.id)).map((screen) => this.file(screen.id));
  }
}

/**
 * Fonts loaded, loading blocks gone, images decoded, one more frame painted. The style guide
 * shows the loading block as a specimen, so there it is not waited for.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const specimen = new URL(page.url()).pathname === '/styleguide';
  const settled = await page
    .waitForFunction(
      (ignoreLoading) => {
        const loading = ignoreLoading
          ? null
          : Array.from(document.querySelectorAll('[class*="skeleton" i]')).find((block) => block.getClientRects().length > 0);
        const images = Array.from(document.images).every((image) => image.complete);
        return !loading && images;
      },
      specimen,
      { timeout: 10_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!settled) {
    const left = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="skeleton" i]'))
        .filter((block) => block.getClientRects().length > 0)
        .map((block) => `${block.tagName.toLowerCase()}.${String(block.getAttribute('class'))}`)
        .slice(0, 3)
        .join(', '),
    );
    note(`loading blocks or images still on ${new URL(page.url()).pathname} after 10 s: ${left || 'an image'}`);
  }
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

/**
 * A full-page image is taken as if the page were one tall screen. A bar that sticks to the
 * bottom of the screen (the dock) would otherwise be drawn where the first screen ended, over
 * the content. For the capture it goes back into the flow: a sticky bar to its own place at the
 * end of the page, a fixed bar to the bottom of the page. Undone right after.
 */
async function pinBottomBars(page: Page): Promise<number> {
  return page.evaluate(() => {
    const marked: HTMLElement[] = [];
    const screen = window.innerHeight;
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(element);
      if (style.position !== 'sticky' && style.position !== 'fixed') continue;
      if (element.closest('dialog') || style.display === 'none' || style.visibility === 'hidden') continue;
      const box = element.getBoundingClientRect();
      if (box.height === 0 || box.top < screen / 2 || box.bottom < screen - 160) continue;
      element.dataset.shotsStyle = element.getAttribute('style') ?? '';
      if (style.position === 'sticky') {
        element.style.setProperty('position', 'static', 'important');
      } else {
        const gap = screen - box.bottom;
        element.style.setProperty('position', 'absolute', 'important');
        element.style.setProperty('bottom', 'auto', 'important');
        element.style.setProperty('top', '0px', 'important');
        const at = element.getBoundingClientRect().top + window.scrollY;
        const want = document.documentElement.scrollHeight - box.height - gap;
        element.style.setProperty('top', `${want - at}px`, 'important');
      }
      marked.push(element);
    }
    return marked.length;
  });
}

// ---------------------------------------------------------------- pages taller than one image

async function pageSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({
    width: Math.ceil(document.documentElement.scrollWidth),
    height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)),
  }));
}

/**
 * A page taller than Chrome draws in one image (about 16,000 device pixels) is taken in pieces
 * and the pieces are joined into one PNG. Taken in one go, such a page wraps around: below the
 * limit the image starts again with the top of the page.
 */
async function tallShot(page: Page, size: { width: number; height: number }, scale: number): Promise<Buffer> {
  const piece = Math.floor(PIECE_PX / scale);
  const parts: DecodedPng[] = [];
  for (let y = 0; y < size.height; y += piece) {
    const clip = { x: 0, y, width: size.width, height: Math.min(piece, size.height - y) };
    const buffer = await page.screenshot({ fullPage: true, clip, animations: 'disabled', style: HIDDEN_WHILE_SHOOTING });
    parts.push(decodePng(buffer));
  }
  return encodePng(stackPngs(parts));
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 8-bit RGB or RGBA pixels, row after row, without filter bytes. */
interface DecodedPng {
  width: number;
  height: number;
  /** 2: RGB, 6: RGBA. */
  colorType: number;
  channels: number;
  pixels: Buffer;
}

/** Reads the PNGs Chrome writes: 8 bits per channel, RGB or RGBA, not interlaced. */
function decodePng(file: Buffer): DecodedPng {
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('a screenshot was not a PNG');
  let width = 0;
  let height = 0;
  let colorType = 0;
  const data: Buffer[] = [];
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at);
    const type = file.toString('latin1', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9];
      if (body[8] !== 8 || (colorType !== 2 && colorType !== 6) || body[12] !== 0) {
        throw new Error(`a screenshot has a PNG format this script does not join (depth ${body[8]}, colour type ${colorType})`);
      }
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[row - stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[row - stride + x - channels] : 0;
      let value = raw[line + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new Error(`unknown PNG row filter ${filter}`);
      pixels[row + x] = value & 0xff;
    }
  }
  return { width, height, colorType, channels, pixels };
}

/** The pieces one below the other. They must have the same width and format. */
function stackPngs(parts: DecodedPng[]): DecodedPng {
  const [first] = parts;
  for (const part of parts) {
    if (part.width !== first.width || part.colorType !== first.colorType) throw new Error('the pieces of a tall page differ in width or format');
  }
  return { ...first, height: parts.reduce((sum, part) => sum + part.height, 0), pixels: Buffer.concat(parts.map((part) => part.pixels)) };
}

/** Writes a PNG. Every row but the first is stored as its difference to the row above (filter "Up"). */
function encodePng(png: DecodedPng): Buffer {
  const stride = png.width * png.channels;
  const raw = Buffer.alloc((stride + 1) * png.height);
  for (let y = 0; y < png.height; y += 1) {
    const line = y * (stride + 1);
    const row = y * stride;
    if (y === 0) {
      raw[line] = 0;
      png.pixels.copy(raw, line + 1, row, row + stride);
      continue;
    }
    raw[line] = 2;
    for (let x = 0; x < stride; x += 1) raw[line + 1 + x] = (png.pixels[row + x] - png.pixels[row - stride + x]) & 0xff;
  }
  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(png.width, 0);
  header.writeUInt32BE(png.height, 4);
  header[8] = 8;
  header[9] = png.colorType;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function unpinBottomBars(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-shots-style]'))) {
      const before = element.dataset.shotsStyle ?? '';
      if (before) element.setAttribute('style', before);
      else element.removeAttribute('style');
      delete element.dataset.shotsStyle;
    }
  });
}

// ---------------------------------------------------------------- walking the screens

interface QuestionSeen {
  kind: 'question';
  current: number;
  total: number;
  text: string;
  options: string[];
}

type Seen = QuestionSeen | { kind: 'beat'; title: string } | { kind: 'done' };

/** Waits until the check shows a question, the beat between two sectors, or the result. */
async function look(page: Page): Promise<Seen> {
  const handle = await page.waitForFunction(
    () => {
      if (window.location.pathname === '/result') return { kind: 'done' as const };
      const title = document.getElementById('q-text');
      if (title) {
        const count = title.previousElementSibling?.querySelector('p')?.textContent ?? '';
        const match = /(\d+) of (\d+)/.exec(count);
        if (match) {
          const radios = Array.from(title.parentElement?.querySelectorAll('[role="radio"]') ?? []);
          return {
            kind: 'question' as const,
            current: Number(match[1]),
            total: Number(match[2]),
            text: title.textContent ?? '',
            options: radios.map((radio) => radio.textContent ?? ''),
          };
        }
      }
      const heading = document.querySelector('h1')?.textContent ?? '';
      if (/ is built\.$/.test(heading)) return { kind: 'beat' as const, title: heading };
      return null;
    },
    undefined,
    { timeout: STEP_TIMEOUT_MS, polling: 50 },
  );
  return (await handle.jsonValue()) as Seen;
}

interface CheckHooks {
  /** Called once for each question, before it is answered. */
  question?: (q: QuestionSeen) => Promise<void>;
  /** Called once for each beat between two sectors, while it is on screen. */
  beat?: (title: string) => Promise<void>;
}

/** Answers every question by taps, each after its reading time, and ends on /result. */
async function takeCheck(page: Page, persona: Persona, hooks: CheckHooks = {}): Promise<void> {
  const beats = new Set<string>();
  const deadline = Date.now() + 10 * 60_000;
  let last = 0;
  while (Date.now() < deadline) {
    const seen = await look(page);
    if (seen.kind === 'done') break;
    if (seen.kind === 'beat') {
      if (!beats.has(seen.title)) {
        beats.add(seen.title);
        await hooks.beat?.(seen.title);
      }
      await page.waitForTimeout(80);
      continue;
    }
    if (seen.current === last) {
      // The question is still there: the tap came inside the guard after it appeared.
      await page.waitForTimeout(200);
    } else {
      const shownAt = Date.now();
      await hooks.question?.(seen);
      const wait = thresholdFor(seen.text, 'en') * 1000 + ANSWER_MARGIN_MS - (Date.now() - shownAt);
      if (wait > 0) await page.waitForTimeout(wait);
    }
    last = seen.current;
    const pick = pickFor(persona, seen);
    if (pick.kind === 'skip') await page.getByRole('button', { name: 'Skip', exact: true }).click();
    else await page.locator('#q-text ~ [role="radiogroup"] [role="radio"]').nth(pick.index).click();
    await page
      .waitForFunction(
        (number) => {
          if (window.location.pathname === '/result') return true;
          const title = document.getElementById('q-text');
          if (!title) return true;
          const count = title.previousElementSibling?.querySelector('p')?.textContent ?? '';
          return !new RegExp(`(^|\\D)${number} of `).test(count);
        },
        seen.current,
        { timeout: 2_500 },
      )
      .catch(() => undefined);
  }
  await page.waitForURL(/\/result(\?|$)/, { timeout: STEP_TIMEOUT_MS });
}

const h1 = (page: Page, text: string | RegExp) => page.locator('h1').filter({ hasText: text });

/** Walks /start from the introduction to the first question, taking images when `camera` is given. */
async function walkStart(page: Page, persona: Persona, camera: Camera | null, onStart = false): Promise<void> {
  const shot = async (id: ScreenId) => camera?.shot(page, id);
  if (!onStart) await page.goto('/start');
  await h1(page, 'Start your check').waitFor();
  await shot('start-intro');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.getByRole('button', { name: 'Agree and continue' }).waitFor();
  await shot('start-notice');
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await page.getByRole('radio', { name: 'Yes, I am 18 or older' }).waitFor();
  await shot('start-adult');
  await page.getByRole('radio', { name: 'Yes, I am 18 or older' }).click();
  await page.getByRole('radio', { name: persona.age, exact: true }).waitFor();
  await shot('start-age');
  await page.getByRole('radio', { name: persona.age, exact: true }).click();
  await h1(page, ROLE_QUESTION).waitFor();
  await shot('start-role');
  await page.getByRole('radio', { name: persona.role, exact: true }).click();
  const heading = page.locator('h1');
  await page.waitForFunction((role) => document.querySelector('h1')?.textContent !== role, ROLE_QUESTION);

  // One to three background questions of the situation, then the state.
  for (let asked = 0; asked < 6; asked += 1) {
    const text = (await heading.innerText()).trim();
    if (text === STATE_QUESTION) break;
    if (asked === 0) await shot('start-background');
    await page.getByRole('radio').first().click();
    await page.waitForFunction((before) => (document.querySelector('h1')?.textContent ?? '').trim() !== before, text);
  }
  await h1(page, STATE_QUESTION).waitFor();
  if (persona.state) await page.getByLabel('State').selectOption({ label: persona.state });
  await shot('start-state');
  await page.getByRole('button', { name: /^Continue/ }).click();

  await h1(page, 'Pick a ticker').waitFor();
  await page.getByLabel('Ticker').fill(persona.ticker);
  await shot('start-ticker');
  await page.getByRole('button', { name: /^Continue/ }).click();

  await h1(page, 'May we ask about your body and mind?').waitFor();
  await shot('start-health');
  await page.getByRole('radio', { name: persona.health ? /^Yes, include Body and Mind/ : /^No, leave them out/ }).click();
  await page.waitForURL(/\/check(\?|$)/);
  await page.locator('#q-text').waitFor();
}

/** The result with its prices, saved on the server. */
async function resultReady(page: Page): Promise<void> {
  await page.getByRole('list', { name: 'Sector prices' }).waitFor();
  await page.getByText('Saving your result.').waitFor({ state: 'hidden', timeout: STEP_TIMEOUT_MS });
}

async function closeSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

// ---------------------------------------------------------------- the walks

interface Walk {
  name: string;
  screens: ScreenId[];
  /** `context` opens a fresh browser context (a new device) with the settings of the variant. */
  run: (camera: Camera, context: () => Promise<BrowserContext>) => Promise<void>;
}

const WALKS: Walk[] = [
  {
    name: 'public pages',
    screens: ['landing', 'about', 'method', 'privacy', 'terms', 'styleguide'],
    run: async (camera, context) => {
      const page = await (await context()).newPage();
      const pages: Array<[ScreenId, string]> = [
        ['landing', '/'],
        ['about', '/about'],
        ['method', '/method'],
        ['privacy', '/privacy'],
        ['terms', '/terms'],
        ['styleguide', '/styleguide'],
      ];
      for (const [id, path] of pages) {
        if (!camera.wants(id)) continue;
        await page.goto(path);
        await page.locator('h1').first().waitFor();
        await camera.shot(page, id);
      }
    },
  },
  {
    name: 'a person with five sectors',
    screens: SCREENS.map((s) => s.id).filter((id) => /^(start|check|result|market|open|payday|win|people|log|compare|invite|comparison|settings)/.test(id) && !id.includes('three') && id !== 'open-no-consent'),
    run: async (camera, context) => {
      const page = await (await context()).newPage();
      await walkStart(page, MAIN, camera);

      let focused = false;
      let between = false;
      await takeCheck(page, MAIN, {
        question: async (q) => {
          if (q.current === 1) await camera.shot(page, 'check-question');
          if (q.current === 13) await camera.shot(page, 'check-mid');
          if (q.current === 14 && camera.wants('check-focus')) {
            for (let press = 0; press < 6 && !focused; press += 1) {
              await page.keyboard.press('Tab');
              focused = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'radio');
            }
            if (!focused) note(`[${camera.variant.label}] check-focus: six Tab presses did not reach an answer`);
            await camera.shot(page, 'check-focus', { keepScroll: true });
          }
        },
        beat: async () => {
          if (between || !camera.wants('check-between')) return;
          between = true;
          await camera.shot(page, 'check-between', { quick: true });
          const still = await page.evaluate(() => / is built\.$/.test(document.querySelector('h1')?.textContent ?? ''));
          if (!still) note(`[${camera.variant.label}] check-between: the beat may have ended while the image was taken`);
        },
      });

      // The result.
      await resultReady(page);
      await camera.shot(page, 'result-top', { view: 'viewport' });
      await camera.shot(page, 'result');
      if (camera.wants('result-why')) {
        await page.getByRole('list', { name: 'Sector prices' }).getByRole('button', { name: /^SKIL / }).click();
        await page.getByRole('dialog').getByText(/This is your first record/).waitFor();
        await camera.shot(page, 'result-why', { view: 'viewport', keepScroll: true });
        await closeSheet(page);
      }
      if (camera.wants('result-share')) {
        await page.getByRole('button', { name: 'Share my skyline' }).click();
        await page.getByRole('dialog', { name: 'Share your skyline' }).getByRole('button', { name: 'Save image' }).waitFor();
        await camera.shot(page, 'result-share', { view: 'viewport', keepScroll: true });
        await closeSheet(page);
      }

      // The market home.
      if (camera.wants('market', 'market-why')) {
        await page.goto('/market');
        await h1(page, /Overall\s*\d+\.\d\d/).waitFor();
        await camera.shot(page, 'market');
        if (camera.wants('market-why')) {
          await page.getByRole('list', { name: /^Sector prices/ }).getByRole('button').first().click();
          await page.getByRole('dialog').waitFor();
          await camera.shot(page, 'market-why', { view: 'viewport', keepScroll: true });
          await closeSheet(page);
        }
      }

      // Daily Open.
      if (camera.wants('open', 'open-done')) {
        await page.goto('/open');
        await h1(page, 'Daily Open').waitFor();
        await camera.shot(page, 'open');
        await page.getByRole('radio', { name: '7 to 9 hours', exact: true }).click();
        await page.getByRole('radio', { name: '20 to 39 minutes', exact: true }).click();
        await page.getByRole('radio', { name: 'Good', exact: true }).click();
        await h1(page, "Today's open").waitFor();
        await camera.shot(page, 'open-done');
      }

      // Payday Check. The amounts stay on the device.
      if (camera.wants('payday-setup', 'payday-entry', 'payday-done')) {
        await page.goto('/log/payday');
        await h1(page, 'Payday Check').waitFor();
        await page.getByRole('radio', { name: 'Every two weeks' }).click();
        await page.getByLabel('Essential spending in a month').fill('2400');
        await camera.shot(page, 'payday-setup');
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.getByLabel('Take-home pay this pay period').fill('2350');
        await page.getByLabel('Money you can use now').fill('5400');
        await page.getByLabel('Paid toward debt this pay period').fill('260');
        await page.getByLabel('Saved or invested this pay period').fill('400');
        await camera.shot(page, 'payday-entry');
        await page.getByRole('button', { name: 'Save this payday' }).click();
        await page.getByRole('heading', { name: 'Payday recorded' }).waitFor();
        await camera.shot(page, 'payday-done');
      }

      // Weekly Win. The name stays on the device.
      if (camera.wants('win', 'win-done')) {
        await page.goto('/log/win');
        await h1(page, 'Weekly Win').waitFor();
        await camera.shot(page, 'win');
        await page.getByRole('radio', { name: /^A course or training/ }).click();
        await page.getByRole('radio', { name: '2 to 4 hours' }).click();
        await page.getByLabel('A name for it (optional)').fill('Spreadsheet modelling, week 3');
        await page.getByRole('button', { name: 'Log this win' }).click();
        await page.getByText('Logged this week').first().waitFor();
        await camera.shot(page, 'win-done');
      }

      // People Nudge. The names stay on the device.
      if (camera.wants('people-pick', 'people-log', 'people-done')) {
        await page.goto('/log/people');
        await page.getByLabel('Person 1').fill('Maya');
        await page.getByRole('radiogroup', { name: 'Who they are to you' }).nth(0).getByRole('radio', { name: 'Friend' }).click();
        await page.getByLabel('Person 2').fill('Dad');
        await page.getByRole('radiogroup', { name: 'Who they are to you' }).nth(1).getByRole('radio', { name: 'Family' }).click();
        await camera.shot(page, 'people-pick');
        await page.getByRole('button', { name: 'Keep these for the week' }).click();
        await page.getByRole('heading', { name: 'Who did you reach?' }).waitFor();
        await page.getByRole('checkbox', { name: 'Mark Maya as reached' }).check();
        await camera.shot(page, 'people-log');
        await page.getByRole('button', { name: "Save this week's log" }).click();
        await page.getByRole('heading', { level: 1, name: 'Log saved' }).waitFor();
        await camera.shot(page, 'people-done');
      }

      // The log hub.
      if (camera.wants('log')) {
        await page.goto('/log');
        await page.getByRole('link', { name: /^Weekly Win/ }).waitFor();
        await camera.shot(page, 'log');
      }

      // Friend compare: an invite, a friend on another device, the comparison.
      if (camera.wants('compare-invite-made', 'invite', 'comparison', 'compare-list')) {
        await page.goto('/compare');
        await page.getByRole('button', { name: 'Create an invite link' }).click();
        await page.getByRole('heading', { name: 'Your invite link' }).waitFor();
        await camera.shot(page, 'compare-invite-made');
        const link = await page.getByRole('main').getByText(/\/i\/[A-Za-z0-9_-]{16,}/).first().innerText();

        const friendContext = await context();
        const friend = await friendContext.newPage();
        await friend.goto(new URL(link.trim()).pathname);
        await h1(friend, `${MAIN.ticker} invited you to compare`).waitFor();
        await camera.shot(friend, 'invite');
        await friend.getByRole('button', { name: 'Start the check' }).click();
        await friend.waitForURL(/\/start/);
        await walkStart(friend, FRIEND, null, true);
        await takeCheck(friend, FRIEND);
        await resultReady(friend);
        await friend.getByText(`Your comparison with ${MAIN.ticker} is ready.`).waitFor();
        await friendContext.close();

        await page.goto('/compare');
        const row = page.getByRole('list', { name: 'Your comparisons' }).getByRole('link', { name: new RegExp(`^${FRIEND.ticker}`) });
        await row.waitFor();
        await camera.shot(page, 'compare-list');
        await row.click();
        await h1(page, 'Side by side').waitFor();
        await page.getByRole('region', { name: new RegExp(`^${FRIEND.ticker}, overall \\d+\\.\\d\\d`) }).waitFor();
        await camera.shot(page, 'comparison');
      }

      // Settings, and the delete sheet. Nothing is deleted.
      if (camera.wants('settings', 'settings-delete', 'settings-delete-ticked')) {
        await page.goto('/settings');
        await page.getByRole('region', { name: 'Ticker' }).getByText(MAIN.ticker).waitFor();
        await camera.shot(page, 'settings');
        if (camera.wants('settings-delete', 'settings-delete-ticked')) {
          await page.getByRole('button', { name: /^Delete my data/ }).click();
          const sheet = page.getByRole('dialog', { name: 'Delete my data' });
          await sheet.waitFor();
          await camera.shot(page, 'settings-delete', { view: 'viewport', keepScroll: true });
          await sheet.getByRole('checkbox', { name: 'I understand that this cannot be undone.' }).check();
          await camera.shot(page, 'settings-delete-ticked', { view: 'viewport', keepScroll: true });
          await closeSheet(page);
        }
      }
    },
  },
  {
    name: 'a person with three sectors',
    screens: ['result-three-sectors', 'market-three-sectors', 'open-no-consent'],
    run: async (camera, context) => {
      const page = await (await context()).newPage();
      await walkStart(page, THREE, null);
      await takeCheck(page, THREE);
      await resultReady(page);
      await camera.shot(page, 'result-three-sectors');
      await page.goto('/market');
      await h1(page, /Overall\s*\d+\.\d\d/).waitFor();
      await camera.shot(page, 'market-three-sectors');
      await page.goto('/open');
      await page.getByText('Daily Open needs your consent for Body and Mind').waitFor();
      await camera.shot(page, 'open-no-consent');
    },
  },
  {
    name: 'team dashboard',
    screens: ['team-gate', 'team'],
    run: async (camera, context) => {
      const page = await (await context()).newPage();
      await page.goto('/team');
      await page.getByLabel('Team passphrase').waitFor();
      await camera.shot(page, 'team-gate');
      await page.getByLabel('Team passphrase').fill(process.env.TEAM_PASSPHRASE || 'local-team-passphrase');
      await page.getByRole('button', { name: 'Open the dashboard' }).click();
      const gates = page.getByRole('region', { name: 'Stage gates' });
      const refused = page.getByRole('alert').filter({ hasText: 'That passphrase is not right.' });
      await gates.or(refused).first().waitFor();
      if (await refused.isVisible()) throw new Error('the team passphrase was refused: set TEAM_PASSPHRASE to the passphrase of the server');
      await camera.shot(page, 'team');
    },
  },
];

// ---------------------------------------------------------------- running

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  rejectUnknown(args, ['url', 'out', 'only']);
  const base = new URL(args.value('url') ?? 'http://localhost:3000');
  const out = resolve(args.value('out') ?? 'design/shots/final');
  const only = args.value('only');
  await mkdir(out, { recursive: true });

  const health = await fetch(new URL('/api/health', base)).catch(() => null);
  if (!health?.ok) throw new Error(`no server answers at ${base.origin}. Start one first (npm run preview or npm run dev).`);

  const browser = await chromium.launch({ channel: 'chrome' });
  const started = Date.now();
  try {
    for (const variant of VARIANTS) {
      const camera = new Camera(variant, out, only);
      const walks = WALKS.filter((walk) => camera.wants(...walk.screens));
      if (walks.length === 0) continue;
      console.log(`${variant.label}, ${variant.width} by ${variant.height}`);
      for (const walk of walks) {
        const contexts: BrowserContext[] = [];
        const context = async () => {
          const created = await browser.newContext({
            baseURL: base.origin,
            viewport: { width: variant.width, height: variant.height },
            deviceScaleFactor: variant.scale,
            isMobile: variant.phone,
            hasTouch: variant.phone,
            colorScheme: variant.theme,
            reducedMotion: 'reduce',
            timezoneId: 'UTC',
            locale: 'en-US',
          });
          created.setDefaultTimeout(STEP_TIMEOUT_MS);
          watch(created, `${variant.label}, ${walk.name}`, base.origin);
          contexts.push(created);
          return created;
        };
        try {
          await walk.run(camera, context);
        } catch (error) {
          const pages = contexts.flatMap((c) => c.pages());
          const at = pages.length > 0 ? new URL(pages[pages.length - 1].url()).pathname : 'no page';
          const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
          note(`[${variant.label}] walk "${walk.name}" stopped on ${at}: ${message}`);
        } finally {
          for (const c of contexts) await c.close().catch(() => undefined);
        }
      }
      const done = new Set(written.map((path) => path.slice(out.length + 1)));
      for (const file of camera.expected()) if (!done.has(file)) missing.push({ file, reason: `not reached in ${variant.label}` });
    }
  } finally {
    await browser.close();
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\n${written.length} images in ${relative(process.cwd(), out) || '.'} (${seconds} s).`);
  if (missing.length > 0) {
    console.log(`\nMissing (${missing.length}):`);
    for (const m of missing) console.log(`  ${m.file}: ${m.reason}`);
  }
  if (problems.length > 0) {
    const counted = new Map<string, number>();
    for (const line of problems) counted.set(line, (counted.get(line) ?? 0) + 1);
    console.log(`\nSeen on the way (${problems.length}):`);
    for (const [line, times] of counted) console.log(`  ${line}${times > 1 ? ` (${times} times)` : ''}`);
  } else {
    console.log('\nNo console error, failed request or overflow on the way.');
  }
  if (missing.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
