// Payday Check: three numbers each payday, turned into bands on the device. Eligibility, the
// band conversion at every edge, the three-payday average, the bounded runway estimate, and
// what the timeline does with the bands.

import { describe, expect, it } from 'vitest';
import {
  ALGO_PARAMS,
  EngineError,
  addDays,
  compute,
  paydayBandsFor,
  paydayBaselineOf,
  paydayEligible,
  timeline,
  timelineInputOn,
} from '../../../src/engine';
import type { PaydayAmounts, PaydayBands, PaydayBaseline, PaydaySetup, RoleId } from '../../../src/engine';
import { backgroundFor, bank, walk } from './helpers';

const D = '2026-03-02';
const day = (n: number): string => addDays(D, n);
const setup: PaydaySetup = { frequency: 'biweekly', essentialMonthly: 2000 };
const P = ALGO_PARAMS[1].payday;
const versionOf = (id: string, key: string) => bank.items[id].versions.find((v) => v.key === key)!;
const payday = (n: number, income: number, spending: number, savings: number): PaydayAmounts => ({ day: day(n), income, spending, savings });

describe('who the payday check is offered to', () => {
  it('own income, and employed full-time, part-time or gig, freelance, or owner', () => {
    expect(P.eligibleRoles).toEqual(['emp', 'gig', 'free', 'owner']);
    expect(P.eligibleMoney).toEqual(['own']);
    const eligible = (role: RoleId, money?: number): boolean =>
      paydayEligible(bank, backgroundFor(role, money === undefined ? {} : { money }));
    expect(eligible('emp')).toBe(true);
    expect(eligible('free')).toBe(true);
    expect(eligible('owner')).toBe(true);
    // Gig workers are asked what pays for their living: own earnings, family, a partner, grants, savings.
    expect(eligible('gig', 0)).toBe(true);
    for (const other of [1, 2, 3]) expect(eligible('gig', other), `gig money ${other}`).toBe(false);
    // The bank routes "Savings, a pension, benefits or other" as own money, so that answer is eligible too.
    expect(bank.moneyIds).toEqual(['own', 'sup', 'hh', 'sup', 'own']);
    expect(eligible('gig', 4)).toBe(true);
    for (const role of ['ug4', 'cc', 'grad', 'seek', 'care', 'ret', 'oth'] as RoleId[]) {
      expect(eligible(role, 0), role).toBe(false);
    }
  });
});

