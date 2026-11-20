/**
 * The live price of one person: everything stored about them, handed to the engine's timeline.
 *
 * Nothing derived is stored. Every call reads the raw records (completed checks with their
 * question events, daily entries, payday bands, weekly wins, people nudges), and the engine
 * computes the day-by-day series from them. A year of full history costs a few milliseconds.
 *
 * Days. A micro-app entry carries the device's local date. A check counts from the device's
 * local date on which it was completed (sessions.completed_local_day). For checks completed
 * before that column existed: the local date on which it was started (sessions.local_day) when
 * that is within a day of the UTC completion date, which is every check finished in one
 * sitting, and the UTC date of completion otherwise.
 */
import { HEALTH_AREAS, type DayPrices, type FeatureFlags, type LiveApp, type LiveSector, type MeLive } from '../shared/api';
import {
  ALGOS,
  AREA_IDS,
  BANKS,
  NORMS,
  NUDGE_CATEGORIES,
  dailyStreak,
  dayNumber,
  getAlgo,
  getBank,
  paydayBaselineOf,
  paydayEligible,
  timeline,
  weekOf,
  type AreaId,
  type DailyEntry,
  type NudgeCategory,
  type PaydayBands,
  type PeopleNudgeEntry,
  type PersonHistory,
  type Step,
  type Timeline,
  type TimelineCheck,
  type TimelineOptions,
  type TimelinePoint,
  type VersionChange,
  type WeeklyWinEntry,
} from '../engine';
import type { UserRow } from './auth';
import { SERIES_DECIMALS } from './config';
import type { Db } from './db';
import { first } from './db';
import { daysBetween } from './http';
import { backgroundOf, excludedAreasOf, stepOf, type EventRow, type SessionRow } from './sessions';
import { versionMarkers } from './versions';

/**
 * The day a completed check counts from. The device's local date at completion when the client
 * sent it; otherwise the rule at the top of this file.
 */
export function checkDayOf(session: { local_day: string; completed_at: string | null; completed_local_day?: string | null }): string {
  if (session.completed_at === null) return session.local_day;
  if (session.completed_local_day) return session.completed_local_day;
  const done = session.completed_at.slice(0, 10);
  return Math.abs(daysBetween(session.local_day, done)) <= 1 ? session.local_day : done;
}

export interface LoadedCheck {
  sessionId: string;
  day: string;
  session: SessionRow;
  steps: Step[];
}

/** Everything stored about one person that the timeline reads. */
export interface LoadedPerson {
  /** Completed checks, oldest first. Checks answered with a bank this build no longer knows are left out. */
  checks: LoadedCheck[];
  history: PersonHistory;
  options: TimelineOptions;
  /** The last day anything was recorded for: a check or an entry. null without a check. */
  lastRecordedDay: string | null;
}

interface DailyRow {
  day: string;
  logged_on: string;
  sleep: number | null;
  exercise: number | null;
  state: number | null;
}

interface PaydayRow {
  day: string;
  periods: number;
  save_share: number | null;
  runway: number | null;
  baseline_day: string | null;
}

interface WinRow {
  day: string;
  kind: WeeklyWinEntry['kind'];
  hours: number | null;
  exam: boolean | null;
  level: WeeklyWinEntry['level'] | null;
}

type NudgeRow = { day: string; planned: number } & Record<`reached_${NudgeCategory}`, number>;

const SESSION_COLUMNS = `id, user_id, created_at, completed_at, completed_local_day, local_day, age, role, extra,
  us_state, ticker, lang, bank_version, health_consent`;

/**
 * The versions the series starts with and the days they changed, from the version log. Without
 * a logged change of algorithm or norm the engine's current versions apply to every day.
 */
