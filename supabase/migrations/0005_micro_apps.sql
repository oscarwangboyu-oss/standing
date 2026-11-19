-- Stage 2: the raw records of the four micro apps.
--
-- All four tables are raw and append only: rows are inserted and never updated. They leave
-- only when the person deletes their data. Nothing derived from them is stored: the daily
-- price series is computed by the engine from these rows every time it is asked for.
--
-- What these tables can hold, by design of their columns:
-- - taps, bands, categories and counts, each as a small whole number with a check constraint;
-- - days as YYYY-MM-DD text and one arrival time.
-- What they cannot hold: a money amount (no column is wide enough: every number is a whole
-- number bounded to 0..12 at most), free text (the only text columns are ids, days, times and
-- fixed lists of words), a name, an IP address or a user agent.
--
-- Every table has a user_id column and is listed in USER_TABLES (src/server/tables.ts), so
-- export includes it and deleting an account deletes its rows.

-- Daily Open: one row per person per day. Three taps, each an option index from 0 to 4.
create table daily_entries (
  user_id text not null references users (id) on delete cascade,
  -- The day the entry describes.
  day text not null,
  -- The device's local day on which it was entered: `day`, or the day after (yesterday filled in today).
  logged_on text not null,
  -- Last night's sleep: under 5 hours, 5 to 6, 6 to 7, 7 to 9, more than 9.
  sleep smallint check (sleep between 0 and 4),
  -- Minutes of activity: none, 1 to 19, 20 to 39, 40 to 59, 60 or more.
  exercise smallint check (exercise between 0 and 4),
  -- How the person feels, from very bad (0) to very good (4).
  state smallint check (state between 0 and 4),
  source text not null default 'daily_open' check (source = 'daily_open'),
  -- Server time of arrival.
  at text not null,
  primary key (user_id, day),
  check (sleep is not null or exercise is not null or state is not null),
  check (logged_on >= day)
);
create index daily_entries_logged on daily_entries (logged_on);

-- Payday Check: BANDS ONLY. The three amounts stay on the device, which works out the bands.
-- No column here can hold an amount: every number is a small whole number.
create table payday_entries (
  user_id text not null references users (id) on delete cascade,
  -- Made up by the client, so a retried send is stored once.
  id text not null,
  -- The device's local day on which the payday was reconciled.
  day text not null,
  -- Pay periods that went into the saving share. 0 when there is no share.
  periods smallint not null check (periods between 0 and 12),
  -- Option index of the saving-share question the averaged share falls in.
  save_share smallint check (save_share between 0 and 9),
  -- Option index of the months-of-savings question the estimate has reached.
  runway smallint check (runway between 0 and 9),
  -- Day of the full check whose answer the runway estimate started from.
  baseline_day text,
  source text not null default 'payday' check (source = 'payday'),
  at text not null,
  primary key (user_id, id),
  check ((periods = 0) = (save_share is null))
);
create index payday_entries_day on payday_entries (day);

-- Weekly Win: a category and, for a course, a band of hours. The title stays on the device.
create table weekly_wins (
  user_id text not null references users (id) on delete cascade,
  id text not null,
  -- The device's local day on which the win was logged.
  day text not null,
  kind text not null check (kind in ('course', 'certificate', 'skill')),
  -- course: hours that week as an option index (about 1, 2 to 4, 5 to 9, 10 to 19, 20 or more).
  hours smallint check (hours between 0 and 4),
  -- certificate: whether it required an exam.
  exam boolean,
  -- certificate: entry level, or advanced or state licence.
  level text check (level in ('entry', 'advanced')),
  source text not null default 'weekly_win' check (source = 'weekly_win'),
  at text not null,
  primary key (user_id, id),
  check (hours is null or kind = 'course'),
  check ((kind = 'certificate') = (exam is not null)),
  check ((kind = 'certificate') = (level is not null))
);
create index weekly_wins_day on weekly_wins (day);

-- People Nudge: counts only. Who the people are stays on the device.
create table people_nudges (
  user_id text not null references users (id) on delete cascade,
  id text not null,
  -- The device's local day on which the log was saved.
  day text not null,
  -- People picked to reconnect with that week.
  planned smallint not null check (planned between 0 and 12),
  -- People reached, by what they are to the person.
  reached_family smallint not null default 0 check (reached_family between 0 and 12),
  reached_friend smallint not null default 0 check (reached_friend between 0 and 12),
  reached_mentor smallint not null default 0 check (reached_mentor between 0 and 12),
  reached_work smallint not null default 0 check (reached_work between 0 and 12),
  reached_other smallint not null default 0 check (reached_other between 0 and 12),
  source text not null default 'people_nudge' check (source = 'people_nudge'),
  at text not null,
  primary key (user_id, id)
);
create index people_nudges_day on people_nudges (day);
