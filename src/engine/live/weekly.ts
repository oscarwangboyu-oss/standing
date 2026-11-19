// Weekly Win (capability) and People Nudge (network). The deck names the two apps and no
// rules, so the rules here are designed the way the daily open is: logged data replaces a
// questionnaire answer only where it measures the same thing, and anything else enters as an
// extra item with a modest load.
//
// One entry a week counts. Weeks are calendar weeks that start on Monday; when a week holds
// several entries, the last one is that week's entry.
//
// Capability, read off bank 2.1:
// - C_learn asks for hours of structured learning in the past 12 months. Hours of courses
//   logged are part of that total. The log covers only the weeks since logging began, so it
//   is a lower bound: it replaces the answer only when it reaches a higher band.
// - C_lic asks how many licences or certifications that required an exam the person holds.
//   A new one logged after the last full check is one more than was answered.
// - No other capability question matches an entry (level of work, degree, languages, digital
//   skill, recognition, paid skill, team, clients, own pursuit: none is a weekly quantity).
//   How regularly a person logs a win enters as the extra item "weekly_win".
//
// Network, read off bank 2.1:
// - N5 (wording "base") asks whether the person has a mentor and how often they talk. Reaching
//   a mentor in enough different weeks reads as "a few times a year" or "at least monthly".
//   Again a lower bound: it replaces the answer only upward.
// - N1 (kinds of occupations known), N2 (people to call at 3 a.m.), N3 (help available), N4
//   (groups) and N6 (loneliness) are not counts of people contacted. No question asks how many
//   people the person was in touch with, so people reached enters as the extra item
//   "people_reached".
//
// For both extras a week without an entry counts as a week with nothing: these are logs of
// things done, and a thing not logged is taken as not done.

import { bandOptionFor } from '../bands';
import { dayNumber, weekOf } from '../days';
import { CERTIFICATE_LEVELS, EngineError, NUDGE_CATEGORIES, WEEKLY_WIN_KINDS } from '../types';
import type {
  Extra,
  NudgeCategory,
  Override,
  PeopleNudgeEntry,
  PeopleNudgeParams,
  WeeklyWinEntry,
  WeeklyWinParams,
} from '../types';
import type { CheckView, LiveContribution } from './shared';
import { option } from './shared';

interface Indexed<T> {
  entry: T;
  at: number;
  week: number;
}

export interface WeekIndex<T> {
  /** Every entry by day, in the order stored for equal days. */
  sorted: Array<Indexed<T>>;
}

function indexByDay<T extends { day: string }>(entries: readonly T[]): WeekIndex<T> {
  const sorted = entries.map((entry) => {
    const at = dayNumber(entry.day);
    return { entry, at, week: weekOf(at) };
  });
  sorted.sort((x, y) => x.at - y.at);
  return { sorted };
}

export function indexWeeklyWins(entries: readonly WeeklyWinEntry[], params: WeeklyWinParams): WeekIndex<WeeklyWinEntry> {
  for (const e of entries) {
    if (!WEEKLY_WIN_KINDS.includes(e.kind)) throw new EngineError(`weekly win ${e.day} has no valid kind`);
    if (e.hours !== undefined && e.hours !== null && !option(e.hours, params.learning.midpointHours.length)) {
      throw new EngineError(`weekly win ${e.day} has no hours option ${String(e.hours)}`);
    }
    if (e.level !== undefined && !CERTIFICATE_LEVELS.includes(e.level)) throw new EngineError(`weekly win ${e.day} has no valid level`);
  }
  return indexByDay(entries);
}

export function indexPeopleNudges(entries: readonly PeopleNudgeEntry[]): WeekIndex<PeopleNudgeEntry> {
  for (const e of entries) {
    if (!Number.isInteger(e.planned) || e.planned < 0) throw new EngineError(`people nudge ${e.day} has an invalid planned count`);
    if (!Array.isArray(e.reached) || !e.reached.every((c) => NUDGE_CATEGORIES.includes(c))) {
      throw new EngineError(`people nudge ${e.day} has an invalid category`);
    }
  }
  return indexByDay(entries);
}

/** The last day with an entry on or before day `t`, or null when the app was not used yet. */
export function lastEntryDay<T>(index: WeekIndex<T>, t: number): number | null {
  let last: number | null = null;
  for (const e of index.sorted) {
    if (e.at > t) break;
    last = e.at;
  }
  return last;
}

/** One entry per calendar week, as known on day `t`: the last one of each week. */
function weekly<T>(index: WeekIndex<T>, t: number): Map<number, Indexed<T>> {
  const byWeek = new Map<number, Indexed<T>>();
  for (const e of index.sorted) {
    if (e.at > t) break;
    byWeek.set(e.week, e);
  }
  return byWeek;
}

/**
 * The calendar weeks an extra looks back over on day `t`: the current week and the ones
 * before it once the current week has its entry, otherwise the weeks before the current one.
 * A new week therefore does not count against the person before they had the chance to log.
 */
