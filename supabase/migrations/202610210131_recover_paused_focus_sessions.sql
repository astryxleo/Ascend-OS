-- Keep paused sessions recoverable across long breaks, while expiring abandoned running sessions.
create or replace function public.start_focus_session(subject_name text, mode_name text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 actor uuid := (select auth.uid());
 target integer;
 run_id uuid;
 active_count integer;
begin
 if actor is null then raise exception 'authentication required'; end if;
 if mode_name not in ('pomodoro','deep_sprint','extreme_grind','stopwatch') then raise exception 'invalid focus mode'; end if;
 target := case mode_name when 'pomodoro' then 25 when 'deep_sprint' then 50 when 'extreme_grind' then 90 else 180 end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
 select count(*) into active_count
 from public.focus_session_runs
 where user_id=actor and completed_at is null
   and (paused_at is not null or started_at > now()-interval '4 hours');
 if active_count>0 then raise exception 'You already have an unfinished focus session. Resume or reset it first.'; end if;
 insert into public.focus_session_runs(user_id,subject,mode,target_minutes)
 values(actor,nullif(trim(subject_name),''),mode_name,target)
 returning id into run_id;
 return jsonb_build_object('session_id',run_id,'started_at',now(),'target_minutes',target);
end;
$$;
revoke all on function public.start_focus_session(text,text) from public, anon;
grant execute on function public.start_focus_session(text,text) to authenticated;
