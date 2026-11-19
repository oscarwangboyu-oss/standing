// Payday Check: three numbers each payday (take-home income, spending, savings), no bank link.
//
// Amounts never leave the device. paydayBandsFor runs on the device and turns the amounts
// into bands: which option of which bank question. The timeline and the server see bands only
// (PaydayBands has no amount field).
//
// Which wealth questions the three numbers can honestly feed, read off bank 2.1:
// - W5 in its "save" wording (income tier high) asks for the share of after-tax income saved.
//   Savings divided by take-home income, averaged over the last pay periods, is that share.
// - W3 asks how many months savings would last. The three numbers are flows, and W3 is a
//   stock, so it cannot be computed from them. It can be bounded: the answer of the last full
//   check gives a range of months, and each payday since adds savings, or takes away a
//   shortfall (spending above income), measured in months of essential spending. The answer
//   is replaced only when the whole range has moved out of the band that was answered.
// - W5 in its "debt" wording (every other tier) asks for the share of income that goes to
//   debt payments. None of the three numbers is a debt payment. It keeps the questionnaire
//   answer.
// - W1 (income before taxes over 12 months, and the routing question), W2 (how an emergency
//   expense would be paid), W4 (net worth) and W6 (a feeling) keep the questionnaire answer:
//   take-home pay is after taxes, and the other three are not flows.

import { bandIndexFor, bandOptionAt, bandOptionFor, bandRangeOf } from '../bands';
import { dayNumber } from '../days';
import { CURRENT, getAlgo } from '../registry';
import { EngineError } from '../types';
import type { Bank, Background, Override, PaydayBands, PaydayParams, Step } from '../types';
import type { CheckView, LiveContribution } from './shared';

export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

/** Pay periods in a year. Calendar facts, not settings. */
export const PAY_PERIODS_PER_YEAR: Readonly<Record<PayFrequency, number>> = Object.freeze({
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
});

/** The one-time setup. Stays on the device. */
export interface PaydaySetup {
  frequency: PayFrequency;
  /** Essential spending in a month: rent, food, transport, insurance, minimum debt payments. */
  essentialMonthly: number;
}

/** The three numbers of one payday. Stay on the device. */
export interface PaydayAmounts {
  /** The payday, YYYY-MM-DD. */
  day: string;
  /** Take-home income of the pay period. */
  income: number;
  /** Spending in the pay period. */
  spending: number;
  /** Saved or invested in the pay period. */
  savings: number;
}

/** What the runway estimate starts from: the months-of-savings answer of the last full check. */
export interface PaydayBaseline {
  /** Day of that check. */
  day: string;
  /** Version key of the months-of-savings question as it was shown, or null when it was not asked. */
  runwayKey: string | null;
  /** Option answered, or null when skipped or not asked. */
  runwayOption: number | null;
}

/** Numbers for the person's own screen. They are computed from amounts and stay on the device. */
export interface PaydayLocal {
  /** Savings divided by income for this payday. null when income is 0. */
  saveShare: number | null;
  /** The same for the payday before, for the comparison of this period with the last. */
  previousSaveShare: number | null;
  /** Mean share over the averaged periods. */
  averageSaveShare: number | null;
  /** Spending divided by income for this payday. null when income is 0. */
  spendShare: number | null;
  previousSpendShare: number | null;
  /** Income of this period scaled to a month. */
  monthlyIncome: number;
  /**
   * Months of essential spending added to savings since the last full check (negative when
   * shortfalls outweigh savings). null without a baseline or without essential spending.
   */
  runwayMonthsSinceCheck: number | null;
}

/** True when the payday check is offered to this person: living on own earnings, in one of the eligible roles. */
export function paydayEligible(bank: Bank, background: Background, algo?: number): boolean {
  const a = getAlgo(algo);
  const context = a.contextOf(bank, background);
  return isEligible(a.live.payday, context.role, context.money);
}

function isEligible(params: PaydayParams, role: string, money: string): boolean {
  return (params.eligibleRoles as string[]).includes(role) && (params.eligibleMoney as string[]).includes(money);
}

/** The runway baseline of a full check, read from its stored steps. */
export function paydayBaselineOf(check: { day: string; steps: readonly Step[] }, algo?: number): PaydayBaseline {
  const itemId = getAlgo(algo).live.payday.runwayItemId;
  const step = check.steps.find((s) => s.id === itemId);
  return { day: check.day, runwayKey: step?.key ?? null, runwayOption: step?.k ?? null };
}

function checkAmount(value: number, what: string, day: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new EngineError(`payday ${day}: ${what} must be a number of 0 or more`);
  }
}

/**
 * Runs on the device. Turns the payday history into the bands of its latest payday.
 *
 * Saving share: savings divided by take-home income, averaged over the last averagePeriods
 * paydays (the mean of the per-period shares; a period with an income of 0 has no share and
 * is left out). The band is the option of the saving-share question the mean falls in.
 *
 * Runway: the answered band of the last full check covers a range of months, [lower, upper).
 * Every payday after that check moves both ends by (savings minus shortfall) divided by
 * essential monthly spending, where shortfall is spending above income. When even the lower
 * end has reached a higher band, that band is the new answer. When even the upper end has
 * dropped to the lower edge of the answered band or below, the band the upper end falls in is
 * the new answer. Otherwise the questionnaire answer stands and `runway` is null. The highest
 * band has no upper end and is never lowered.
 */
