/**
 * Text of the result screen (/result), the "Why it moved" sheet and the share sheet.
 *
 * Rules (CLAUDE.md): short declarative sentences with concrete numbers, one market vocabulary,
 * strengths first, a low price is never mocked. A sentence with a word in braces, such as
 * "{code} leads at {price}.", is a template: the screen puts a sector chip, a price or a change
 * pill in place of each word in braces.
 */
import type { ContrastId, FlagId, Source } from '@/engine';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "SKIL", "SKIL and WLTH", "SKIL, WLTH and NETW". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const head = {
  /** On the chip when the person gave no ticker. */
  noTicker: 'YOU',
  /** "Ages 21 to 24, employed full-time" */
  cohort: (age: string, role: string) => `Ages ${age}, ${role.charAt(0).toLowerCase()}${role.slice(1)}`,
  noOverallTitle: 'No overall price yet',
  noOverall: (min: number) => `An overall price needs ${min} priced sectors.`,
  why: 'Why it moved',
  none: 'None yet',
  /** In the key figures of a first record, in place of the high and the low, which equal the price. */
  listed: 'Sectors listed',
  listedOf: (priced: number, total: number) => `${priced} of ${total}`,
} as const;

/** While the result of a check that was just finished is on its way to the server. */
export const saving = {
  local: 'Saving your result.',
  waiting: 'You are offline. This result was computed on this device. It is saved when you are back online.',
  error: 'The result could not be saved yet. Your answers are kept on this device.',
  retry: 'Try again',
} as const;

/** An older check, opened from the history. */
export const older = {
  line: (day: string) => `This is your check of ${day}.`,
  latest: 'See the latest result',
  missing: 'This check could not be found.',
  failed: 'This check could not be loaded.',
  retry: 'Try again',
} as const;

export const empty = {
  title: 'No result yet',
  line: 'Your result appears here when you finish the check.',
  failed: 'Your result could not be loaded.',
  retry: 'Try again',
} as const;

export const mind = {
  title: 'A note about mood',
  fromCheck: 'You chose "nearly every day" on both questions about mood.',
  fromDaily: (days: number, window: number) => `You logged "very bad" on ${days} of the last ${window} days.`,
  body: 'This check is not a diagnosis. If this continues, consider talking to a professional.',
  /** Template. {number} is a link that dials. */
  help: 'In the United States you can call or text {number}, the Suicide and Crisis Lifeline.',
  number: '988',
} as const;

export const history = {
  title: 'Price history',
  /** Under the chart when the price has moved since the check on this page. */
  today: (price: string, day: string) => `Today's price is ${price}. The quote above is your check of ${day}.`,
  market: 'Open the market',
  oneRecord: 'One record so far. The line starts with your next record.',
  noOverall: 'The chart starts once there is an overall price.',
  version: {
    algo: (v: string) => `Scoring v${v}`,
    bank: (v: string) => `Questions ${v}`,
    norm: (v: string) => `Baseline ${v}`,
  },
} as const;

/** The one-line market comment. Strengths first: leader and top gainer, then laggard and top loser. */
export const market = {
  leads: '{code} leads at {price}.',
  laggard: '{code} is the laggard at {price}.',
  topGainer: '{code} is the top gainer, {change}.',
  topLoser: '{code} is the top loser, {change}.',
  flat: (count: number, band: number) =>
    `Your ${count} priced sectors are within ${band} points of each other. There is no leader and no laggard.`,
  allUp: 'Every sector is up since the last record.',
  allDown: 'Every sector is down since the last record.',
  unchanged: 'No sector moved since the last record.',
  onePriced: 'One sector has a price. Leader and laggard need two.',
  nonePriced: 'No sector has a price yet.',
} as const;

export const timing = {
  title: 'Answer timing',
  note: (count: number, points: string | null, full: string | null) => {
    const first = `${count} ${plural(count, 'answer', 'answers')} came faster than the question could be read. ${plural(count, 'It counts', 'They count')} at a lower weight.`;
    if (points === null || full === null) return first;
    return `${first} That moved the overall price ${points} points toward 100. At full weight it is ${full}.`;
  },
} as const;

