/**
 * Text of the market home (/market) and of "Why it moved", which the market home and the log
 * share. Rules (CLAUDE.md): short declarative sentences with concrete numbers, one market
 * vocabulary, no em dashes, no exclamation marks, nothing invented.
 */

/** Short names of the situations, for the line next to the ticker: "Ages 21 to 24, employed full-time". */
export const roleNames = {
  ug4: "bachelor's student",
  cc: 'community college student',
  grad: 'graduate student',
  emp: 'employed full-time',
  gig: 'part-time or gig work',
  free: 'freelance',
  owner: 'business owner',
  seek: 'looking for work',
  care: 'caring for family',
  ret: 'retired',
  oth: 'other situation',
} as const;

export const market = {
  /** The ticker shown when the person chose none. */
  noTicker: 'YOU',
  cohort: (ages: string, role: string) => `Ages ${ages}, ${role}`,
  sinceYesterday: 'since yesterday',
  /** The first day of the series, after a second check that day. */
  sinceLastCheck: 'since your last check',
  /** The first day of the series, after records made since the check that day. */
  sinceTodaysCheck: "since today's check",
  againstIssue: 'Against the issue price',
  sinceCheck: (day: string) => `Since the full check on ${day}`,
  /** The shown price trails what today's data gives. */
  catchingUp: (target: string, limit: number) =>
    `Today's data points to ${target}. A sector moves at most ${limit} points a day, so the rest carries over to the next days.`,
  noOverall: 'No overall price yet',
  noOverallDetail: 'An overall price needs at least three sectors with a price.',

  today: 'Today',
  sectors: 'Sectors',
  sectorsLabel: 'Sector prices. Tap a sector to see why it moved.',
  history: 'Price history',
  historyCaption: 'One point a day since your first full check. A ring marks a full check. The dashed line is 100, the issue price.',
  historyCaptionVersion: 'A vertical line marks a change of scoring version.',
  historyOneDay: 'The chart starts tomorrow. It needs two days of prices.',
  versionLabel: (algo: number) => `Scoring v${algo}`,
  versionLabelOther: 'New version',
  more: 'Keep it current',
  moreLabel: 'More ways to update your price',

  skylineLit: 'Lights are on in the sectors updated today.',

  /** Short weekday names, Sunday first, for the streak windows. */
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],

  loadError: 'Your prices could not be loaded.',
  retry: 'Try again',
} as const;

/** The Daily Open as the feature of the day. */
export const openFeature = {
  eyebrow: 'Daily Open',
  title: 'Open today',
  detail: 'Three taps about sleep, exercise and how you feel. About 15 seconds.',
  action: 'Open today',
  doneTitle: 'Opened today',
  doneDetail: 'Body and Mind are up to date. Come back tomorrow.',
  doneAction: "See today's open",
  backfillDetail: 'Today is recorded. Yesterday is still open and can be filled in until midnight.',
  backfillAction: 'Fill in yesterday',
  haltedTitle: 'Body and Mind are halted',
  haltedDetail: (days: number) => `No Daily Open for ${days} days, so both prices hold still. Record today to resume.`,
  haltedAction: 'Resume today',
} as const;

/** One line under a sector row. */
export const sectorLines = {
  limit: (limit: number) => `Today's move stopped at the daily limit of ${limit} points. The rest carries over.`,
  resumed: 'Resumed today.',
  halted: {
    B: (days: number) => `No Daily Open for ${days} days. Record today to resume.`,
    M: (days: number) => `No Daily Open for ${days} days. Record today to resume.`,
    W: (days: number) => `No Payday Check for ${days} days. Record a payday to resume.`,
    C: (days: number) => `No Weekly Win for ${days} days. Log a win to resume.`,
    N: (days: number) => `No People Nudge for ${days} days. Log this week to resume.`,
  },
} as const;

