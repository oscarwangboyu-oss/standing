/**
 * Team dashboard: the per-question table. One row per question version that was shown at least
 * once, optionally for one role.
 *
 * How each number is computed
 * - shown: checks with any event for the version (a "shown" event, or an answer).
 * - skip: of those shown, checks that skipped it. A "not applicable" is not a skip.
 * - drop-off: of those shown, checks that neither answered nor skipped it nor marked it not
 *   applicable, are unfinished, and have been idle for more than DROP_OFF_IDLE_MINUTES. A
 *   question cannot be passed without one of the three, so "not answered" is the same as
 *   "nothing after it".
 * - time: median seconds of the selections (skips are left out), compared with the median of
 *   the medians of the other versions on this table whose stems are of similar length.
 * - options: share of the selections that went to each option.
 * - not applicable: of those shown, checks that marked the question not applicable (action
 *   "na") plus checks that selected an option whose score is null.
 * - retest: people who selected an option of this version in two checks RETEST_WINDOW_DAYS
 *   apart (one pair per person); share who selected a different option the second time.
 */
import type { TeamItemRow, TeamItemsResponse } from '../../shared/api';
import { CURRENT, getAlgo, getBank, readUnits, type Bank, type Lang, type RoleId } from '../../engine';
import { DROP_OFF_IDLE_MINUTES, MIN_SIMILAR_STEMS, SIMILAR_STEM_BAND } from '../config';
import type { Db } from '../db';
import { csv, type CsvCell } from '../http';
import { demoCounts, median, rate, RED_LINES, RETEST_WINDOW, retestPairsCte } from './shared';

interface CountRow {
  item_id: string;
  version_key: string;
  shown: number;
  skipped: number;
  marked_na: number;
  answered: number;
  dropped: number;
  median_seconds: number | null;
}

interface OptionRow {
  item_id: string;
  version_key: string;
  option_index: number;
  lang: Lang;
  n: number;
}

interface RetestRow {
  item_id: string;
  version_key: string;
  n: number;
  changed: number;
}

const SECONDS_PER_MINUTE = 60;

/** Position of a question in the questionnaire: sector order of the bank, then the ladder. */
function sectionRank(bank: Bank, area: string): number {
  const index = (bank.order as string[]).indexOf(area);
  return index < 0 ? bank.order.length : index;
}