async function versionOptions(db: Db, firstSessionId: string, today: string): Promise<TimelineOptions> {
  const changes: VersionChange[] = [];
  for (const marker of await versionMarkers(db, today)) {
    if (marker.kind === 'algo') changes.push({ day: marker.day, versions: { algo: Number(marker.version) } });
    else if (marker.kind === 'norm') changes.push({ day: marker.day, versions: { norm: marker.version } });
  }
  if (changes.length === 0) return {};
  // Before the first logged change the versions were those of the person's first stored result.
  const base = await first<{ algo_version: number; norm_version: string }>(
    db,
    'select algo_version, norm_version from results where session_id = $1 order by computed_at, algo_version limit 1',
    [firstSessionId],
  );
  const registered = base !== null && Object.hasOwn(ALGOS, base.algo_version) && Object.hasOwn(NORMS, base.norm_version);
  return {
    versions: registered ? { algo: base.algo_version, norm: base.norm_version } : undefined,
    versionChanges: changes,
  };
}

/** Reads everything the timeline needs about one person. Five reads, plus two when a version changed. */
/**
 * `health` is whether the person holds the Body and Mind consent now. Without it every check is
 * read without Body and Mind and the Daily Open records are left out, from the moment the
 * consent is withdrawn: the live price shows those two sectors as not listed. The stored
 * records themselves are untouched until the person deletes their data.
 */
export async function loadPerson(db: Db, userId: string, today: string, health: boolean): Promise<LoadedPerson> {
  const sessions = (
    await db.query<SessionRow>(
      `select ${SESSION_COLUMNS} from sessions where user_id = $1 and completed_at is not null
       order by completed_at, id`,
      [userId],
    )
  ).filter((s) => Object.hasOwn(BANKS, s.bank_version));
  if (sessions.length === 0) return { checks: [], history: { checks: [] }, options: {}, lastRecordedDay: null };

  const events = await db.query<EventRow & { session_id: string }>(
    `select e.session_id, e.seq, e.action, e.item_id, e.version_key, e.lang, e.option_index, e.seconds,
       e.display_direction, e.click_position
     from question_events e join sessions s on s.id = e.session_id
     where s.user_id = $1 and s.completed_at is not null and e.action <> 'shown'
     order by e.session_id, e.seq`,
    [userId],
  );
  const stepsBySession = new Map<string, Step[]>();
  for (const event of events) {
    const list = stepsBySession.get(event.session_id) ?? [];
    list.push(stepOf(event));
    stepsBySession.set(event.session_id, list);
  }
  const checks: LoadedCheck[] = sessions.map((session) => ({
    sessionId: session.id,
    day: checkDayOf(session),
    session,
    steps: stepsBySession.get(session.id) ?? [],
  }));

  // The four micro-app tables at once: on a hosted database each read is a round trip.
  const [dailyRows, paydayRows, winRows, nudgeRows] = await Promise.all([
    db.query<DailyRow>('select day, logged_on, sleep, exercise, state from daily_entries where user_id = $1 order by day', [userId]),
    db.query<PaydayRow>(
      'select day, periods, save_share, runway, baseline_day from payday_entries where user_id = $1 order by at, id',
      [userId],
    ),
    db.query<WinRow>('select day, kind, hours, exam, level from weekly_wins where user_id = $1 order by at, id', [userId]),
    db.query<NudgeRow>(
      `select day, planned, reached_family, reached_friend, reached_mentor, reached_work, reached_other
       from people_nudges where user_id = $1 order by at, id`,
      [userId],
    ),
  ]);

  const timelineChecks: TimelineCheck[] = checks.map((c) => ({
    day: c.day,
    background: backgroundOf(c.session),
    steps: c.steps,
    bankVersion: c.session.bank_version,
    excludedAreas: health ? excludedAreasOf(c.session) : [...HEALTH_AREAS],
  }));
  const daily: DailyEntry[] = (health ? dailyRows : []).map((r) => ({
    day: r.day,
    loggedOn: r.logged_on,
    sleep: r.sleep,
    exercise: r.exercise,
    state: r.state,
  }));
  const paydays: PaydayBands[] = paydayRows.map((r) => ({
    day: r.day,
    periods: r.periods,
    saveShare: r.save_share,
    runway: r.runway,
    baselineDay: r.baseline_day,
  }));
  const weeklyWins: WeeklyWinEntry[] = winRows.map((r) => {
    const entry: WeeklyWinEntry = { day: r.day, kind: r.kind, hours: r.hours };
    if (r.exam !== null) entry.exam = r.exam;
    if (r.level !== null && r.level !== undefined) entry.level = r.level;
    return entry;
  });
  const peopleNudges: PeopleNudgeEntry[] = nudgeRows.map((r) => ({
    day: r.day,
    planned: r.planned,
    // One list entry per person reached, as the engine counts them.
    reached: NUDGE_CATEGORIES.flatMap((category) => Array.from({ length: r[`reached_${category}`] }, () => category)),
  }));

  let lastRecordedDay = checks[0].day;
  const later = (day: string) => {
    if (day > lastRecordedDay) lastRecordedDay = day;
  };
  for (const c of checks) later(c.day);
  for (const r of dailyRows) later(r.logged_on);
  for (const r of [...paydayRows, ...winRows, ...nudgeRows]) later(r.day);

  return {
    checks,
    history: { checks: timelineChecks, daily, paydays, weeklyWins, peopleNudges },
    options: await versionOptions(db, checks[0].sessionId, today > lastRecordedDay ? today : lastRecordedDay),
    lastRecordedDay,
  };
}

