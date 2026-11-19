-- The day each algorithm, bank or norm version came into use. The chart draws a vertical line
-- on that day (PROMPT.md section 8). The versions the product started with are not logged: the
-- log records changes.
--
-- Rows are written by the recompute command when it stores results under a version that is
-- new to the database. The first day logged for a version is kept.
create table version_log (
  kind text not null check (kind in ('algo', 'bank', 'norm')),
  -- The version id as text: "2" for algorithm 2, "2.2" for a bank, "campus-1" for a norm.
  version text not null,
  effective_day text not null,
  logged_at text not null,
  primary key (kind, version)
);
