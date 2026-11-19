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

/**
 * Friend compare: an invite link works for this many days after it is made. Long enough for a
 * friend to take the check on another day, short enough that an old link in a chat stops
 * working. Initial setting.
 */
export const COMPARE_INVITE_DAYS = 14;

/**
 * Friend compare: most unused, unexpired invites one person can hold. It bounds what one device
 * token can write to the invite table. Initial setting.
 */
export const MAX_OPEN_INVITES = 10;

/**
 * PostHog forwarding: the request to PostHog is given up after this many milliseconds. It runs
 * after the response to the user was sent, so the limit only bounds background work.
 */
export const POSTHOG_TIMEOUT_MS = 2000;

/**
 * PostHog forwarding: most events in one request to PostHog. One API request yields at most
 * MAX_EVENTS_PER_REQUEST of them, so a batch is never split in practice.
 */
export const POSTHOG_MAX_BATCH = 100;

/** The recompute command lists this many of the largest moves. */
export const RECOMPUTE_TOP_MOVES = 10;

/**
 * Micro apps: most entries one person can record in one app on one day (payday, weekly win,
 * people nudge; the daily open takes one a day). It bounds what one device token can write.
 * The engine reads the last entry of a day or week, so more would add nothing. Initial setting.
 */
export const MAX_MICRO_ENTRIES_PER_DAY = 10;

/**
 * Team dashboard, stage 2: a person counts as active for an app when they opened Standing or
 * recorded an entry on one of the last N days. Seven days for the daily and the weekly apps.
 * Thirty for payday, so that a person paid once a month has had one payday. Initial settings.
 */
export const TEAM_APP_WINDOW_DAYS = { daily_open: 7, payday: 30, weekly_win: 7, people_nudge: 7 } as const;

/** Team dashboard: the day-by-day daily open table covers this many days up to today. */
export const TEAM_DAILY_DAYS = 60;

/** Team dashboard: the week-by-week table of the weekly apps covers this many calendar weeks. */
export const TEAM_APP_WEEKS = 12;

/** Prices in the day-by-day series of GET /api/me are rounded to this many decimals. */
export const SERIES_DECIMALS = 2;
