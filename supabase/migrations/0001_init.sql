-- Standing, schema of stage 1.
--
-- Conventions (see src/server/db.ts): timestamps are ISO 8601 UTC text written by the
-- application, days are YYYY-MM-DD text, ids are random text made by the application.
-- No table has a column for an IP address or a user agent, and none may be added.
--
-- Raw records (question_events, report_events, visits, consents) are append only: rows are
-- inserted and never updated. They leave only when the user deletes their data.
-- Derived records (results) can be recomputed at any time from the raw records.
--
-- Every table that holds data of a person has a user_id column and is listed in USER_TABLES in
-- src/server/tables.ts, which is what export and delete walk. A test fails when a table with a
-- user_id column is missing from that list.

-- One row per person. No name, email or phone. The recovery code is stored as a SHA-256 hash.
create table users (
  id text primary key,
  created_at text not null,
  recovery_hash text not null unique,
  recovery_rotated_at text not null,
  -- Current consent state. The full history is in consents.
  general_consent_version text not null,
  general_consent_at text not null,
  health_consent_version text,
  health_consent_at text,
  lang text not null check (lang in ('zh', 'en')),
  -- Profile, copied from the latest check so the home page needs one read.
  age integer,
  role text,
  us_state text,
  ticker text,
  -- True only for simulated people made by the local demo data script. Never set by the API.
  is_demo boolean not null default false
);

-- Device tokens, several per person. Only the SHA-256 hash of a token is stored.
create table device_tokens (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at text not null,
  -- 'create': issued with the record. 'restore': issued for a recovery code.
  origin text not null check (origin in ('create', 'restore'))
);
create index device_tokens_user on device_tokens (user_id);

-- Consent history: one row each time a consent is given or withdrawn, with the version id of
-- the text that was shown.
create table consents (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  kind text not null check (kind in ('general', 'health')),
  granted boolean not null,
  text_version text not null,
  at text not null
);
create index consents_user on consents (user_id);

-- One check. The background answers decide the path through the bank.
create table sessions (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at text not null,
  completed_at text,
  -- The device's local date when the check was started, for return rates.
  local_day text not null,
  age integer not null,
  role text not null,
  -- Option index of each background question of the role, by question id.
  extra jsonb not null,
  us_state text,
  ticker text,
  lang text not null check (lang in ('zh', 'en')),
  bank_version text not null,
  -- False: body and mind questions are left out and the two sectors are unlisted.
  health_consent boolean not null
);
create index sessions_user on sessions (user_id, created_at);
create index sessions_completed on sessions (completed_at) where completed_at is not null;

-- Raw record, append only. Two rows per question: 'shown', then 'select' or 'skip'.
create table question_events (
  session_id text not null references sessions (id) on delete cascade,
  -- Zero-based position of the question on the person's path.
  seq integer not null check (seq >= 0),
  action text not null check (action in ('shown', 'select', 'skip')),
  user_id text not null references users (id) on delete cascade,
  item_id text not null,
  version_key text not null,
  lang text not null check (lang in ('zh', 'en')),
  -- Index of the selected option in bank order. Null for shown and skip.
  option_index integer,
  -- Seconds from display to tap. Null for shown.
  seconds double precision,
  display_direction text not null check (display_direction in ('best_first', 'worst_first')),
  -- Where the selected option sat on screen. Null for shown and skip.
  click_position text check (click_position in ('first', 'middle', 'last')),
  bank_version text not null,
  -- Where the answer came from. Always 'questionnaire' here; daily inputs get their own table.
  source text not null default 'questionnaire',
  -- Server time of arrival.
  at text not null,
  primary key (session_id, seq, action)
);
-- A question has one answer: either a select or a skip.
create unique index question_events_one_answer on question_events (session_id, seq) where action <> 'shown';
create index question_events_item on question_events (item_id, version_key);
create index question_events_user on question_events (user_id);

-- Derived record. One row per check and version set, so an old result and its recomputation
-- under a newer algorithm or norm can both be looked up.
create table results (
  session_id text not null references sessions (id) on delete cascade,
  algo_version integer not null,
  norm_version text not null,
  bank_version text not null,
  user_id text not null references users (id) on delete cascade,
  computed_at text not null,
  overall double precision,
  price_c double precision,
  price_w double precision,
  price_n double precision,
  price_b double precision,
  price_m double precision,
  -- Internal 0 to 1 sector values, for the team's norm work. Never shown to users.
  raw_c double precision,
  raw_w double precision,
  raw_n double precision,
  raw_b double precision,
  raw_m double precision,
  grade text not null,
  -- The full output of the engine.
  result jsonb not null,
  primary key (session_id, algo_version, norm_version)
);
create index results_user on results (user_id);

-- Raw record, append only. How the result page is read. Never enters scoring.
create table report_events (
  user_id text not null references users (id) on delete cascade,
  -- Made up by the client, so a retried send is stored once.
  id text not null,
  session_id text not null references sessions (id) on delete cascade,
  section text not null,
  kind text not null check (kind in ('seen', 'dwell', 'share', 'useful')),
  -- dwell: milliseconds in view.
  ms integer,
  -- useful: true or false.
  useful boolean,
  at text not null,
  primary key (user_id, id)
);
create index report_events_section on report_events (section, kind);

-- Raw record, append only. One row per person per local day, for return rates.
create table visits (
  user_id text not null references users (id) on delete cascade,
  day text not null,
  first_at text not null,
  primary key (user_id, day)
);
create index visits_day on visits (day);

drop table if exists _scaffold;
