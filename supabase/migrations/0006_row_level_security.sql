-- Standing: close every table to the Supabase Data API.
--
-- Supabase serves the tables of the public schema over an auto-generated REST API to its
-- "anon" and "authenticated" roles, unless row level security is on. Standing never uses that
-- API. The server reaches the database with the connection string, as the role that created
-- the tables, and the owner of a table is not subject to row level security.
--
-- With row level security on and no policy, every other role reads nothing and writes nothing.
-- Nothing changes for the app, for the scripts or for the local embedded database.
--
-- A later migration that adds a table must enable row level security on it as well.
-- tests/unit/scripts/tools.test.ts fails when a table is left open.

alter table users enable row level security;
alter table device_tokens enable row level security;
alter table consents enable row level security;
alter table sessions enable row level security;
alter table question_events enable row level security;
alter table results enable row level security;
alter table report_events enable row level security;
alter table visits enable row level security;
alter table compare_invites enable row level security;
alter table comparisons enable row level security;
alter table version_log enable row level security;
alter table daily_entries enable row level security;
alter table payday_entries enable row level security;
alter table weekly_wins enable row level security;
alter table people_nudges enable row level security;
-- The list of applied migrations, made by the migration runner before the first file runs.
alter table _migrations enable row level security;
