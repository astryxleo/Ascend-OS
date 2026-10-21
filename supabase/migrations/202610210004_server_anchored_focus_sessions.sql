-- Replace client-asserted duration settlement with server-timestamped sessions.
create table if not exists public.focus_session_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 subject text,
 mode text not null check(mode in ('pomodoro','deep_sprint','extreme_grind','stopwatch')),
 target_minutes integer not null check(target_minutes between 1 and 180),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 rewarded_session_id uuid references public.focus_sessions(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists focus_session_runs_user_started_idx on public.focus_session_runs(user_id,started_at desc);
alter table public.focus_session_runs enable row level security;
drop policy if exists "focus runs read own" on public.focus_session_runs;
create policy "focus runs read own" on public.focus_session_runs for select to authenticated using(user_id=(select auth.uid()) or public.is_operator());
grant select on public.focus_session_runs to authenticated;
revoke all on function public.settle_focus_session(text,text,integer) from public, anon, authenticated;
create or replace function public.start_focus_session(subject_name text, mode_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); target integer; run_id uuid; active_count integer;
begin
 if actor is null then raise exception 'authentication required'; end if;
 if mode_name not in ('pomodoro','deep_sprint','extreme_grind','stopwatch') then raise exception 'invalid focus mode'; end if;
 target := case mode_name when 'pomodoro' then 25 when 'deep_sprint' then 50 when 'extreme_grind' then 90 else 180 end;
 select count(*) into active_count from public.focus_session_runs where user_id=actor and completed_at is null and started_at > now()-interval '4 hours';
 if active_count>0 then raise exception 'You already have an unfinished focus session. Resume or reset it first.'; end if;
 insert into public.focus_session_runs(user_id,subject,mode,target_minutes) values(actor,nullif(trim(subject_name),''),mode_name,target) returning id into run_id;
 return jsonb_build_object('session_id',run_id,'started_at',now(),'target_minutes',target);
end; $$;
revoke all on function public.start_focus_session(text,text) from public, anon;
grant execute on function public.start_focus_session(text,text) to authenticated;
create or replace function public.complete_focus_session(run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); run public.focus_session_runs%rowtype; elapsed integer; used_today integer; reward_coins integer; reward_xp integer; saved_id uuid;
begin
 if actor is null then raise exception 'authentication required'; end if;
 select * into run from public.focus_session_runs where id=run_id and user_id=actor for update;
 if not found then raise exception 'focus session not found'; end if;
 if run.completed_at is not null then raise exception 'focus session already rewarded'; end if;
 elapsed := floor(extract(epoch from (now()-run.started_at))/60)::integer;
 if elapsed < run.target_minutes then raise exception 'Focus interval has not elapsed yet.'; end if;
 if run.mode='stopwatch' then elapsed := least(elapsed,180); else elapsed := run.target_minutes; end if;
 select coalesce(sum(duration_minutes),0)::integer into used_today from public.focus_sessions where user_id=actor and ended_at >= ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata');
 if used_today+elapsed>600 then raise exception 'daily rewarded focus limit reached'; end if;
 reward_coins := elapsed; reward_xp := elapsed*2;
 insert into public.focus_sessions(user_id,subject,mode,duration_minutes,started_at,ended_at,xp_earned,coins_earned,completed)
 values(actor,run.subject,run.mode,elapsed,run.started_at,now(),reward_xp,reward_coins,true) returning id into saved_id;
 update public.wallets set coins=coins+reward_coins where user_id=actor;
 if not found then raise exception 'wallet not initialized'; end if;
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(actor,'coins',reward_coins,'Focus session · '||elapsed||' minutes','focus_session');
 insert into public.activity_events(user_id,event_type,title,detail) values(actor,'focus_completed','Focus session completed',jsonb_build_object('session_id',saved_id,'minutes',elapsed,'xp',reward_xp,'coins',reward_coins,'mode',run.mode,'subject',run.subject));
 update public.focus_session_runs set completed_at=now(),rewarded_session_id=saved_id where id=run.id;
 return jsonb_build_object('session_id',saved_id,'minutes',elapsed,'coins_earned',reward_coins,'xp_earned',reward_xp);
end; $$;
revoke all on function public.complete_focus_session(uuid) from public, anon;
grant execute on function public.complete_focus_session(uuid) to authenticated;
