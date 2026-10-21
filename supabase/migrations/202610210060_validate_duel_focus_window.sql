-- Prevent focus sessions that started before a duel from contributing their full duration.
create or replace function public.refresh_study_duel(p_duel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  duel public.study_duels%rowtype;
  a bigint;
  b bigint;
  winner uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;

  select * into duel
  from public.study_duels
  where id = p_duel_id
    and (challenger_id = actor or opponent_id = actor)
  for update;

  if not found then raise exception 'Duel not found'; end if;
  if duel.status <> 'active' then
    return jsonb_build_object('status', duel.status);
  end if;

  -- Count only completed focus sessions entirely inside the duel time window.
  select coalesce(sum(duration_minutes), 0) into a
  from public.focus_sessions
  where user_id = duel.challenger_id
    and coalesce(completed, true)
    and started_at >= duel.starts_at
    and ended_at <= least(now(), duel.ends_at);

  select coalesce(sum(duration_minutes), 0) into b
  from public.focus_sessions
  where user_id = duel.opponent_id
    and coalesce(completed, true)
    and started_at >= duel.starts_at
    and ended_at <= least(now(), duel.ends_at);

  if now() >= duel.ends_at then
    winner := case when a > b then duel.challenger_id
                   when b > a then duel.opponent_id
                   else null end;
    update public.study_duels
    set status = 'completed',
        challenger_minutes = a,
        opponent_minutes = b,
        winner_id = winner,
        updated_at = now()
    where id = p_duel_id;
  else
    update public.study_duels
    set challenger_minutes = a,
        opponent_minutes = b,
        updated_at = now()
    where id = p_duel_id;
  end if;

  return jsonb_build_object(
    'status', case when now() >= duel.ends_at then 'completed' else 'active' end,
    'challenger_minutes', a,
    'opponent_minutes', b,
    'winner_id', winner
  );
end;
$$;
