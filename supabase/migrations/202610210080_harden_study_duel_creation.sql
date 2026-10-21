-- Harden study-duel creation against search_path-based object shadowing.
create or replace function public.create_study_duel(p_opponent_username text, p_goal_minutes integer default 120)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 actor uuid := auth.uid();
 target uuid;
 duel_id uuid;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if p_goal_minutes is null or p_goal_minutes not between 15 and 600 then
   raise exception 'Goal must be between 15 and 600 minutes';
 end if;
 select id into target
 from public.profiles
 where lower(username)=lower(trim(p_opponent_username)) and role='student'
 limit 1;
 if target is null then raise exception 'No student found with that username'; end if;
 if target=actor then raise exception 'You cannot challenge yourself'; end if;
 if exists(
   select 1 from public.study_duels
   where status in ('pending','active')
     and ((challenger_id=actor and opponent_id=target) or (challenger_id=target and opponent_id=actor))
 ) then
   raise exception 'There is already an open duel between these students';
 end if;
 insert into public.study_duels(challenger_id,opponent_id,goal_minutes)
 values(actor,target,p_goal_minutes)
 returning id into duel_id;
 return jsonb_build_object('id',duel_id);
end;
$$;
revoke all on function public.create_study_duel(text,integer) from public, anon;
grant execute on function public.create_study_duel(text,integer) to authenticated;
