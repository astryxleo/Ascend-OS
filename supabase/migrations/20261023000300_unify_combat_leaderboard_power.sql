-- Public, aggregate-only rankings for Ascend OS. Never expose email or private account fields.
create or replace function public.get_ascend_rankings(p_limit integer default 100)
returns table(
  user_id uuid, username text, display_name text, avatar_url text,
  army_quantity bigint, coins bigint, cash bigint, focus_minutes bigint,
  completed_steps bigint, completed_sessions bigint, completed_tasks bigint,
  combat_level integer, combat_rating integer, combat_wins bigint,
  power_score bigint, squad_count bigint
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query
  with focus as (
    select fs.user_id, sum(fs.duration_minutes)::bigint minutes,
           count(*)::bigint sessions
    from public.focus_sessions fs
    where coalesce(fs.completed, true)
    group by fs.user_id
  ), syllabus as (
    select cp.user_id, count(*) filter (where cp.completed)::bigint steps
    from public.chapter_progress cp group by cp.user_id
  ), tasks as (
    select pt.user_id, count(*) filter (where pt.completed)::bigint completed
    from public.planner_tasks pt group by pt.user_id
  ), squads as (
    select ssm.user_id, count(distinct ssm.squad_id)::bigint squad_total
    from public.study_squad_members ssm group by ssm.user_id
  )
  select p.id,
    coalesce(nullif(trim(p.username), ''), 'student')::text,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.username), ''), 'Ascend Student')::text,
    p.avatar_url::text,
    coalesce(cc.army_quantity, 5)::bigint,
    coalesce(w.coins, 0)::bigint,
    coalesce(w.cash, 0)::bigint,
    coalesce(f.minutes, 0)::bigint,
    coalesce(sy.steps, 0)::bigint,
    coalesce(f.sessions, 0)::bigint,
    coalesce(t.completed, 0)::bigint,
    coalesce(cf.level, 1)::integer,
    coalesce(cf.rating, 0)::integer,
    coalesce(cf.wins, 0)::bigint,
    (coalesce(cc.army_quantity,5)::bigint * 100
      + coalesce(cc.attack_level,1)::bigint * 140
      + coalesce(cc.defense_level,1)::bigint * 120
      + coalesce(cc.vitality_level,1)::bigint * 130
      + coalesce(cc.command_level,1)::bigint * 160
      + coalesce(cc.discipline_level,1)::bigint * 100) as power_score,
    coalesce(sq.squad_total, 0)::bigint
  from public.profiles p
  left join public.combat_customizations cc on cc.user_id=p.id
  left join public.wallets w on w.user_id=p.id
  left join public.combat_fighters cf on cf.user_id=p.id
  left join focus f on f.user_id=p.id
  left join syllabus sy on sy.user_id=p.id
  left join tasks t on t.user_id=p.id
  left join squads sq on sq.user_id=p.id
  where p.role = 'student'
  order by power_score desc, army_quantity desc, focus_minutes desc
  limit greatest(1, least(coalesce(p_limit,100),100));
end;
$function$;

create or replace function public.get_squad_rankings(p_limit integer default 100)
returns table(
  squad_id uuid, squad_name text, description text, member_count bigint,
  army_quantity bigint, ascend_power bigint, ascend_level integer,
  focus_minutes bigint, completed_steps bigint, coins bigint,
  squad_power bigint, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query
  with member_stats as (
    select ssm.squad_id,
      count(*)::bigint members,
      coalesce(sum(coalesce(cc.army_quantity,5)),0)::bigint armies,
      coalesce(sum(coalesce(w.coins,0)),0)::bigint wealth,
      coalesce(sum(coalesce(f.minutes,0)),0)::bigint minutes,
      coalesce(sum(coalesce(cp.steps,0)),0)::bigint steps
    from public.study_squad_members ssm
    left join public.combat_customizations cc on cc.user_id=ssm.user_id
    left join public.wallets w on w.user_id=ssm.user_id
    left join (select user_id,sum(duration_minutes)::bigint minutes from public.focus_sessions where coalesce(completed,true) group by user_id) f on f.user_id=ssm.user_id
    left join (select user_id,count(*) filter(where completed)::bigint steps from public.chapter_progress group by user_id) cp on cp.user_id=ssm.user_id
    group by ssm.squad_id
  )
  select s.id, s.name, coalesce(s.description,''), coalesce(ms.members,0),
    coalesce(s.army_quantity,5)::bigint, coalesce(s.ascend_power,0)::bigint,
    coalesce(s.ascend_level,1)::integer, coalesce(ms.minutes,0)::bigint,
    coalesce(ms.steps,0)::bigint, coalesce(ms.wealth,0)::bigint,
    (coalesce(s.ascend_power,0)::bigint
      + coalesce(s.army_quantity,5)::bigint
      + coalesce(s.ascend_level,1)::bigint * 1000
      + coalesce(s.attack_level,1)::bigint * 200
      + coalesce(s.defense_level,1)::bigint * 150
      + coalesce(s.vitality_level,1)::bigint * 150
      + coalesce(s.discipline_level,1)::bigint * 150
      + coalesce(ms.minutes,0)::bigint * 2
      + coalesce(ms.steps,0)::bigint * 10) as squad_power,
    s.created_at
  from public.study_squads s
  left join member_stats ms on ms.squad_id=s.id
  order by squad_power desc, member_count desc, s.created_at asc
  limit greatest(1, least(coalesce(p_limit,100),100));
end;
$function$;

revoke all on function public.get_ascend_rankings(integer) from public, anon;
revoke all on function public.get_squad_rankings(integer) from public, anon;
grant execute on function public.get_ascend_rankings(integer) to authenticated;
grant execute on function public.get_squad_rankings(integer) to authenticated;
