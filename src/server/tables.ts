/**
 * Every table that holds data of a person, in the order rows are deleted (children first).
 * Export and delete walk this list, so a table that is missing here would be left behind when
 * a user deletes their data. tests/unit/server/settings.test.ts compares the list with the
 * schema and fails when a table with a user_id column is not on it.
 *
 * `hidden` columns are left out of the export: hashes that are of no use to the user and
 * should not travel, and the id of the other person in a comparison, which is theirs.
 */
export interface UserTable {
  name: string;
  /** What the table holds, in plain words. Included in the export. */
  about: string;
  orderBy: string;
  hidden?: readonly string[];
}

export const USER_TABLES: readonly UserTable[] = [
  {
    name: 'comparisons',
    about: 'Each comparison with a friend: when it was made. The other person is not named here.',
    orderBy: 'created_at, pair_id',
    hidden: ['other_user_id'],
  },
  {
    name: 'compare_invites',
    about: 'Each compare invite you made: when, until when it works, and whether it was accepted. The code itself is not stored, only a hash, which is left out here.',
    orderBy: 'created_at, code_hash',
    hidden: ['code_hash'],
  },
  {
    name: 'report_events',
    about: 'How you read your result page: which sections you saw, for how long, shares, and "useful" clicks.',
    orderBy: 'at, id',
  },
  {
    name: 'results',
    about: 'Results computed from your answers, each with the algorithm, bank and norm version used.',
    orderBy: 'computed_at, session_id',
  },
  {
    name: 'question_events',
    about: 'One row when a question was shown and one when you answered it, skipped it or marked it not applicable.',
    orderBy: 'session_id, seq, action',
  },
  {
    name: 'daily_entries',
    about: 'Your daily open: for each day the sleep, exercise and state options you tapped, and the day you entered them.',
    orderBy: 'day',
  },
  {
    name: 'payday_entries',
    about: 'Your payday checks: the bands your device worked out. The amounts you typed never left your device and are not here.',
    orderBy: 'at, id',
  },
  {
    name: 'weekly_wins',
    about: 'Your weekly wins: the kind of win and, for a course, the band of hours. Titles stay on your device.',
    orderBy: 'at, id',
  },
  {
    name: 'people_nudges',
    about: 'Your people nudges: how many people you planned to reach and how many you reached, by category. Names stay on your device.',
    orderBy: 'at, id',
  },
  {
    name: 'visits',
    about: 'The days on which you opened Standing.',
    orderBy: 'day',
  },
  {
    name: 'sessions',
    about: 'Each check you started, with the background answers you gave at the start.',
    orderBy: 'created_at, id',
  },
  {
    name: 'consents',
    about: 'Each time you gave or withdrew a consent, with the version of the text you saw.',
    orderBy: 'at, id',
  },
  {
    name: 'device_tokens',
    about: 'One row per device connected to your record. The token itself is not stored, only a hash, which is left out here.',
    orderBy: 'created_at',
    hidden: ['token_hash'],
  },
];

/** The users table itself. Its row is deleted last. */
export const USERS_TABLE = {
  name: 'users',
  about: 'Your record: a random id, your consent state, language, and the profile from your latest check.',
  hidden: ['recovery_hash'] as readonly string[],
} as const;
