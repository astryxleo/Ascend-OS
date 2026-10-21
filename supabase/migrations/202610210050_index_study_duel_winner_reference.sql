-- Keep winner lookups and profile-delete SET NULL checks efficient.
create index if not exists study_duels_winner_id_idx
  on public.study_duels (winner_id)
  where winner_id is not null;
