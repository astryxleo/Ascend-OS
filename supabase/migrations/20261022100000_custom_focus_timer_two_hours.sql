-- Add a server-anchored custom focus session, capped at two hours.
alter table public.focus_session_runs drop constraint if exists focus_session_runs_mode_check;
alter table public.focus_session_runs
  add constraint focus_session_runs_mode_check
  check (mode = any (array['pomodoro','deep_sprint','extreme_grind','stopwatch','custom']::text[]));

alter table public.focus_sessions drop constraint if exists focus_sessions_mode_check;
alter table public.focus_sessions
  add constraint focus_sessions_mode_check
  check (mode = any (array['pomodoro','deep_sprint','extreme_grind','stopwatch','custom']::text[]));

create or replace function public.start_custom_focus_session(subject_name text, target_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := (select auth.uid());
  run_id uuid;
  started timestamptz;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if target_minutes is null or target_minutes < 1 or target_minutes > 120 then
    raise exception 'Custom focus duration must be between 1 and 120 minutes.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  if exists (
    select 1 from public.focus_session_runs
    where user_id=actor and completed_at is null
      and (paused_at is not null or started_at > now()-interval '4 hours')
  ) then
    raise exception 'You already have an unfinished focus session. Resume or reset it first.';
  end if;

  insert into public.focus_session_runs(user_id,subject,mode,target_minutes)
  values(actor,nullif(trim(subject_name),''),'custom',target_minutes)
  returning id, started_at into run_id, started;

  return jsonb_build_object('session_id',run_id,'started_at',started,'target_minutes',target_minutes);
end;
$$;

revoke all on function public.start_custom_focus_session(text,integer) from public, anon;
grant execute on function public.start_custom_focus_session(text,integer) to authenticated;