describe('saving share: savings divided by take-home income, as a band of W5 "save"', () => {
  const optionFor = (savings: number, income = 1000): number | null =>
    paydayBandsFor({ setup, entries: [payday(14, income, 600, savings)], baseline: null }).bands.saveShare;

  it.each([
    [0, 'Under 5%'],
    [49, 'Under 5%'],
    [50, '5% to 9%'],
    [99, '5% to 9%'],
    [100, '10% to 19%'],
    [199, '10% to 19%'],
    [200, '20% to 34%'],
    [349, '20% to 34%'],
    [350, '35% or more'],
    [1000, '35% or more'],
    // Saving more than was earned (a transfer from elsewhere) is still the top band.
    [1500, '35% or more'],
  ] as Array<[number, string]>)('$%i saved of $1,000 is "%s"', (savings, text) => {
    expect(versionOf('W5', 'save').opts[optionFor(savings) as number].en).toBe(text);
  });

  it('is the mean of the last three paydays', () => {
    expect(P.averagePeriods).toBe(3);
    // 10%, 20% and 36%: 22%.
    const three = [payday(14, 1000, 700, 100), payday(28, 1000, 700, 200), payday(42, 1000, 600, 360)];
    const result = paydayBandsFor({ setup, entries: three, baseline: null });
    expect(result.local.averageSaveShare).toBeCloseTo(0.22, 12);
    expect(result.bands).toEqual({ day: day(42), periods: 3, saveShare: 3, runway: null, baselineDay: null });
    // A fourth payday pushes the first out: 20%, 36% and 0% give 18.67%.
    const four = [...three, payday(56, 1000, 1000, 0)];
    const next = paydayBandsFor({ setup, entries: four, baseline: null });
    expect(next.local.averageSaveShare).toBeCloseTo(0.56 / 3, 12);
    expect(next.bands).toMatchObject({ day: day(56), periods: 3, saveShare: 2 });
    // The order the entries are stored in does not matter.
    expect(paydayBandsFor({ setup, entries: [...four].reverse(), baseline: null }).bands).toEqual(next.bands);
  });

  it('with one or two paydays it is the mean of those', () => {
    expect(P.minPeriods).toBe(1);
    expect(paydayBandsFor({ setup, entries: [payday(14, 1000, 700, 100)], baseline: null }).bands).toMatchObject({ periods: 1, saveShare: 2 });
    const two = paydayBandsFor({ setup, entries: [payday(14, 1000, 700, 100), payday(28, 1000, 700, 0)], baseline: null });
    expect(two.bands).toMatchObject({ periods: 2, saveShare: 1 });
  });

  it('averages the shares, not the amounts, and leaves out a period without income', () => {
    // 50% of a small pay and 0% of a large one: 25%. Total savings over total income would be 5%.
    const uneven = paydayBandsFor({ setup, entries: [payday(14, 1000, 500, 500), payday(28, 9000, 9000, 0)], baseline: null });
    expect(uneven.local.averageSaveShare).toBe(0.25);
    expect(uneven.bands.saveShare).toBe(3);
    const gap = paydayBandsFor({ setup, entries: [payday(14, 1000, 700, 100), payday(28, 0, 400, 0)], baseline: null });
    expect(gap.bands).toMatchObject({ periods: 1, saveShare: 2 });
    expect(gap.local.saveShare).toBeNull();
    const none = paydayBandsFor({ setup, entries: [payday(14, 0, 400, 0)], baseline: null });
    expect(none.bands).toEqual({ day: day(14), periods: 0, saveShare: null, runway: null, baselineDay: null });
  });
});

describe('months of savings: a range that the paydays move', () => {
  // The check said "1 to 3 months": between 1 and 3 months of essential spending ($2,000).
  const baseline: PaydayBaseline = { day: D, runwayKey: 'base', runwayOption: 2 };
  const runwayFor = (entries: PaydayAmounts[], from: PaydayBaseline | null = baseline, s: PaydaySetup = setup): number | null =>
    paydayBandsFor({ setup: s, entries, baseline: from }).bands.runway;
  const texts = versionOf('W3', 'base').opts.map((o) => o.en);

  it('reads the baseline off the stored steps of the check', () => {
    const steps = walk(backgroundFor('emp'), () => 2);
    expect(paydayBaselineOf({ day: D, steps })).toEqual(baseline);
    expect(paydayBaselineOf({ day: D, steps: steps.map((s) => (s.id === 'W3' ? { ...s, k: null } : s)) }).runwayOption).toBeNull();
    expect(paydayBaselineOf({ day: D, steps: [] })).toEqual({ day: D, runwayKey: null, runwayOption: null });
    expect(texts).toEqual(['Less than 2 weeks', '2 weeks to 1 month', '1 to 3 months', '3 to 6 months', 'More than 6 months']);
  });

  it.each([
    // Saved since the check, in dollars; months it adds; the answer it proves.
    [0, null],
    [3999, null],
    // 2 months on top of at least 1: at least 3.
    [4000, '3 to 6 months'],
    // At least 6.0 is still "3 to 6"; "More than 6" starts above 6.
    [10000, '3 to 6 months'],
    [10001, 'More than 6 months'],
  ] as Array<[number, string | null]>)('$%i saved since the check: %s', (saved, text) => {
    const option = runwayFor([payday(14, 20000, 0, saved)]);
    expect(option === null ? null : texts[option]).toBe(text);
  });

  it.each([
    // Spent above income since the check, in dollars.
    [4000, null],
    // The upper end, 3 months, less 2.0005: under 1 month for certain.
    [4001, '2 weeks to 1 month'],
    [5000, '2 weeks to 1 month'],
    [5001, 'Less than 2 weeks'],
    [90000, 'Less than 2 weeks'],
  ] as Array<[number, string | null]>)('$%i spent above income since the check: %s', (shortfall, text) => {
    const option = runwayFor([payday(14, 1000, 1000 + shortfall, 0)]);
    expect(option === null ? null : texts[option]).toBe(text);
  });

  it('adds up every payday after the check, and none on or before its day', () => {
    expect(runwayFor([payday(14, 3000, 1000, 2000), payday(28, 3000, 1000, 2000)])).toBe(3);
    expect(runwayFor([payday(14, 3000, 1000, 2000)])).toBeNull();
    expect(runwayFor([payday(0, 9000, 0, 9000), payday(-14, 9000, 0, 9000)])).toBeNull();
    // Savings and a shortfall in different periods offset each other.
    expect(runwayFor([payday(14, 5000, 1000, 4000), payday(28, 1000, 5000, 0)])).toBeNull();
    const result = paydayBandsFor({ setup, entries: [payday(14, 5000, 1000, 4000), payday(28, 1000, 2000, 0)], baseline });
    expect(result.local.runwayMonthsSinceCheck).toBe(1.5);
    expect(result.bands.baselineDay).toBe(D);
  });

  it('the highest band is never lowered, and without a usable baseline there is no estimate', () => {
    const drain = [payday(14, 1000, 91000, 0)];
    expect(runwayFor(drain, { day: D, runwayKey: 'base', runwayOption: 4 })).toBeNull();
    expect(runwayFor(drain, { day: D, runwayKey: 'base', runwayOption: 3 })).toBe(0);
    const windfall = [payday(14, 90000, 0, 90000)];
    expect(runwayFor(windfall, { day: D, runwayKey: 'base', runwayOption: 0 })).toBe(4);
    // Skipped at the check, a wording in other units, no check, or no essential spending.
    expect(runwayFor(windfall, { day: D, runwayKey: 'base', runwayOption: null })).toBeNull();
    expect(runwayFor(windfall, { day: D, runwayKey: 'ret', runwayOption: 1 })).toBeNull();
    expect(runwayFor(windfall, null)).toBeNull();
    expect(runwayFor(windfall, baseline, { frequency: 'monthly', essentialMonthly: 0 })).toBeNull();
  });
});

