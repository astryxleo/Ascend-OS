-- Prevent concurrent requests from creating duplicate open duels for the same pair.
-- The normalized pair order makes A-vs-B equivalent to B-vs-A.
create unique index if not exists study_duels_one_open_pair_idx
  on public.study_duels (
    least(challenger_id, opponent_id),
    greatest(challenger_id, opponent_id)
  )
  where status in ('pending', 'active');
