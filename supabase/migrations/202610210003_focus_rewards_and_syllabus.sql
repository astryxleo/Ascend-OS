-- Secure, server-calculated focus settlement and academic activity feed.
create or replace function public.settle_focus_session(subject_name text, mode_name text, requested_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := (select auth.uid());
  max_minutes integer;
  actual_minutes integer;
  coins_reward integer;
  xp_reward integer;
  used_today integer;
  session_id uuid;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if mode_name not in ('pomodoro','deep_sprint','extreme_grind','stopwatch') then raise exception 'invalid focus mode'; end if;
  max_minutes := case mode_name when 'pomodoro' then 25 when 'deep_sprint' then 50 when 'extreme_grind' then 90 else 180 end;
  if requested_minutes is null or requested_minutes < 1 or requested_minutes > max_minutes then raise exception 'duration is outside the allowed range for this mode'; end if;
  actual_minutes := requested_minutes;
  select coalesce(sum(duration_minutes),0)::integer into used_today
  from public.focus_sessions
  where user_id=actor and ended_at >= ((now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata');
  if used_today + actual_minutes > 600 then raise exception 'daily rewarded focus limit reached'; end if;
  coins_reward := actual_minutes;
  xp_reward := actual_minutes * 2;
  insert into public.focus_sessions(user_id,subject,mode,duration_minutes,started_at,ended_at,xp_earned,coins_earned,completed)
  values(actor,nullif(trim(subject_name),''),mode_name,actual_minutes,now()-(actual_minutes||' minutes')::interval,now(),xp_reward,coins_reward,true)
  returning id into session_id;
  update public.wallets set coins=coins+coins_reward where user_id=actor;
  if not found then raise exception 'wallet not initialized'; end if;
  insert into public.wallet_transactions(user_id,currency,amount,reason,source)
  values(actor,'coins',coins_reward,'Focus session · '||actual_minutes||' minutes','focus_session');
  insert into public.activity_events(user_id,event_type,title,detail)
  values(actor,'focus_completed','Focus session completed',jsonb_build_object('session_id',session_id,'minutes',actual_minutes,'xp',xp_reward,'coins',coins_reward,'mode',mode_name,'subject',nullif(trim(subject_name),'')));
  return jsonb_build_object('session_id',session_id,'minutes',actual_minutes,'coins_earned',coins_reward,'xp_earned',xp_reward);
end;
$$;
revoke all on function public.settle_focus_session(text,text,integer) from public, anon;
grant execute on function public.settle_focus_session(text,text,integer) to authenticated;

-- Public syllabus catalog is authored by the operator; personal completion remains user-scoped.
create table if not exists public.syllabus_steps (
  id text primary key,
  subject_id text not null,
  chapter_id text not null,
  chapter_title text not null,
  step_title text not null,
  step_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.syllabus_steps enable row level security;
drop policy if exists "published syllabus readable" on public.syllabus_steps;
create policy "published syllabus readable" on public.syllabus_steps for select to authenticated using(is_published or public.is_operator());
drop policy if exists "operator authors syllabus" on public.syllabus_steps;
create policy "operator authors syllabus" on public.syllabus_steps for all to authenticated using(public.is_operator()) with check(public.is_operator());
grant select,insert,update,delete on public.syllabus_steps to authenticated;
create index if not exists syllabus_steps_subject_chapter_order_idx on public.syllabus_steps(subject_id,chapter_id,step_order);
