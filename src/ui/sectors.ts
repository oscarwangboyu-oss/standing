import { sectorNames } from '@/copy/common';

/** The five sectors in display order. */
export const SECTOR_CODES = ['SKIL', 'WLTH', 'NETW', 'BODY', 'MIND'] as const;
export type SectorCode = (typeof SECTOR_CODES)[number];

/** Engine area id to ticker code. */
export const AREA_CODE = { C: 'SKIL', W: 'WLTH', N: 'NETW', B: 'BODY', M: 'MIND' } as const satisfies Record<
  'C' | 'W' | 'N' | 'B' | 'M',
  SectorCode
>;

export function sectorName(code: SectorCode): string {
  return sectorNames[code];
}

/** listed: has a price. insufficient: too few answers. unlisted: excluded by consent. Same words as the engine. */
export type SectorStatus = 'listed' | 'insufficient' | 'unlisted';

/** One tag per sector at most from the engine, plus halted and resumed from the daily open. */
export type SectorTagKind = 'leader' | 'laggard' | 'limit_up' | 'limit_down' | 'halted' | 'resumed';
