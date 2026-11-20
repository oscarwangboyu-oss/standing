/**
 * Team dashboard: sector prices and internal sector values per cohort.
 *
 * A cohort is a role, an age band, both, or everyone. Each person counts once, with the result
 * of their latest completed check. A sector without a price (unlisted or not enough data) is
 * left out of that sector's rows.
 *
 * The norm table is what the team reads before it replaces the provisional norms: the real
 * median, standard deviation and head count of the internal 0 to 1 values.
 */
import type { TeamNormRow, TeamNormsResponse, TeamPriceRow, TeamPricesResponse } from '../../shared/api';
import { AREA_IDS, CURRENT, getNorm, ROLE_IDS, type AreaId, type RoleId } from '../../engine';
import { PRICE_BIN_EDGES } from '../config';
import type { Db } from '../db';
import { csv, type CsvCell } from '../http';
import { demoCounts, shownResultCte } from './shared';

interface CohortRow {
  role: RoleId | null;
  age: number | null;
  area: AreaId;
  n: number;
  price_median: number;
  price_min: number;
  price_max: number;
  raw_median: number;
  raw_mean: number;
  raw_sd: number | null;
  [bin: `bin_${number}`]: number;
}

const BIN_COUNT = PRICE_BIN_EDGES.length - 1;

/** One count per price band. The edges are numbers from config, never request input. */
function binColumns(): string {
  return Array.from({ length: BIN_COUNT }, (_, i) => {
    const low = PRICE_BIN_EDGES[i];
    const high = PRICE_BIN_EDGES[i + 1];
    const upper = i === BIN_COUNT - 1 ? `price <= ${high}` : `price < ${high}`;
    return `(count(*) filter (where price >= ${low} and ${upper}))::int as bin_${i}`;
  }).join(',\n       ');
}

async function cohortRows(db: Db): Promise<CohortRow[]> {
  const rows = await db.query<CohortRow>(
    `with latest as (
       select distinct on (s.user_id) s.id, s.role, s.age, u.health_consent_version is not null as health
       from sessions s join users u on u.id = s.user_id
       where s.completed_at is not null
       order by s.user_id, s.completed_at desc, s.id desc
     ), ${shownResultCte('$1', '$2')},
     long as (
       select l.role, l.age, v.area, v.price, v.raw
       from latest l join res r on r.session_id = l.id
       cross join lateral (values
         ('C', r.price_c, r.raw_c), ('W', r.price_w, r.raw_w), ('N', r.price_n, r.raw_n),
         ('B', r.price_b, r.raw_b), ('M', r.price_m, r.raw_m)) as v(area, price, raw)
       where v.price is not null and v.raw is not null
         -- Body and Mind of a person who withdrew that consent are left out from then on.
         and (l.health or v.area not in ('B', 'M'))
     )
     select role, age, area, count(*)::int as n,
       (percentile_cont(0.5) within group (order by price))::float8 as price_median,
       min(price)::float8 as price_min, max(price)::float8 as price_max,
       (percentile_cont(0.5) within group (order by raw))::float8 as raw_median,
       avg(raw)::float8 as raw_mean, stddev_samp(raw)::float8 as raw_sd,
       ${binColumns()}
     from long
     group by grouping sets ((role, age, area), (role, area), (age, area), (area))`,
    [CURRENT.algo, CURRENT.norm],
  );
  // Everyone first, then by role, by age band, and role with age band; sectors in engine order.
  const rank = (r: CohortRow) =>
    (r.role === null ? 0 : 1 + ROLE_IDS.indexOf(r.role)) * 10_000 +
    (r.age === null ? 0 : 1 + r.age) * 10 +
    AREA_IDS.indexOf(r.area);
  return rows.sort((a, b) => rank(a) - rank(b));
}

export async function teamPrices(db: Db, now: Date): Promise<TeamPricesResponse> {
  const rows = await cohortRows(db);
  return {
    generatedAt: now.toISOString(),
    demoPeople: (await demoCounts(db)).people,
    versions: { ...CURRENT },
    binEdges: [...PRICE_BIN_EDGES],
    rows: rows.map(
      (r): TeamPriceRow => ({
        role: r.role,
        age: r.age,
        area: r.area,
        n: r.n,
        median: r.price_median,
        min: r.price_min,
        max: r.price_max,
        bins: Array.from({ length: BIN_COUNT }, (_, i) => r[`bin_${i}`]),
      }),
    ),
  };
}

export async function teamNorms(db: Db, now: Date): Promise<TeamNormsResponse> {
  const rows = await cohortRows(db);
  const norm = getNorm(CURRENT.norm);
  return {
    generatedAt: now.toISOString(),
    demoPeople: (await demoCounts(db)).people,
    versions: { ...CURRENT },
    current: { version: CURRENT.norm, provisional: norm.provisional, sectors: norm.sectors },
    rows: rows.map(
      (r): TeamNormRow => ({
        role: r.role,
        age: r.age,
        area: r.area,
        n: r.n,
        median: r.raw_median,
        mean: r.raw_mean,
        sd: r.raw_sd,
      }),
    ),
  };
}

const cohortCells = (r: { role: RoleId | null; age: number | null }): CsvCell[] => [r.role ?? 'all', r.age ?? 'all'];

export function teamPricesCsv(data: TeamPricesResponse): Response {
  const bins = data.binEdges.slice(0, -1).map((low, i) => `price_${low}_to_${data.binEdges[i + 1]}`);
  return csv(
    'standing-prices',
    ['role', 'age_band', 'sector', 'people', 'median_price', 'min_price', 'max_price', ...bins],
    data.rows.map((r) => [...cohortCells(r), r.area, r.n, r.median, r.min, r.max, ...r.bins]),
  );
}

export function teamNormsCsv(data: TeamNormsResponse): Response {
  return csv(
    'standing-norms',
    ['role', 'age_band', 'sector', 'people', 'median_value', 'mean_value', 'sd_value', 'norm_version', 'norm_median', 'norm_sd'],
    data.rows.map((r) => [
      ...cohortCells(r),
      r.area,
      r.n,
      r.median,
      r.mean,
      r.sd,
      data.current.version,
      data.current.sectors[r.area].median,
      data.current.sectors[r.area].sd,
    ]),
  );
}
