/**
 * The ten types. A type is the pair of a person's two highest sectors, in either order.
 *
 * The founder can rename them here: this file is the only place the names and lines live.
 * Rules for a name: plain and adult, two or three words, nothing cute. Rules for a line: lead
 * with the strength, claim only what two high sectors can mean, no ranking against other people.
 */

export type TypeSector = 'SKIL' | 'WLTH' | 'NETW' | 'BODY' | 'MIND';

export interface TypeEntry {
  /** The two sectors, in display order (SKIL, WLTH, NETW, BODY, MIND). */
  pair: readonly [TypeSector, TypeSector];
  name: string;
  /** One line, strengths first. */
  line: string;
}

export const TYPES: readonly TypeEntry[] = [
  {
    pair: ['SKIL', 'WLTH'],
    name: 'The Builder',
    line: 'Your skills and your finances are your two strongest sectors. What you can do is turning into footing.',
  },
  {
    pair: ['SKIL', 'NETW'],
    name: 'The Operator',
    line: 'Capability and network lead. You know how to do the work and you know who to do it with.',
  },
  {
    pair: ['SKIL', 'BODY'],
    name: 'The Engine',
    line: 'Capability and body lead. You have the skills and the physical energy to use them.',
  },
  {
    pair: ['SKIL', 'MIND'],
    name: 'The Steady Hand',
    line: 'Capability and mind lead. You are good at what you do and settled while you do it.',
  },
  {
    pair: ['WLTH', 'NETW'],
    name: 'The Anchor',
    line: 'Wealth and network lead. You have a cushion and you have people around you.',
  },
  {
    pair: ['WLTH', 'BODY'],
    name: 'The Long Runner',
    line: 'Wealth and body lead. You keep reserves, in your accounts and in your health.',
  },
  {
    pair: ['WLTH', 'MIND'],
    name: 'The Planner',
    line: 'Wealth and mind lead. Your money is in order and so is your head.',
  },
  {
    pair: ['NETW', 'BODY'],
    name: 'The Teammate',
    line: 'Network and body lead. You show up for people and you look after yourself.',
  },
  {
    pair: ['NETW', 'MIND'],
    name: 'The Confidant',
    line: 'Network and mind lead. You are close to people and at ease with yourself.',
  },
  {
    pair: ['BODY', 'MIND'],
    name: 'The Even Keel',
    line: 'Body and mind lead. You sleep, move and feel well, and the rest can build on that.',
  },
];

const ORDER: readonly TypeSector[] = ['SKIL', 'WLTH', 'NETW', 'BODY', 'MIND'];

/** The type for two sectors, in either order. null when the two are the same sector. */
export function typeForPair(a: TypeSector, b: TypeSector): TypeEntry | null {
  if (a === b) return null;
  const [x, y] = ORDER.indexOf(a) < ORDER.indexOf(b) ? [a, b] : [b, a];
  return TYPES.find((t) => t.pair[0] === x && t.pair[1] === y) ?? null;
}

/**
 * The type for a set of prices: the pair of the two highest sectors. A tie goes to the sector
 * that comes first in display order. null when fewer than two sectors have a price.
 */
export function typeForPrices(prices: Partial<Record<TypeSector, number | null>>): TypeEntry | null {
  const listed = ORDER.filter((code) => typeof prices[code] === 'number' && Number.isFinite(prices[code] as number));
  if (listed.length < 2) return null;
  const ranked = [...listed].sort((a, b) => (prices[b] as number) - (prices[a] as number) || ORDER.indexOf(a) - ORDER.indexOf(b));
  return typeForPair(ranked[0] as TypeSector, ranked[1] as TypeSector);
}