export async function teamItems(
  db: Db,
  now: Date,
  role: RoleId | null,
  bankVersion: string = CURRENT.bank,
): Promise<TeamItemsResponse> {
  const bank = getBank(bankVersion);
  const idleBefore = new Date(now.getTime() - DROP_OFF_IDLE_MINUTES * SECONDS_PER_MINUTE * 1000).toISOString();

  // One row per check and question first, then the counts per question version. SQL does the
  // aggregation; only the per-version totals come back.
  const counts = await db.query<CountRow>(
    `with per as (
       select e.session_id, e.seq, e.item_id, e.version_key,
         bool_or(e.action = 'skip') as skipped,
         bool_or(e.action = 'na') as marked_na,
         bool_or(e.action = 'select') as selected,
         max(e.seconds) filter (where e.action = 'select') as seconds,
         max(e.at) as last_at,
         s.completed_at is not null as completed
       from question_events e join sessions s on s.id = e.session_id
       where e.bank_version = $1 and ($2::text is null or s.role = $2)
       group by e.session_id, e.seq, e.item_id, e.version_key, s.completed_at
     )
     select item_id, version_key,
       count(*)::int as shown,
       (count(*) filter (where skipped))::int as skipped,
       (count(*) filter (where marked_na))::int as marked_na,
       (count(*) filter (where selected))::int as answered,
       (count(*) filter (where not skipped and not marked_na and not selected and not completed
         and last_at < $3))::int as dropped,
       (percentile_cont(0.5) within group (order by seconds))::float8 as median_seconds
     from per
     group by item_id, version_key`,
    [bankVersion, role, idleBefore],
  );

  const options = await db.query<OptionRow>(
    `select e.item_id, e.version_key, e.option_index, e.lang, count(*)::int as n
     from question_events e join sessions s on s.id = e.session_id
     where e.action = 'select' and e.bank_version = $1 and ($2::text is null or s.role = $2)
     group by e.item_id, e.version_key, e.option_index, e.lang`,
    [bankVersion, role],
  );

  const retests = await db.query<RetestRow>(
    `with ${retestPairsCte('$3', '$4')}
     select x.item_id, x.version_key, count(*)::int as n,
       (count(*) filter (where x.option_index <> y.option_index))::int as changed
     from pairs p
     join question_events x on x.session_id = p.first_id and x.action = 'select'
     join question_events y on y.session_id = p.second_id and y.action = 'select'
       and y.item_id = x.item_id and y.version_key = x.version_key
     where x.bank_version = $1 and ($2::text is null or p.role = $2)
     group by x.item_id, x.version_key`,
    [bankVersion, role, RETEST_WINDOW.min, RETEST_WINDOW.max],
  );

  const keyOf = (r: { item_id: string; version_key: string }) => `${r.item_id}\u0000${r.version_key}`;
  const optionsBy = new Map<string, OptionRow[]>();
  for (const row of options) {
    const list = optionsBy.get(keyOf(row)) ?? [];
    list.push(row);
    optionsBy.set(keyOf(row), list);
  }
  const retestBy = new Map(retests.map((r) => [keyOf(r), r]));
  const scan = getAlgo().timing.scanPerMinute;

  const rows: TeamItemRow[] = [];
  for (const c of counts) {
    const item = Object.hasOwn(bank.items, c.item_id) ? bank.items[c.item_id] : null;
    const version = item?.versions.find((v) => v.key === c.version_key);
    if (!item || !version) continue;

    const optionCounts = version.opts.map(() => 0);
    const byLang: Record<Lang, number> = { zh: 0, en: 0 };
    let unscoredOption = 0;
    for (const o of optionsBy.get(keyOf(c)) ?? []) {
      if (o.option_index < 0 || o.option_index >= optionCounts.length) continue;
      optionCounts[o.option_index] += o.n;
      byLang[o.lang] += o.n;
      if (version.s[o.option_index] === null) unscoredOption += o.n;
    }
    const shares = optionCounts.map((n) => (c.answered > 0 ? n / c.answered : null));
    const realShares = shares.filter((s): s is number => s !== null);
    const optionsRed =
      realShares.length > 0 &&
      (Math.max(...realShares) > RED_LINES.optionShareMax || Math.min(...realShares) < RED_LINES.optionShareMin);

    // Stem length in the language most answers used, as reading seconds at the glance speed.
    const stemLang: Lang = byLang.zh > byLang.en ? 'zh' : 'en';
    const stemSeconds = readUnits(version.q[stemLang], stemLang) / (scan[stemLang] / SECONDS_PER_MINUTE);

    const skip = rate(c.skipped, c.shown);
    const dropOff = rate(c.dropped, c.shown);
    const na = rate(c.marked_na + unscoredOption, c.shown);
    const retestRow = retestBy.get(keyOf(c));
    const retest = rate(retestRow?.changed ?? 0, retestRow?.n ?? 0);

    rows.push({
      itemId: c.item_id,
      versionKey: c.version_key,
      area: item.area,
      shown: c.shown,
      skip: { ...skip, red: skip.rate !== null && skip.rate > RED_LINES.skipRate },
      dropOff: { ...dropOff, red: dropOff.rate !== null && dropOff.rate > RED_LINES.dropOffRate },
      answered: c.answered,
      time: {
        medianSeconds: c.median_seconds,
        stemSeconds,
        stemLang,
        similarCount: 0,
        similarMedianSeconds: null,
        red: false,
      },
      options: { counts: optionCounts, shares, red: optionsRed },
      notApplicable: {
        ...na,
        red: na.rate !== null && na.rate > RED_LINES.notApplicableRate,
        hasOption: version.s.includes(null),
        marked: c.marked_na,
        unscoredOption,
      },
      retest: { ...retest, red: retest.rate !== null && retest.rate > RED_LINES.retestChangeRate },
    });
  }

  // Time flag: compare with the other versions on this table whose stems are about as long.
  for (const row of rows) {
    const similar = rows.filter((other) => {
      if (other === row || other.time.medianSeconds === null) return false;
      const a = row.time.stemSeconds;
      const b = other.time.stemSeconds;
      // The small factor keeps a stem that is exactly at the edge of the band inside it.
      return Math.max(a, b) <= Math.min(a, b) * SIMILAR_STEM_BAND * (1 + 1e-9);
    });
    row.time.similarCount = similar.length;
    if (similar.length >= MIN_SIMILAR_STEMS) {
      const reference = median(similar.map((other) => other.time.medianSeconds as number));
      row.time.similarMedianSeconds = reference;
      row.time.red =
        row.time.medianSeconds !== null &&
        reference !== null &&
        row.time.medianSeconds > RED_LINES.timeVsSimilarStems * reference;
    }
  }

  const itemOrder = Object.keys(bank.items);
  rows.sort((a, b) => {
    const bySection = sectionRank(bank, a.area) - sectionRank(bank, b.area);
    if (bySection !== 0) return bySection;
    const byItem = itemOrder.indexOf(a.itemId) - itemOrder.indexOf(b.itemId);
    if (byItem !== 0) return byItem;
    const versions = bank.items[a.itemId].versions;
    return versions.findIndex((v) => v.key === a.versionKey) - versions.findIndex((v) => v.key === b.versionKey);
  });

  return {
    generatedAt: now.toISOString(),
    demoPeople: (await demoCounts(db)).people,
    bankVersion,
    role,
    redLines: RED_LINES,
    definitions: {
      similarStemBand: SIMILAR_STEM_BAND,
      minSimilarStems: MIN_SIMILAR_STEMS,
      dropOffIdleMinutes: DROP_OFF_IDLE_MINUTES,
      retestWindowDays: RETEST_WINDOW,
    },
    rows,
  };
}

export function teamItemsCsv(data: TeamItemsResponse): Response {
  const header = [
    'item_id', 'version_key', 'area', 'shown',
    'skipped', 'skip_rate', 'skip_red',
    'dropped', 'drop_off_rate', 'drop_off_red',
    'answered', 'median_seconds', 'stem_seconds', 'similar_stems', 'similar_median_seconds', 'time_red',
    'option_counts', 'option_shares', 'options_red',
    'marked_not_applicable', 'unscored_option', 'not_applicable', 'not_applicable_rate', 'not_applicable_red',
    'retest_people', 'retest_changed', 'retest_change_rate', 'retest_red',
  ];
  const rows = data.rows.map((r): CsvCell[] => [
    r.itemId, r.versionKey, r.area, r.shown,
    r.skip.count, r.skip.rate, r.skip.red,
    r.dropOff.count, r.dropOff.rate, r.dropOff.red,
    r.answered, r.time.medianSeconds, r.time.stemSeconds, r.time.similarCount, r.time.similarMedianSeconds, r.time.red,
    r.options.counts.join('|'), r.options.shares.map((s) => (s === null ? '' : s.toFixed(4))).join('|'), r.options.red,
    r.notApplicable.marked, r.notApplicable.unscoredOption, r.notApplicable.count, r.notApplicable.rate, r.notApplicable.red,
    r.retest.of, r.retest.count, r.retest.rate, r.retest.red,
  ]);
  return csv(`standing-items-${data.role ?? 'all'}`, header, rows);
}
