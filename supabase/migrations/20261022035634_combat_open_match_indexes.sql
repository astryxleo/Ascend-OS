create index if not exists combat_matches_winner_id_idx on public.combat_matches(winner_id) where winner_id is not null;
create unique index if not exists combat_matches_one_open_duel_pair_idx on public.combat_matches(least(challenger_id,opponent_id),greatest(challenger_id,opponent_id)) where status in ('pending','active');