describe('amounts stay on the device', () => {
  it('the bands hold option indices, a count and days, and nothing else', () => {
    const { bands, local } = paydayBandsFor({
      setup,
      entries: [payday(14, 4321.09, 2345.67, 987.65), payday(28, 4321.09, 2000, 1234.56)],
      baseline: { day: D, runwayKey: 'base', runwayOption: 2 },
    });
    expect(Object.keys(bands).sort()).toEqual(['baselineDay', 'day', 'periods', 'runway', 'saveShare']);
    for (const value of [bands.periods, bands.saveShare, bands.runway]) {
      expect(value === null || (Number.isInteger(value) && value >= 0 && value <= 4)).toBe(true);
    }
    expect(JSON.stringify(bands)).not.toMatch(/4321|2345|987|1234|2000/);
    // The numbers for the person's own screen are separate.
    expect(local.saveShare).toBeCloseTo(1234.56 / 4321.09, 12);
    expect(local.previousSaveShare).toBeCloseTo(987.65 / 4321.09, 12);
    expect(local.spendShare).toBeCloseTo(2000 / 4321.09, 12);
    expect(local.monthlyIncome).toBeCloseTo((4321.09 * 26) / 12, 9);
  });

  it('refuses amounts that are not numbers of 0 or more, and an unknown pay frequency', () => {
    expect(() => paydayBandsFor({ setup, entries: [payday(14, -1, 0, 0)], baseline: null })).toThrow(EngineError);
    expect(() => paydayBandsFor({ setup, entries: [payday(14, 1000, Number.NaN, 0)], baseline: null })).toThrow(EngineError);
    expect(() => paydayBandsFor({ setup, entries: [], baseline: null })).toThrow(EngineError);
    expect(() => paydayBandsFor({ setup: { frequency: 'daily' as never, essentialMonthly: 1 }, entries: [payday(14, 1, 1, 1)], baseline: null })).toThrow(EngineError);
  });
});