/** The check in force: the one with the latest day, and among those of one day the last completed. */
export function latestCheck(person: LoadedPerson): LoadedCheck | null {
  let latest: LoadedCheck | null = null;
  for (const check of person.checks) if (latest === null || check.day >= latest.day) latest = check;
  return latest;
}

/**
 * The last day of the series: `today`, or the last recorded day when that is later. The server
 * falls back to its UTC date when the device sends none, and a device ahead of UTC has then
 * already recorded "tomorrow".
 */
export function seriesEnd(person: LoadedPerson, today: string): string {
  return person.lastRecordedDay !== null && person.lastRecordedDay > today ? person.lastRecordedDay : today;
}

export function timelineOf(person: LoadedPerson, today: string): Timeline {
  return timeline({ ...person.history, ...person.options, until: seriesEnd(person, today) });
}

const round = (value: number | null): number | null => {
  if (value === null) return null;
  const scale = 10 ** SERIES_DECIMALS;
  return Math.round(value * scale) / scale;
};

export function dayPricesOf(point: TimelinePoint): DayPrices {
  const sectors = {} as DayPrices['sectors'];
  for (const area of AREA_IDS) {
    const s = point.sectors[area];
    sectors[area] = { status: s.status, price: s.price, target: s.target };
  }
  return { overall: point.overall, overallTarget: point.overallTarget, sectors };
}

/** Halted stretches of every sector over the series. */
function haltsOf(points: readonly TimelinePoint[]): MeLive['halts'] {
  const halts: MeLive['halts'] = [];
  for (const area of AREA_IDS) {
    let from: string | null = null;
    points.forEach((point, i) => {
      const halted = point.sectors[area].status === 'halted';
      if (halted && from === null) from = point.day;
      if (!halted && from !== null) {
        halts.push({ area, from, to: points[i - 1].day });
        from = null;
      }
    });
    if (from !== null) halts.push({ area, from, to: null });
  }
  return halts.sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
}

const percentOf = (delta: number | null, base: number | null): number | null =>
  delta !== null && base ? (delta / base) * 100 : null;

/**
 * The `live` block of GET /api/me: the series and what the home page says about today.
 * null before the first completed check.
 */
