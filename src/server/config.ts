/**
 * Server-side settings that are not scoring parameters: request limits and the definitions the
 * team dashboard needs beyond the red lines in src/engine/config.ts. Every value is an initial
 * setting chosen at design time and can be edited in place; none of them changes a score.
 */

/** Largest request body the API reads, in bytes. A full batch of 80 events is about 20 kB. */
export const MAX_BODY_BYTES = 64 * 1024;

/** Random bytes in a user id, a session id and a device token. */
export const ID_BYTES = 16;
export const TOKEN_BYTES = 32;

/**
 * Recovery code: 20 characters of a 32-character alphabet, so 100 bits, shown in groups of 5.
 * The alphabet is Crockford base 32: digits and capitals without I, L, O and U. When a code is
 * typed back, O is read as 0 and I and L as 1.
 */
export const RECOVERY_CODE = {
  alphabet: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  length: 20,
  group: 5,
} as const;

/**
 * Team dashboard, time column: two stems are "of similar length" when their reading times
 * (readUnits of the stem in the language most answers used, divided by the engine's glance
 * speed) are within this ratio of each other. 1.5 means from two thirds to one and a half
 * times as long. Initial setting.
 */
export const SIMILAR_STEM_BAND = 1.5;

/**
 * The time flag needs at least this many other question versions of similar stem length with
 * answers. With fewer the comparison is not made. Initial setting.
 */
export const MIN_SIMILAR_STEMS = 3;

/**
 * Team dashboard, drop-off: a person counts as having left at a question when it was shown,
 * not answered, the check is unfinished and nothing has arrived for this many minutes. Without
 * the wait, everyone who is answering right now would count as a drop-off. Initial setting.
 */
export const DROP_OFF_IDLE_MINUTES = 30;

/**
 * Team dashboard, price distribution: band edges on the price scale. Each band is 15 points
 * wide, which is one standard deviation, from limit down (55) to limit up (145).
 */
export const PRICE_BIN_EDGES = [55, 70, 85, 100, 115, 130, 145] as const;