export const sectors = {
  title: 'Sectors',
  boardLabel: 'Sector prices',
  hint: 'Tap a sector to see why it moved.',
  covers: (covered: readonly string[], left: readonly string[]) =>
    `The overall price is the mean of ${listOf(covered)}. ${listOf(left)} ${plural(left.length, 'is', 'are')} left out.`,
  unlisted: (codes: readonly string[]) =>
    `${listOf(codes)} ${plural(codes.length, 'is', 'are')} not listed: you did not agree to share body and mind answers.`,
  insufficient: (codes: readonly string[], percent: number) =>
    `${listOf(codes)} ${plural(codes.length, 'has', 'have')} no price: fewer than ${percent}% of ${plural(codes.length, 'its', 'their')} questions were answered.`,
  halted: (day: string) => `Halted since ${day}. A new record resumes it.`,
  interest: (percent: number) =>
    `The interest question was answered another way than the correct one, so SKIL moved ${percent}% of the way toward 100.`,
} as const;

export const shape = {
  title: 'Your shape',
  caption: 'The dashed ring is 100, the issue price. The rim is 130 and the centre is 70.',
  /** Under the pentagon when some sectors have no price. Their spokes are dashed. */
  partial: (codes: readonly string[]) =>
    `${listOf(codes)} ${plural(codes.length, 'has', 'have')} no price, so ${plural(codes.length, 'its spoke is', 'their spokes are')} dashed. The shape joins the sectors that do.`,
  noTypeFlat: (band: number) =>
    `Your priced sectors are within ${band} points of each other. No two lead, so there is no type this time.`,
  noTypeFew: 'A type is the pair of your two highest sectors. It needs two priced sectors.',
} as const;

export const position = {
  title: 'Position',
  lead: (rungs: number) => `Two readings of where you stand on a ladder of ${rungs} rungs.`,
  objective: 'From your prices',
  objectiveDetail: (rung: number, rungs: number, price: string) =>
    `Rung ${rung} of ${rungs}. The mean of your WLTH and SKIL prices is ${price}.`,
  subjective: 'Where you placed yourself',
  subjectiveDetail: (low: number, high: number, rungs: number) => `Rungs ${low} to ${high} of ${rungs}.`,
  gap: 'The gap',
  gapKinds: {
    close: 'The two are close.',
    below: 'You placed yourself lower than your prices suggest.',
    above: 'You placed yourself higher than your prices suggest.',
  },
  gapSize: (rungs: string) => `${rungs} ${rungs === '1' ? 'rung' : 'rungs'} apart.`,
  ladderLabel: (rung: number, low: number, high: number, rungs: number) =>
    `A ladder of ${rungs} rungs. Your prices put you on rung ${rung}. You placed yourself on rungs ${low} to ${high}.`,
  legendObjective: 'From your prices',
  legendSubjective: 'Your own placement',
} as const;

export const contrasts = {
  title: 'Contrasts and checks',
  heading: 'Contrasts',
  lead: 'Places where two parts of your answers point in different directions.',
  none: 'No marked contrast.',
  /** Each line leads with the stronger side. */
  items: {
    c1a: 'You place yourself lower than your wealth and capability prices suggest.',
    c1b: 'You place yourself higher than your wealth and capability prices suggest.',
    c2a: 'Your finances are sound. Your worry about money is heavy.',
    c2b: 'Your worry about money is light. Your finances are limited.',
    c3a: 'You know many kinds of people. You still feel lonely often, which can point to few close ties.',
    c3b: 'You rarely feel lonely. Your circle is small.',
    c4a: 'Your exercise and sleep are good. You rate your health low, so another cause may deserve attention.',
    c4b: 'You rate your health well. Your exercise or sleep is on the low side.',
    c6a: 'Your circumstances are good. Your state of mind is lower than they suggest.',
    c6b: 'Your state of mind is good. Your circumstances are limited.',
  } satisfies Record<ContrastId, string>,
} as const;

