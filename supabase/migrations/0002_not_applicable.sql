-- A third answer to a question: "not applicable", next to select and skip.
--
-- A question event with action 'na' means the person said the question does not apply to
-- them. Like a skip it carries no option index and no click position, and the question gets
-- no score. It is counted apart from skips on the team dashboard.
--
-- The one-answer index of 0001 (action <> 'shown') already covers it: a question has one
-- answer, which is a select, a skip or an na.

alter table question_events drop constraint question_events_action_check;
alter table question_events
  add constraint question_events_action_check check (action in ('shown', 'select', 'skip', 'na'));