function windowWeeks(byWeek: ReadonlyMap<number, unknown>, t: number, count: number): number[] {
  const current = weekOf(t);
  const end = byWeek.has(current) ? current : current - 1;
  return Array.from({ length: count }, (_, i) => end - i);
}

/** True when the log implies a higher option than the questionnaire answer (or there is no answer). */
function raises(implied: number, answered: number | null): boolean {
  return answered === null || implied > answered;
}

// ---------------------------------------------------------------- weekly win

export function weeklyWinAt(
  index: WeekIndex<WeeklyWinEntry>,
  t: number,
  check: CheckView,
  params: WeeklyWinParams,
): LiveContribution {
  const overrides: Override[] = [];
  const extras: Extra[] = [];
  const { learning, licence, regularity } = params;
  if (check.excluded.has(regularity.area)) return { overrides, extras };
  const byWeek = weekly(index, t);
  if (byWeek.size === 0) return { overrides, extras };

  // ---- hours of courses in the last 12 months
  const learnStep = check.stepOf(learning.itemId);
  if (learnStep) {
    let weeks = 0;
    let hours = 0;
    for (const { entry, at } of byWeek.values()) {
      if (entry.kind !== 'course' || entry.hours === undefined || entry.hours === null) continue;
      if (at <= t - learning.windowDays) continue;
      weeks++;
      hours += learning.midpointHours[entry.hours];
    }
    if (weeks >= learning.minWeeks) {
      const implied = bandOptionFor(check.bankVersion, learning.band, hours);
      if (raises(implied, learnStep.k)) overrides.push({ itemId: learning.itemId, k: implied, source: 'weekly_win' });
    }
  }

  // ---- licences and certificates with an exam, gained after the check in force
  const licenceStep = check.stepOf(licence.itemId);
  if (licenceStep) {
    let gained = 0;
    let advanced = false;
    for (const { entry, at } of byWeek.values()) {
      if (entry.kind !== 'certificate' || entry.exam !== true || at <= check.dayNumber) continue;
      gained++;
      if (entry.level === 'advanced') advanced = true;
    }
    if (gained > 0) {
      const held = licenceStep.k === null ? 0 : licence.heldForOption[licenceStep.k];
      const total = held + gained;
      let implied: number;
      if (total === 1) implied = advanced ? licence.oneAdvancedOption : licence.oneEntryOption;
      else implied = licence.optionFromTwo[Math.min(total - 2, licence.optionFromTwo.length - 1)];
      if (raises(implied, licenceStep.k)) overrides.push({ itemId: licence.itemId, k: implied, source: 'weekly_win' });
    }
  }

  // ---- regularity: share of the last weeks with a win
  const weeks = windowWeeks(byWeek, t, regularity.windowWeeks);
  const withWin = weeks.filter((w) => byWeek.has(w)).length;
  if (withWin >= regularity.minWeeks) {
    extras.push({
      id: regularity.extraId,
      area: regularity.area,
      load: { [regularity.area]: regularity.load },
      score: withWin / regularity.windowWeeks,
      source: 'weekly_win',
    });
  }
  return { overrides, extras };
}

// ---------------------------------------------------------------- people nudge

const MENTOR: NudgeCategory = 'mentor';

export function peopleNudgeAt(
  index: WeekIndex<PeopleNudgeEntry>,
  t: number,
  check: CheckView,
  params: PeopleNudgeParams,
): LiveContribution {
  const overrides: Override[] = [];
  const extras: Extra[] = [];
  const { reach, mentor, maxPerWeek } = params;
  if (check.excluded.has(reach.area)) return { overrides, extras };
  const byWeek = weekly(index, t);
  if (byWeek.size === 0) return { overrides, extras };

  // ---- contact with a mentor
  const mentorStep = check.stepOf(mentor.itemId);
  if (mentorStep && mentorStep.key === mentor.versionKey) {
    for (const level of mentor.levels) {
      let weeks = 0;
      for (const { entry, at } of byWeek.values()) {
        if (at > t - level.windowDays && entry.reached.includes(MENTOR)) weeks++;
      }
      if (weeks >= level.minWeeks) {
        if (raises(level.option, mentorStep.k)) overrides.push({ itemId: mentor.itemId, k: level.option, source: 'people_nudge' });
        break;
      }
    }
  }

  // ---- people reached out of maxPerWeek, averaged over the last weeks
  const weeks = windowWeeks(byWeek, t, reach.windowWeeks);
  let recorded = 0;
  let reached = 0;
  for (const w of weeks) {
    const e = byWeek.get(w);
    if (!e) continue;
    recorded++;
    reached += Math.min(e.entry.reached.length, maxPerWeek);
  }
  if (recorded >= reach.minWeeks) {
    extras.push({
      id: reach.extraId,
      area: reach.area,
      load: { [reach.area]: reach.load },
      score: reached / (maxPerWeek * reach.windowWeeks),
      source: 'people_nudge',
    });
  }
  return { overrides, extras };
}
