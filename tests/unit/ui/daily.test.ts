/**
 * The daily loop on the client: the seven windows of the streak, the days the screen offers to
 * fill in, the counting window of a micro app, the next payday, and how a check question is set.
 */
import { describe, expect, it } from 'vitest';
import type { Streak } from '@/engine';
import { getBank } from '@/engine';
import { isLongQuestion, splitQuestion } from '@/ui/check/question';
import { countWindow, nextPayday, openDays, streakWeek } from '@/ui/market/live';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// 2026-11-20 is a Friday.
const TODAY = '2026-11-20';

function streak(fields: Partial<Streak> & { firstDay?: string }): Streak & { firstDay?: string } {
  return { current: 0, recordedToday: false, lastDay: null, canBackfill: [], ...fields };
}

const states = (week: ReturnType<typeof streakWeek>) => week.map((d) => (d.before ? 'before' : d.recorded ? 'on' : 'off'));

describe('streakWeek', () => {
  it('draws the days before the first check as before, not as missed', () => {
    const week = streakWeek(streak({ current: 1, recordedToday: true, lastDay: TODAY, firstDay: TODAY }), TODAY, WEEKDAYS);
    expect(states(week)).toEqual(['before', 'before', 'before', 'before', 'before', 'before', 'on']);
    expect(week.map((d) => d.label)).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  });

  it('counts a day without a record after the first check as missed', () => {
    const week = streakWeek(
      streak({ current: 1, recordedToday: true, lastDay: TODAY, canBackfill: ['2026-11-19'], firstDay: '2026-11-17' }),
      TODAY,
      WEEKDAYS,
      { days: new Set([TODAY, '2026-11-17']), since: '2026-11-17' },
    );
    expect(states(week)).toEqual(['before', 'before', 'before', 'on', 'off', 'off', 'on']);
  });

  it('keeps a recorded day lit even when it lies before the first check', () => {
    const week = streakWeek(streak({ current: 2, recordedToday: true, lastDay: TODAY, firstDay: TODAY }), TODAY, WEEKDAYS);
    expect(states(week)).toEqual(['before', 'before', 'before', 'before', 'before', 'on', 'on']);
  });

  it('never marks today as before', () => {
    const week = streakWeek(streak({ firstDay: TODAY }), TODAY, WEEKDAYS);
    expect(week[6]).toMatchObject({ recorded: false });
    expect(week[6]?.before).toBeUndefined();
  });

  it('reads an answer without firstDay as before: no day is before', () => {
    const week = streakWeek(streak({ current: 3, recordedToday: true, lastDay: TODAY }), TODAY, WEEKDAYS);
    expect(week.some((d) => d.before)).toBe(false);
    expect(states(week).slice(-3)).toEqual(['on', 'on', 'on']);
  });
});

describe('openDays', () => {
  it('leaves out a day before the first check', () => {
    expect(openDays(streak({ canBackfill: ['2026-11-19'], firstDay: TODAY }))).toEqual([]);
    expect(openDays(streak({ canBackfill: ['2026-11-19'], firstDay: '2026-11-19' }))).toEqual(['2026-11-19']);
    expect(openDays(streak({ canBackfill: ['2026-11-19'] }))).toEqual(['2026-11-19']);
  });
});

describe('countWindow', () => {
  const app = { enabled: true, available: true, recordedToday: false, recordedThisWeek: false, lastDay: null };
  it('is null while the server sends no window', () => {
    expect(countWindow(app)).toBeNull();
  });
  it('reads a window the server sends', () => {
    expect(countWindow({ ...app, window: { have: 1, need: 4, of: 8 } } as typeof app)).toEqual({ have: 1, need: 4, of: 8 });
  });
  it('ignores a window that cannot be drawn', () => {
    for (const window of [{ have: 1, need: 0, of: 8 }, { have: 1, need: 9, of: 8 }, { have: -1, need: 4, of: 8 }, { have: '1', need: 4, of: 8 }]) {
      expect(countWindow({ ...app, window } as unknown as typeof app)).toBeNull();
    }
  });
});

describe('nextPayday', () => {
  it('adds one pay period', () => {
    expect(nextPayday(TODAY, 'weekly')).toBe('2026-11-27');
    expect(nextPayday(TODAY, 'biweekly')).toBe('2026-12-04');
    expect(nextPayday(TODAY, 'monthly')).toBe('2026-12-20');
  });
});

describe('splitQuestion', () => {
  it('sets a closing parenthetical apart and keeps the question mark with the question', () => {
    expect(splitQuestion('How many licences do you hold that required an exam (for example CPA, RN)?')).toEqual({
      main: 'How many licences do you hold that required an exam?',
      aside: '(for example CPA, RN)',
    });
    expect(splitQuestion('Overall, how satisfied are you with your life nowadays? (0 is not at all, 10 is completely)')).toEqual({
      main: 'Overall, how satisfied are you with your life nowadays?',
      aside: '(0 is not at all, 10 is completely)',
    });
  });
  it('leaves a question without one, or with one in the middle, whole', () => {
    expect(splitQuestion('How long did you sleep last night?')).toEqual({ main: 'How long did you sleep last night?', aside: null });
    const middle = 'Add up what you own (savings, investments) and subtract what you owe. Which range is closest?';
    expect(splitQuestion(middle)).toEqual({ main: middle, aside: null });
  });
  it('keeps every word of every question of the bank', () => {
    const bank = getBank();
    for (const item of Object.values(bank.items)) {
      for (const version of item.versions) {
        const { main, aside } = splitQuestion(version.q.en);
        const words = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        expect(words(`${main} ${aside ?? ''}`)).toBe(words(version.q.en));
      }
    }
  });
  it('sets a long question a size smaller', () => {
    expect(isLongQuestion('How long did you sleep last night?')).toBe(false);
    expect(isLongQuestion('x'.repeat(91))).toBe(true);
  });
});
