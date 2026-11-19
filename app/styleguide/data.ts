/**
 * Sample data for the styleguide. RIVR and MOSS are not real people.
 * The sector prices of each person average to the overall price.
 */
import type { ChartPoint, SectorCode, ShareCardData } from '@/ui';

export const sample = {
  ticker: 'RIVR',
  cohort: 'Ages 21 to 24, employed full-time',
  price: 104.37,
  change: { value: 1.12, pct: 1.08 },
  issue: 100,
  high: 105.9,
  low: 98.2,
  grade: 'A',
  pair: ['SKIL', 'BODY'] as const,
} as const;

export const prices: Record<SectorCode, number> = { SKIL: 111.2, WLTH: 96.85, NETW: 103.4, BODY: 108.1, MIND: 102.3 };
export const changes: Record<SectorCode, number> = { SKIL: 2.4, WLTH: -0.75, NETW: 0.3, BODY: 3.1, MIND: 0.55 };

const DAYS = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12', '2026-11-19'];
const OVERALL = [100.0, 98.2, 99.4, 101.1, 100.6, 102.2, 103.25, 104.37];

export const history: ChartPoint[] = OVERALL.map((value, i) => ({ date: DAYS[i] as string, value }));
export const historyValues: number[] = OVERALL;

export const sectorHistory: Record<SectorCode, number[]> = {
  SKIL: [104, 103.5, 104.5, 106, 106.5, 107.5, 108.8, 111.2],
  WLTH: [99.5, 98, 98.5, 99, 98, 98.4, 97.6, 96.85],
  NETW: [101, 100.5, 101, 101.5, 102, 102.6, 103.1, 103.4],
  BODY: [97.5, 94.5, 96.5, 99.5, 98.5, 102, 105, 108.1],
  MIND: [98, 94.5, 96.5, 99.5, 98, 100.5, 101.75, 102.3],
};

/** A daily history for the chart with markers: 30 days, one full check at each end, one version change. */
export const daily: ChartPoint[] = (() => {
  const values = [
    100.0, 99.6, 99.1, 98.2, 98.6, 99.0, 99.4, 99.9, 100.4, 101.1, 100.9, 100.6, 100.2, 100.6, 101.0, 101.5, 102.2, 102.0, 101.8, 102.3,
    102.7, 103.25, 103.1, 102.9, 103.3, 103.6, 103.9, 104.1, 104.2, 104.37,
  ];
  return values.map((value, i) => {
    const day = 21 + i;
    const date = day <= 31 ? `2026-10-${String(day).padStart(2, '0')}` : `2026-11-${String(day - 31).padStart(2, '0')}`;
    const point: ChartPoint = { date, value };
    if (i === 0 || i === 21) point.full = true;
    if (i === 12) point.version = 'Scoring v2';
    return point;
  });
})();

/** The second person of the compare view. A different shape: money and people lead. */
export const other = {
  ticker: 'MOSS',
  price: 103.9,
  pair: ['WLTH', 'NETW'] as const,
  prices: { SKIL: 97.4, WLTH: 112.6, NETW: 109.8, BODY: 94.2, MIND: 105.5 } as Record<SectorCode, number>,
};

/**
 * One real question: B3 of src/engine/bank/v2_1.json, in English. It is the third of five body
 * questions. Before it come 18 capability, 6 wealth and 6 network questions; after it, 6 mind
 * questions and one about position: 42 in all for this sample.
 */
export const question = {
  sector: 'BODY' as SectorCode,
  current: 33,
  total: 42,
  inSector: { current: 3, total: 5 },
  text: 'On average, how many hours of sleep do you get in a 24-hour period?',
  options: [
    { value: '0', label: 'Under 5' },
    { value: '1', label: '5 to 6' },
    { value: '2', label: '6 to 7' },
    { value: '3', label: '7 to 9' },
    { value: '4', label: 'More than 9' },
  ],
  skip: 'Skip this question',
  build: {
    SKIL: { built: 18, total: 18 },
    WLTH: { built: 6, total: 6 },
    NETW: { built: 6, total: 6 },
    BODY: { built: 2, total: 5 },
    MIND: { built: 0, total: 6 },
  } as Record<SectorCode, { built: number; total: number }>,
};

export const week = [
  { label: 'Fri', recorded: true },
  { label: 'Sat', recorded: true },
  { label: 'Sun', recorded: true },
  { label: 'Mon', recorded: true },
  { label: 'Tue', recorded: true },
  { label: 'Wed', recorded: true },
  { label: 'Thu', recorded: false },
];

export const share: ShareCardData = {
  ticker: sample.ticker,
  price: sample.price,
  sectors: (['SKIL', 'WLTH', 'NETW', 'BODY', 'MIND'] as const).map((code) => ({ code, price: prices[code] })),
  type: 'The Engine',
};

/** The mind notice of the reference page (reference/test_page.html), unchanged. */
export const mindNoticeText =
  'You chose "nearly every day" on both questions about mood. This check is not a diagnosis. If this continues, consider talking to a professional. In the United States you can call or text the 988 Suicide and Crisis Lifeline.';