export const checks = {
  heading: 'Consistency checks',
  lead: (gradeB: number, gradeC: number) =>
    `Some pairs of answers rarely go together. Each pair found adds points. 0 to ${gradeB - 1} points is grade A, ${gradeB} to ${gradeC - 1} is B, ${gradeC} or more is C.`,
  none: 'No check was triggered.',
  grade: (grade: string, points: number) => `Data grade ${grade}, ${points} ${plural(points, 'point', 'points')}.`,
  points: (points: number) => `${points} ${plural(points, 'point', 'points')}`,
  items: {
    f1: 'You rated your health very good or excellent, and reported 15 or more limited days in the past 30.',
    f2: 'You reported under 30 minutes of activity a week, and said you can run 6 miles or more.',
    f3: 'Your income is in the high tier, and you said you could pay no part of an emergency expense.',
    f4: 'You said you could pay no part of an emergency expense, and reported savings for more than 3 months.',
    f5: 'You know 8 to 10 kinds of people, and reported none of the four kinds of help.',
    f6: 'You are 18 to 20, and reported a master\'s degree or higher.',
    f7: 'You are 18 to 20, and reported being an executive or owning a company of 100 or more.',
    f8: 'You rated your life 9 to 10, and reported little interest nearly every day.',
    f9: 'You chose the best option on every question.',
    f10: 'Many answers came very fast. Less than 70% of the weight was counted.',
    f11: 'You tapped the same position, first or last, on more than 80% of the questions.',
    f12: 'You have under 2 years in your field, and rated yourself as known in the field.',
  } satisfies Record<FlagId, string>,
} as const;

export const actions = {
  share: 'Share my skyline',
  shareShort: 'Share',
  compare: 'Compare with a friend',
  /** After a check that was started from an invite link. */
  compareReady: (ticker: string | null) =>
    ticker ? `Your comparison with ${ticker} is ready.` : 'Your comparison is ready.',
  compareOpen: 'Open the comparison',
  inviteGone: 'The invite you opened is no longer valid. Ask for a new link.',
  /** The row under the actions that leads to the market home. */
  onwardLabel: 'Next',
  market: 'Your market',
  marketDaily: 'Your prices move day by day. A Daily Open takes about 15 seconds.',
  marketPlain: 'Your prices day by day, sector by sector.',
} as const;

export const share = {
  title: 'Share your skyline',
  lead: 'The image has your ticker, your overall price, your five sector prices and your type. It has none of your answers and it does not name your group.',
  shareImage: 'Share image',
  saveImage: 'Save image',
  copyLink: 'Copy link',
  linkNote: 'The link opens the Standing front page.',
  /** "1080 by 1920 pixels, PNG." */
  size: (width: number, height: number) => `${width} by ${height} pixels, PNG.`,
  /** The two shapes of the image. */
  format: 'Image shape',
  formats: {
    story: { name: 'Story', ratio: '9:16' },
    post: { name: 'Post', ratio: '4:5' },
  },
  saved: 'Image saved',
  copied: 'Link copied',
  failed: 'The image could not be made. Try again.',
  copyFailed: 'The link could not be copied.',
  noOverall: 'A share image needs an overall price.',
  fileName: (ticker: string) => `standing-${ticker.toLowerCase()}.png`,
  shareTitle: 'Standing',
} as const;

export const why = {
  title: 'Why it moved',
  /** For one sector, as on the market: "Why SKIL moved". */
  titleFor: (code: string) => `Why ${code} moved`,
  overall: 'Overall price',
  between: (from: string, to: string) => `From your check of ${from} to your check of ${to}.`,
  before: 'Before',
  now: 'Now',
  noPrice: 'No price',
  first: 'This is your first record. There is nothing to compare it with yet. After your next check, this sheet lists the answers that changed and the points each one added.',
  notSaved: 'This opens once your result is saved.',
  noDelta: 'There was no price in one of the two records, so there is no change to break down.',
  noLines: 'No answer that counts toward this price changed.',
  sum: (total: string) => `These add up to ${total} points.`,
  answersLabel: 'Answers that changed',
  skipped: 'Skipped',
  notAsked: 'Not asked',
  sameAnswer: 'Same answer. It counts at another weight because of the answer time.',
  kinds: {
    version: 'The scoring or the baseline changed version.',
    other: 'The combined effect of these changes.',
  },
  extras: {
    daily_state: 'How you felt, from the Daily Open',
    weekly_win: 'How regularly you logged a Weekly Win',
    people_reached: 'How many people you reached, from the People Nudge',
  } as Record<string, string>,
  extraFallback: 'An entry from one of the daily apps',
  sources: {
    questionnaire: null,
    daily_open: 'From the Daily Open',
    payday: 'From the Payday Check',
    weekly_win: 'From the Weekly Win',
    people_nudge: 'From the People Nudge',
    connected: 'From a connected source',
  } satisfies Record<Source, string | null>,
  loading: 'Loading the breakdown',
  failed: 'The breakdown could not be loaded.',
  retry: 'Try again',
} as const;
