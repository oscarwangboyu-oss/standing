-- Payday Check also sends the band of the debt share (W5 in its "debt" and "hh" wordings):
-- debt paid divided by take-home pay, averaged over the last pay periods, as an option index.
-- A band, never an amount; the column is named for the burden, like save_share for savings.
-- Null on paydays recorded before this column existed.
alter table payday_entries add column if not exists burden_share smallint
  constraint payday_entries_burden_share_check check (burden_share between 0 and 9);

-- periods counts the pay periods behind a share: 0 exactly when there is neither share.
alter table payday_entries drop constraint if exists payday_entries_check;
alter table payday_entries add constraint payday_entries_periods_share_check
  check ((periods = 0) = (save_share is null and burden_share is null));