export const entries = {
  payday: {
    title: 'Payday Check',
    detail: 'Three numbers each payday. Amounts stay on this device.',
    doneToday: 'Done today',
    last: (day: string) => `Last: ${day}`,
    setUp: 'Set up',
  },
  win: {
    title: 'Weekly Win',
    detail: 'One thing you got better at this week.',
  },
  people: {
    title: 'People Nudge',
    detail: 'Three people to reconnect with, and who you reached.',
  },
  doneThisWeek: 'Done this week',
  dueThisWeek: 'This week',
  log: { title: 'Log', detail: 'Recent moves and what caused them.' },
  result: { title: 'Latest result', detail: 'Your last full check, with your type and your shape.' },
  compare: { title: 'Compare', detail: 'Two skylines side by side, by invite link.' },
  retake: {
    title: 'Retake the check',
    detail: (days: number) => `A full retake is due ${days} days after the last one.`,
    dueDetail: (days: number) => `Your last full check was ${days} days ago.`,
    due: 'Due',
    inProgress: 'In progress',
  },
  settings: { title: 'Settings', detail: 'Recovery code, export and delete.' },
} as const;

/** A check that was started and left. It goes on at the question where it stopped. */
export const checkInProgress = {
  title: 'A check in progress',
  body: (answered: number) =>
    answered === 0
      ? 'You started a check. It goes on at the first question.'
      : `You answered ${answered} ${answered === 1 ? 'question' : 'questions'}. The check goes on at the next one.`,
  action: 'Continue the check',
} as const;

/** The quarterly retake prompt. */
export const retake = {
  title: 'A quarterly retake is due',
  body: (days: number) =>
    `Your last full check was ${days} days ago. A retake prices every sector again from fresh answers.`,
  action: 'Retake the check',
} as const;

/** The mind notice. Calm, first on the screen, and never a diagnosis. */
export const mindNotice = {
  title: 'A note about how you have been feeling',
  fromDaily: (days: number, window: number) =>
    `You marked "very bad" on ${days} or more of the last ${window} days. This is not a diagnosis. If it continues, consider talking to a professional. In the United States you can call or text 988, the Suicide and Crisis Lifeline.`,
  fromCheck:
    'You chose "nearly every day" on both questions about mood in your check. This is not a diagnosis. If it continues, consider talking to a professional. In the United States you can call or text 988, the Suicide and Crisis Lifeline.',
} as const;

/** "Why it moved": the breakdown of one day's move, in a sheet. */
export const moved = {
  title: (code: string) => `Why ${code} moved`,
  dayTitle: (day: string) => `Moves on ${day}`,
  price: 'Price today',
  target: "Today's data gives",
  sinceYesterday: 'since yesterday',
  sinceCheck: 'Since the last full check',
  between: (from: string, to: string) => `From ${from} to ${to}`,
  /** The records of the day of a full check, against what the check gave on its own. */
  afterCheck: (day: string) => `On ${day}, after the full check`,
  targetMove: (from: string, to: string) => `The data moved the target from ${from} to ${to}.`,
  /** What a breakdown explains, and why the shown price can differ. */
  howToRead: (limit: number) =>
    `Each line is one answer or record and the points it added. The lines add up to the change of the target. The shown price follows the target by at most ${limit} points a day.`,
  noLines: 'Nothing changed the target of this sector on that day.',
  /** The sectors of a day with nothing to explain, in one line. */
  quiet: (codes: readonly string[]) => `No change in ${codes.join(', ')}.`,
  noLinesCatchUp: 'The target did not change on that day. The price was still catching up to an earlier change.',
  noMoveYet: 'No record has moved your prices since the last full check.',
  latestMove: (day: string) => `The latest change of your data was on ${day}.`,
  notListed: 'This sector has no price.',
  loading: 'Loading the breakdown',
  error: 'The breakdown could not be loaded.',
  retry: 'Try again',
  before: 'Before',
  after: 'Now',
  skipped: 'Skipped',
  notAsked: 'Not asked',
  /** Lines that are not a question of the check. */
  extras: {
    daily_state: 'How you feel, mean of the last 7 days',
    weekly_win: 'Weeks with a win, of the last 8',
    people_reached: 'People reached, mean of the last 8 weeks',
  } as Record<string, string>,
  extraFallback: 'A record from a micro app',
  version: 'A change of scoring version',
  other: 'The combined effect of several changes',
  sources: {
    questionnaire: 'Check',
    daily_open: 'Daily Open',
    payday: 'Payday Check',
    weekly_win: 'Weekly Win',
    people_nudge: 'People Nudge',
    connected: 'Connected source',
  },
  halted: (day: string) => `Halted since ${day}. The price holds still until a new record arrives.`,
  overall: 'Overall',
} as const;
