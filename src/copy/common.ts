/**
 * Interface text shared by the design-system components in src/ui.
 * Screen-specific text lives in its own file in this folder.
 * Rules (CLAUDE.md): short declarative sentences, one market vocabulary,
 * no em dashes, no exclamation marks, nothing invented.
 */

export const brand = {
  name: 'Standing',
  company: 'Bayu Technology',
  place: 'Atlanta, Georgia',
  email: 'teambayutech@gmail.com',
  /**
   * The site address printed on the share image, without https://, such as "example.com".
   * null until the domain is bound; the image leaves the line out while it is null.
   */
  host: null as string | null,
  /** Plain statement of what the product is. Used for the page description and the manifest. */
  description:
    'Standing is a whole-person check. It prices five sectors of a person like stocks: body, mind, wealth, capability and network. 100 is the median of the same age band and situation.',
} as const;

/** Sector names by ticker code, in display order. */
export const sectorNames = {
  SKIL: 'Capability',
  WLTH: 'Wealth',
  NETW: 'Network',
  BODY: 'Body',
  MIND: 'Mind',
} as const;

/** Tags on a sector. One vocabulary, used everywhere. */
export const tagLabels = {
  leader: 'Leader',
  laggard: 'Laggard',
  limit_up: 'Limit up',
  limit_down: 'Limit down',
  halted: 'Halted',
  resumed: 'Resumed',
  sample: 'Sample data',
} as const;

export const quote = {
  firstRecord: 'First record, no change yet',
  sinceLast: 'since the last record',
  issuePrice: 'Issue price',
  high: 'All-time high',
  low: 'All-time low',
  grade: 'Data grade',
  notEnoughData: 'Not enough data',
  notListed: 'Not listed',
  halted: 'Halted',
  overall: 'Overall',
  /** Read aloud before a change. The arrow and the sign carry the same fact visually. */
  up: 'up',
  down: 'down',
  unchanged: 'unchanged',
} as const;

export const board = {
  /** Accessible name of the position bar: where a price sits against the issue price. */
  position: (price: string) => `${price} against the issue price of 100, on a scale from 70 to 130`,
  scaleLow: '70',
  scaleMid: '100',
  scaleHigh: '130',
  history: (name: string) => `${name}, recent records`,
} as const;

/** The skyline illustration, read aloud. */
export const skyline = {
  describe: (parts: readonly string[]) =>
    `Skyline of five towers, one for each sector. ${parts.join(', ')}. The horizon is 100, the median.`,
  building: 'Skyline under construction. Each tower gains a floor when a question is answered.',
  unlisted: 'not listed',
  insufficient: 'not enough data',
  halted: 'halted',
  horizon: 'The horizon is 100',
} as const;

export const chart = {
  /** Accessible name of a price chart with few enough records to read out. */
  listed: (name: string, values: readonly string[]) =>
    `${name} over ${values.length} ${values.length === 1 ? 'record' : 'records'}: ${values.join(', ')}`,
  /** Accessible name of a longer price chart. */
  summary: (name: string, count: number, first: string, last: string, high: string, low: string) =>
    `${name} over ${count} records. First ${first}, latest ${last}, high ${high}, low ${low}`,
  overall: 'Overall price',
  fullCheck: 'Full check',
  versionChange: 'Version change',
  issueLine: 'Issue price 100',
  pentagon: (parts: readonly string[]) =>
    `Pentagon chart of five sector prices. ${parts.join(', ')}. The ring at 100 is the issue price.`,
  ruler: (value: string) => `Scale from 55 to 145. This price is ${value}. 100 is the median.`,
  rulerMedian: 'median',
  /** Under a sector code of the pentagon when the sector has no price. */
  noPrice: 'No price',
} as const;

export const nav = {
  label: 'Main',
  market: 'Market',
  open: 'Open',
  log: 'Log',
  settings: 'Settings',
} as const;

export const streak = {
  label: 'Last 7 days',
  today: 'Today',
  recorded: 'recorded',
  missed: 'missed',
  pending: 'not recorded yet',
  /** A day before the first check: there was no price to keep yet. */
  before: 'before your first check',
  /** "6 days in a row" */
  count: (days: number) => `${days} ${days === 1 ? 'day' : 'days'} in a row`,
  /** In place of the figure while the run is 0. */
  none: 'No run yet. Open today to start one.',
} as const;

export const useful = {
  question: 'Was this part useful?',
  yes: 'Yes',
  no: 'No',
  thanks: 'Noted. Thank you.',
} as const;

export const sheet = {
  close: 'Close',
} as const;

export const progress = {
  /** "Question 25 of 34" */
  position: (current: number, total: number) => `Question ${current} of ${total}`,
  /** "3 of 6 in Body" */
  inSector: (current: number, total: number, sector: string) => `${current} of ${total} in ${sector}`,
} as const;

export const optionList = {
  label: 'Answers',
} as const;

export const skeleton = {
  loading: 'Loading',
} as const;

export const typeCard = {
  label: 'Your type',
  /** Under the name: which two sectors lead. */
  pair: (a: string, b: string) => `${a} and ${b} are your two highest sectors.`,
} as const;

export const notes = {
  /** The baseline is provisional until real data replaces it. This note stays on the result until then. */
  baselineTitle: 'The baseline is provisional',
  baseline:
    '100 stands in for the median of your group until enough people have taken the check. Prices will be re-based when real data replaces it.',
} as const;

export const shareCard = {
  label: 'Share image',
  type: 'Type',
  overall: 'Overall',
  /** The baseline is provisional until real data replaces it, and the image says so. */
  baseline: '100 is the provisional median of my group.',
  disclaimer: 'A personal index. Not a security.',
  site: 'Standing',
  alt: (ticker: string, price: string, type: string | null) =>
    `Share image for ${ticker}. Overall ${price}.${type ? ` Type: ${type}.` : ''} A skyline of five towers at dusk.`,
} as const;

/** The statements the product must make. Shown in the footer of every page. */
export const statements = {
  notAdvice: 'Standing is not a medical diagnosis, not financial advice and not a credit score.',
  notSecurity:
    'The price is a way of showing a personal index. It is not a security and it cannot be traded.',
} as const;

export const footer = {
  label: 'About',
  statementsLabel: 'Statements',
} as const;
