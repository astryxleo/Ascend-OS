-- Server-authoritative pause/resume for focus sessions.
alter table public.focus_session_runs
  add column if not exists paused_at timestamptz,
  add column if not exists paused_seconds integer not null default 0
    check (paused_seconds >= 0);

create or replace function public.pause_focus_session(run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := (select auth.uid());
  run public.focus_session_runs%rowtype;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select * into run
    from public.focus_session_runs
    where id=run_id and user_id=actor
    for update;
  if not found then raise exception 'focus session not found'; end if;
  if run.completed_at is not null then raise exception 'focus session already completed'; end if;
  if run.paused_at is not null then raise exception 'focus session is already paused'; end if;
  update public.focus_session_runs set paused_at=now() where id=run.id;
  return jsonb_build_object('session_id',run.id,'paused_at',now(),'paused_seconds',run.paused_seconds);
end;
$$;
revoke all on function public.pause_focus_session(uuid) from public, anon;
grant execute on function public.pause_focus_session(uuid) to authenticated;

create or replace function public.resume_focus_session(run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := (select auth.uid());
  run public.focus_session_runs%rowtype;
  new_paused_seconds integer;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select * into run
    from public.focus_session_runs
    where id=run_id and user_id=actor
    for update;
  if not found then raise exception 'focus session not found'; end if;
  if run.completed_at is not null then raise exception 'focus session already completed'; end if;
  if run.paused_at is null then raise exception 'focus session is not paused'; end if;
  new_paused_seconds := run.paused_seconds + greatest(0,floor(extract(epoch from (now()-run.paused_at)))::integer);
  update public.focus_session_runs
    set paused_at=null, paused_seconds=new_paused_seconds
    where id=run.id;
  return jsonb_build_object('session_id',run.id,'paused_seconds',new_paused_seconds,'resumed_at',now());
end;
$$;
revoke all on function public.resume_focus_session(uuid) from public, anon;
grant execute on function public.resume_focus_session(uuid) to authenticated;

create or replace function public.complete_focus_session(run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := (select auth.uid());
  run public.focus_session_runs%rowtype;
  elapsed integer;
  active_seconds integer;
  used_today integer;
  reward_coins integer;
  reward_xp integer;
  saved_id uuid;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select * into run from public.focus_session_runs where id=run_id and user_id=actor for update;
  if not found then raise exception 'focus session not found'; end if;
  if run.completed_at is not null then raise exception 'focus session already rewarded'; end if;
  if run.paused_at is not null then raise exception 'Resume the focus session before claiming rewards.'; end if;

  active_seconds := greatest(0,floor(extract(epoch from (now()-run.started_at)))::integer-run.paused_seconds);
  elapsed := floor(active_seconds/60.0)::integer;
  if elapsed < run.target_minutes then raise exception 'Focus interval has not elapsed yet.'; end if;
  if run.mode='stopwatch' then elapsed := least(elapsed,180); else elapsed := run.target_minutes; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  select coalesce(sum(duration_minutes),0)::integer into used_today
    from public.focus_sessions
    where user_id=actor
      and ended_at >= ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata');
  if used_today+elapsed>600 then raise exception 'daily rewarded focus limit reached'; end if;

  reward_coins := elapsed;
  reward_xp := elapsed*2;
  insert into public.focus_sessions(user_id,subject,mode,duration_minutes,started_at,ended_at,xp_earned,coins_earned,completed)
    values(actor,run.subject,run.mode,elapsed,run.started_at,now(),reward_xp,reward_coins,true)
    returning id into saved_id;
  update public.wallets set coins=coins+reward_coins where user_id=actor;
  if not found then raise exception 'wallet not initialized'; end if;
  insert into public.wallet_transactions(user_id,currency,amount,reason,source)
    values(actor,'coins',reward_coins,'Focus session · '||elapsed||' minutes','focus_session');
  insert into public.activity_events(user_id,event_type,title,detail)
    values(actor,'focus_completed','Focus session completed',jsonb_build_object('session_id',saved_id,'minutes',elapsed,'xp',reward_xp,'coins',reward_coins,'mode',run.mode,'subject',run.subject));
  update public.focus_session_runs set completed_at=now(),rewarded_session_id=saved_id where id=run.id;
  return jsonb_build_object('session_id',saved_id,'minutes',elapsed,'coins_earned',reward_coins,'xp_earned',reward_xp);
end;
$$;
revoke all on function public.complete_focus_session(uuid) from public, anon;
grant execute on function public.complete_focus_session(uuid) to authenticated;
