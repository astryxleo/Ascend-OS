-- Qualify ranking aliases explicitly to avoid PL/pgSQL output-variable ambiguity.
create or replace function public.get_ascend_rankings(p_limit integer default 100)
returns table(user_id uuid,username text,display_name text,avatar_url text,army_quantity bigint,coins bigint,cash bigint,focus_minutes bigint,completed_steps bigint,completed_sessions bigint,completed_tasks bigint,combat_level integer,combat_rating integer,combat_wins bigint,power_score bigint,squad_count bigint)
language sql stable security definer set search_path=''
as $function$
 with focus as (
  select fs.user_id,sum(fs.duration_minutes)::bigint minutes,count(*)::bigint sessions
  from public.focus_sessions fs where coalesce(fs.completed,true) group by fs.user_id
 ), syllabus as (
  select cp.user_id,count(*) filter(where cp.completed)::bigint steps from public.chapter_progress cp group by cp.user_id
 ), tasks as (
  select pt.user_id,count(*) filter(where pt.completed)::bigint completed from public.planner_tasks pt group by pt.user_id
 ), squad_counts as (
  select ssm.user_id,count(distinct ssm.squad_id)::bigint squad_total from public.study_squad_members ssm group by ssm.user_id
 ), player_stats as (
  select p.id as uid,coalesce(nullif(trim(p.username),''),'student')::text as uname,
   coalesce(nullif(trim(p.full_name),''),nullif(trim(p.username),''),'Ascend Student')::text as display,
   p.avatar_url::text as avatar,coalesce(cc.army_quantity,5)::bigint as army,
   coalesce(w.coins,0)::bigint as coin_balance,coalesce(w.cash,0)::bigint as cash_balance,
   coalesce(f.minutes,0)::bigint as focus_total,coalesce(sy.steps,0)::bigint as steps_total,
   coalesce(f.sessions,0)::bigint as sessions_total,coalesce(t.completed,0)::bigint as tasks_total,
   coalesce(cf.level,1)::integer as fighter_level,coalesce(cf.rating,0)::integer as fighter_rating,
   coalesce(cf.wins,0)::bigint as fighter_wins,coalesce(sq.squad_total,0)::bigint as squads_total,
   (coalesce(cc.army_quantity,5)::bigint+coalesce(cc.command_level,1)::bigint*100+
    coalesce(cc.attack_level,1)::bigint*150+coalesce(cc.defense_level,1)::bigint*100+
    coalesce(cc.vitality_level,1)::bigint*100+coalesce(cc.discipline_level,1)::bigint*100+
    coalesce(cf.level,1)::bigint*250+coalesce(cf.rating,0)::bigint+coalesce(cf.wins,0)::bigint*25) as total_power
  from public.profiles p
  left join public.combat_customizations cc on cc.user_id=p.id
  left join public.wallets w on w.user_id=p.id
  left join public.combat_fighters cf on cf.user_id=p.id
  left join focus f on f.user_id=p.id left join syllabus sy on sy.user_id=p.id
  left join tasks t on t.user_id=p.id left join squad_counts sq on sq.user_id=p.id
  where p.role='student'
 )
 select ps.uid,ps.uname,ps.display,ps.avatar,ps.army,ps.coin_balance,ps.cash_balance,
  ps.focus_total,ps.steps_total,ps.sessions_total,ps.tasks_total,ps.fighter_level,
  ps.fighter_rating,ps.fighter_wins,ps.total_power,ps.squads_total
 from player_stats ps
 where auth.uid() is not null
 order by ps.total_power desc,ps.army desc,ps.focus_total desc
 limit greatest(1,least(coalesce(p_limit,100),100));
$function$;

create or replace function public.get_squad_rankings(p_limit integer default 100)
returns table(squad_id uuid,squad_name text,description text,member_count bigint,army_quantity bigint,ascend_power bigint,ascend_level integer,focus_minutes bigint,completed_steps bigint,coins bigint,squad_power bigint,created_at timestamptz)
language sql stable security definer set search_path=''
as $function$
 with member_stats as (
  select ssm.squad_id,count(*)::bigint as members,
   coalesce(sum(coalesce(cc.army_quantity,5)),0)::bigint as armies,
   coalesce(sum(coalesce(w.coins,0)),0)::bigint as wealth,
   coalesce(sum(coalesce(f.minutes,0)),0)::bigint as minutes,
   coalesce(sum(coalesce(cp.steps,0)),0)::bigint as steps
  from public.study_squad_members ssm
  left join public.combat_customizations cc on cc.user_id=ssm.user_id
  left join public.wallets w on w.user_id=ssm.user_id
  left join (select user_id,sum(duration_minutes)::bigint minutes from public.focus_sessions where coalesce(completed,true) group by user_id) f on f.user_id=ssm.user_id
  left join (select user_id,count(*) filter(where completed)::bigint steps from public.chapter_progress group by user_id) cp on cp.user_id=ssm.user_id
  group by ssm.squad_id
 ), squad_stats as (
  select s.id as sid,s.name as name,coalesce(s.description,'') as descr,
   coalesce(ms.members,0)::bigint as members,coalesce(s.army_quantity,5)::bigint as army,
   coalesce(s.ascend_power,0)::bigint as asc_power,coalesce(s.ascend_level,1)::integer as lvl,
   coalesce(ms.minutes,0)::bigint as minutes,coalesce(ms.steps,0)::bigint as steps,
   coalesce(ms.wealth,0)::bigint as wealth,
   (coalesce(s.ascend_power,0)::bigint+coalesce(s.army_quantity,5)::bigint+
    coalesce(s.ascend_level,1)::bigint*1000+coalesce(s.attack_level,1)::bigint*200+
    coalesce(s.defense_level,1)::bigint*150+coalesce(s.vitality_level,1)::bigint*150+
    coalesce(s.discipline_level,1)::bigint*150+coalesce(ms.minutes,0)::bigint*2+
    coalesce(ms.steps,0)::bigint*10) as total_power,s.created_at as made_at
  from public.study_squads s left join member_stats ms on ms.squad_id=s.id
 )
 select ss.sid,ss.name,ss.descr,ss.members,ss.army,ss.asc_power,ss.lvl,ss.minutes,ss.steps,ss.wealth,ss.total_power,ss.made_at
 from squad_stats ss where auth.uid() is not null
 order by ss.total_power desc,ss.members desc,ss.made_at asc
 limit greatest(1,least(coalesce(p_limit,100),100));
$function$;

revoke all on function public.get_ascend_rankings(integer) from public,anon;
revoke all on function public.get_squad_rankings(integer) from public,anon;
grant execute on function public.get_ascend_rankings(integer) to authenticated;
grant execute on function public.get_squad_rankings(integer) to authenticated;