describe('what the timeline does with payday bands', () => {
  const emp = backgroundFor('emp');
  // Income in the top band: W5 is asked as the share saved. Everything else the middle option.
  const high = walk(emp, (q) => (q.id === 'W1' ? 6 : 2));
  const middle = walk(emp, () => 2);
  const bands = (n: number, saveShare: number | null, runway: number | null, baselineDay: string | null = D): PaydayBands => ({
    day: day(n),
    periods: saveShare === null ? 0 : 1,
    saveShare,
    runway,
    baselineDay,
  });

  it('the saving share replaces W5 where W5 asks for the share saved, with source "payday"', () => {
    expect(high.find((s) => s.id === 'W5')?.key).toBe('save');
    const history = { checks: [{ day: D, background: emp, steps: high }], paydays: [bands(14, 4, null)] };
    expect(timelineInputOn(history, day(13))?.overrides).toEqual([]);
    const input = timelineInputOn(history, day(14))!;
    expect(input.overrides).toEqual([{ itemId: 'W5', k: 4, source: 'payday' }]);
    const result = compute(input);
    expect(result.steps.find((s) => s.id === 'W5')).toMatchObject({ k: 4, answeredK: 2, overridden: true, source: 'payday', multiplier: 1 });
    expect(result.sectors.W.price as number).toBeGreaterThan(compute({ bank, background: emp, steps: high }).sectors.W.price as number);
  });

  it('the debt wording of W5 keeps the questionnaire answer: the three numbers hold no debt payment', () => {
    expect(middle.find((s) => s.id === 'W5')?.key).toBe('debt');
    const history = { checks: [{ day: D, background: emp, steps: middle }], paydays: [bands(14, 4, null)] };
    expect(timelineInputOn(history, day(14))?.overrides).toEqual([]);
    const series = timeline({ ...history, until: day(20) });
    expect(new Set(series.points.map((p) => p.sectors.W.price)).size).toBe(1);
  });

  it('the runway band replaces W3 while the check it started from is in force', () => {
    const second = { day: day(30), background: emp, steps: middle };
    const history = { checks: [{ day: D, background: emp, steps: middle }], paydays: [bands(14, null, 4)] };
    expect(timelineInputOn(history, day(14))?.overrides).toEqual([{ itemId: 'W3', k: 4, source: 'payday' }]);
    // A new full check asks the question again: the old estimate no longer applies.
    expect(timelineInputOn({ ...history, checks: [...history.checks, second] }, day(30))?.overrides).toEqual([]);
    // A payday estimated from the new check applies again.
    const later = { checks: [...history.checks, second], paydays: [...history.paydays, bands(44, null, 3, day(30))] };
    expect(timelineInputOn(later, day(44))?.overrides).toEqual([{ itemId: 'W3', k: 3, source: 'payday' }]);
  });

  it('the latest payday counts, and a person the check is not offered to gets nothing', () => {
    const history = { checks: [{ day: D, background: emp, steps: high }], paydays: [bands(28, 1, null), bands(14, 4, null)] };
    expect(timelineInputOn(history, day(20))?.overrides).toEqual([{ itemId: 'W5', k: 4, source: 'payday' }]);
    expect(timelineInputOn(history, day(28))?.overrides).toEqual([{ itemId: 'W5', k: 1, source: 'payday' }]);
    const student = backgroundFor('ug4');
    const studentSteps = walk(student, (q) => (q.id === 'W1' ? 5 : 2));
    const other = { checks: [{ day: D, background: student, steps: studentSteps }], paydays: [bands(14, 4, 4)] };
    expect(timelineInputOn(other, day(14))?.overrides).toEqual([]);
  });

  it('wealth moves at most 2 points a day toward the new price', () => {
    const series = timeline({ checks: [{ day: D, background: emp, steps: high }], paydays: [bands(14, 0, 0)], until: day(30) });
    const wealth = series.points.map((p) => p.sectors.W);
    const drop = (wealth[13].price as number) - (wealth[14].target as number);
    expect(drop).toBeGreaterThan(2);
    expect(wealth[14].price).toBeCloseTo((wealth[13].price as number) - 2, 12);
    for (let i = 1; i < wealth.length; i++) {
      expect(Math.abs((wealth[i].price as number) - (wealth[i - 1].price as number))).toBeLessThanOrEqual(2 + 1e-12);
    }
    expect(wealth[30].price).toBe(wealth[30].target);
  });
});
