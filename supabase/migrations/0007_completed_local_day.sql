-- The device's local date on which a check was completed. A check that is resumed days later and
-- finished in a US evening has a UTC completion date of tomorrow; the live series counts the check
-- from this day instead. Sent by the client with POST /api/sessions/:id/complete. Null for checks
-- completed before this migration and for clients that do not send it: the old rule applies then
-- (src/server/live.ts, checkDayOf).
alter table sessions add column if not exists completed_local_day text;