export function liveOf(
  person: LoadedPerson,
  user: Pick<UserRow, 'health_consent_version'>,
  flags: FeatureFlags,
  today: string,
): MeLive | null {
  const latest = latestCheck(person);
  if (latest === null) return null;
  const until = seriesEnd(person, today);
  const tl = timelineOf(person, today);
  const points = tl.points;
  if (points.length === 0 || tl.versions === null || tl.retake === null) return null;

  const now = points[points.length - 1];
  const before = points.length > 1 ? points[points.length - 2] : null;
  const atCheck = points[dayNumber(tl.retake.lastCheckDay) - dayNumber(points[0].day)] ?? null;
  const halts = haltsOf(points);

  const sectors = {} as Record<AreaId, LiveSector>;
  for (const area of AREA_IDS) {
    const s = now.sectors[area];
    const prev = before?.sectors[area] ?? null;
    // From the price the last check gave on its own, so that day's micro-app records count as a move.
    const base = atCheck ? (atCheck.check ? atCheck.check.prices[area] : atCheck.sectors[area].price) : null;
    const open = halts.find((h) => h.area === area && h.to === null);
    sectors[area] = {
      status: s.status,
      price: s.price,
      target: s.target,
      change: s.price !== null && prev !== null && prev.price !== null ? s.price - prev.price : null,
      sinceCheck: s.price !== null && base !== null ? s.price - base : null,
      dailyLimit:
        s.status === 'listed' && s.price !== null && s.target !== null && s.price !== s.target
          ? s.target > s.price
            ? 'up'
            : 'down'
          : null,
      resumed: s.status === 'listed' && prev !== null && prev.status === 'halted',
      haltedSince: open ? open.from : null,
    };
  }

  const change = now.overall !== null && before !== null && before.overall !== null ? now.overall - before.overall : null;
  const checkOverall = atCheck ? (atCheck.check ? atCheck.check.overall : atCheck.overall) : null;
  const sinceCheck = now.overall !== null && checkOverall !== null ? now.overall - checkOverall : null;

  let high: number | null = null;
  let low: number | null = null;
  let highDay: string | null = null;
  let lowDay: string | null = null;
  for (const point of points) {
    if (point.overall === null) continue;
    if (high === null || point.overall > high) [high, highDay] = [point.overall, point.day];
    if (low === null || point.overall < low) [low, lowDay] = [point.overall, point.day];
  }

  const { daily = [], paydays = [], weeklyWins = [], peopleNudges = [] } = person.history;
  const counted = dailyStreak(daily, until, tl.versions.algo);
  // A day before the first full check is not offered for filling in: there was no price yet.
  const firstCheckDay = person.checks[0].day;
  const streak = { ...counted, canBackfill: counted.canBackfill.filter((day) => day >= firstCheckDay) };
  const week = weekOf(dayNumber(until));
  const appOf = (enabled: boolean, available: boolean, days: readonly string[]): LiveApp => {
    let lastDay: string | null = null;
    for (const day of days) if (day <= until && (lastDay === null || day > lastDay)) lastDay = day;
    return {
      enabled,
      available: enabled && available,
      recordedToday: days.includes(until),
      recordedThisWeek: days.some((day) => weekOf(dayNumber(day)) === week),
      lastDay,
    };
  };
  const eligible = paydayEligible(getBank(latest.session.bank_version), backgroundOf(latest.session), tl.versions.algo);
  const retestAfter = getAlgo(tl.versions.algo).live.dailyOpen.retestAfterDays;

  return {
    today: until,
    series: {
      start: points[0].day,
      length: points.length,
      overall: points.map((p) => round(p.overall)),
      sectors: Object.fromEntries(
        AREA_IDS.map((area) => [area, points.map((p) => round(p.sectors[area].price))]),
      ) as Record<AreaId, Array<number | null>>,
    },
    markers: tl.markers,
    halts,
    overall: {
      price: now.overall,
      target: now.overallTarget,
      change,
      changePercent: percentOf(change, before?.overall ?? null),
      sinceCheck,
      sinceCheckPercent: percentOf(sinceCheck, checkOverall),
      covers: now.overallCovers,
    },
    sectors,
    allTime: { high, highDay, low, lowDay },
    lastCheckDay: tl.retake.lastCheckDay,
    mindNotice: now.mindNotice,
    streak,
    apps: {
      dailyOpen: appOf(flags.dailyOpen, user.health_consent_version !== null, daily.map((e) => e.day)),
      payday: {
        ...appOf(flags.payday, eligible, paydays.map((e) => e.day)),
        eligible,
        baseline: eligible ? paydayBaselineOf({ day: latest.day, steps: latest.steps }, tl.versions.algo) : null,
      },
      weeklyWin: appOf(flags.weeklyWin, true, weeklyWins.map((e) => e.day)),
      peopleNudge: appOf(flags.peopleNudge, true, peopleNudges.map((e) => e.day)),
    },
    retake: {
      due: tl.retake.due,
      daysSinceCheck: tl.retake.daysSinceCheck,
      daysUntil: Math.max(0, retestAfter - tl.retake.daysSinceCheck),
      dueDay: tl.retake.dueDay,
    },
    moveLimit: getAlgo(tl.versions.algo).live.dailyMoveLimitPoints,
  };
}