export function paydayBandsFor(args: {
  setup: PaydaySetup;
  /** Every payday entered so far, the latest included. Order does not matter. */
  entries: readonly PaydayAmounts[];
  /** From paydayBaselineOf on the last full check. null when there is none. */
  baseline: PaydayBaseline | null;
  bankVersion?: string;
  algo?: number;
}): { bands: PaydayBands; local: PaydayLocal } {
  const params = getAlgo(args.algo).live.payday;
  const bankVersion = args.bankVersion ?? CURRENT.bank;
  const { setup, baseline } = args;
  if (!PAY_FREQUENCIES.includes(setup.frequency)) throw new EngineError('payday setup has no valid pay frequency');
  checkAmount(setup.essentialMonthly, 'essential monthly spending', 'setup');
  if (args.entries.length === 0) throw new EngineError('payday bands need at least one payday');
  const entries = args.entries
    .map((e, order) => {
      checkAmount(e.income, 'income', e.day);
      checkAmount(e.spending, 'spending', e.day);
      checkAmount(e.savings, 'savings', e.day);
      return { ...e, at: dayNumber(e.day), order };
    })
    .sort((x, y) => x.at - y.at || x.order - y.order);
  const latest = entries[entries.length - 1];
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;
  const share = (part: number, income: number): number | null => (income > 0 ? part / income : null);

  // ---- saving share, averaged
  const shares = entries
    .slice(-params.averagePeriods)
    .map((e) => share(e.savings, e.income))
    .filter((s): s is number => s !== null);
  const averageSaveShare = shares.length ? shares.reduce((sum, s) => sum + s, 0) / shares.length : null;
  const saveShare =
    averageSaveShare !== null && shares.length >= params.minPeriods
      ? bandOptionFor(bankVersion, params.saveShare.band, averageSaveShare)
      : null;

  // ---- runway, bounded
  let runway: number | null = null;
  let months: number | null = null;
  if (baseline && setup.essentialMonthly > 0) {
    const since = dayNumber(baseline.day);
    let net = 0;
    for (const e of entries) if (e.at > since) net += e.savings - Math.max(0, e.spending - e.income);
    months = net / setup.essentialMonthly;
    if (baseline.runwayOption !== null && baseline.runwayKey !== null && params.runway.versionKeys.includes(baseline.runwayKey)) {
      const band = params.runway.band;
      const range = bandRangeOf(bankVersion, band, baseline.runwayOption);
      const low = bandIndexFor(bankVersion, band, Math.max(0, range.lower + months));
      if (low > range.index) runway = bandOptionAt(bankVersion, band, low);
      else if (range.upper !== null && range.upper + months <= range.lower) {
        const high = bandIndexFor(bankVersion, band, Math.max(0, range.upper + months));
        if (high < range.index) runway = bandOptionAt(bankVersion, band, high);
      }
    }
  }

  return {
    bands: {
      day: latest.day,
      periods: saveShare === null ? 0 : shares.length,
      saveShare,
      runway,
      baselineDay: baseline ? baseline.day : null,
    },
    local: {
      saveShare: share(latest.savings, latest.income),
      previousSaveShare: previous ? share(previous.savings, previous.income) : null,
      averageSaveShare,
      spendShare: share(latest.spending, latest.income),
      previousSpendShare: previous ? share(previous.spending, previous.income) : null,
      monthlyIncome: (latest.income * PAY_PERIODS_PER_YEAR[setup.frequency]) / 12,
      runwayMonthsSinceCheck: months,
    },
  };
}

// ---------------------------------------------------------------- engine side: bands only

interface IndexedPayday {
  bands: PaydayBands;
  at: number;
  baselineAt: number | null;
}

export interface PaydayIndex {
  /** By payday, in the order stored for equal days. */
  sorted: IndexedPayday[];
}

export function indexPaydays(entries: readonly PaydayBands[]): PaydayIndex {
  const sorted = entries.map((bands) => {
    for (const k of [bands.saveShare, bands.runway]) {
      if (k !== null && !(Number.isInteger(k) && k >= 0)) throw new EngineError(`payday ${bands.day} has an invalid band`);
    }
    return { bands, at: dayNumber(bands.day), baselineAt: bands.baselineDay === null ? null : dayNumber(bands.baselineDay) };
  });
  // Array.prototype.sort is stable: entries of the same day keep their stored order.
  sorted.sort((x, y) => x.at - y.at);
  return { sorted };
}

/** The last payday on or before day `t`, or null when the payday check was not used yet. */
function latestPayday(index: PaydayIndex, t: number): IndexedPayday | null {
  let found: IndexedPayday | null = null;
  for (const p of index.sorted) {
    if (p.at > t) break;
    found = p;
  }
  return found;
}

export function lastPaydayDay(index: PaydayIndex, t: number): number | null {
  return latestPayday(index, t)?.at ?? null;
}

/**
 * The payday contribution on day number `t`: the bands of the latest payday, as overrides.
 * - Nothing for a person the payday check is not offered to.
 * - The saving share replaces the share question only in the wording that asks for it.
 * - The runway band applies only while the check it started from is still the one in force.
 */
export function paydayAt(index: PaydayIndex, t: number, check: CheckView, params: PaydayParams): LiveContribution {
  const overrides: Override[] = [];
  const latest = latestPayday(index, t);
  if (latest && isEligible(params, check.context.role, check.context.money) && !check.excluded.has('W')) {
    const share = check.stepOf(params.shareItemId);
    if (latest.bands.saveShare !== null && share?.key === params.saveShare.versionKey) {
      overrides.push({ itemId: params.shareItemId, k: latest.bands.saveShare, source: 'payday' });
    }
    const runway = check.stepOf(params.runwayItemId);
    if (
      latest.bands.runway !== null &&
      latest.baselineAt === check.dayNumber &&
      runway !== undefined &&
      params.runway.versionKeys.includes(runway.key)
    ) {
      overrides.push({ itemId: params.runwayItemId, k: latest.bands.runway, source: 'payday' });
    }
  }
  return { overrides, extras: [] };
}
