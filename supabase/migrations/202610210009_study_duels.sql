-- Private, participant-scoped study duels with server-computed focus totals.
create table if not exists public.study_duels (
 id uuid primary key default gen_random_uuid(),
 challenger_id uuid not null references public.profiles(id) on delete cascade,
 opponent_id uuid not null references public.profiles(id) on delete cascade,
 goal_minutes integer not null check (goal_minutes between 15 and 600),
 status text not null default 'pending' check (status in ('pending','active','completed','declined','cancelled')),
 starts_at timestamptz, ends_at timestamptz,
 challenger_minutes integer not null default 0, opponent_minutes integer not null default 0,
 winner_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint study_duels_distinct_users check (challenger_id <> opponent_id)
);
create index if not exists study_duels_challenger_created_idx on public.study_duels(challenger_id,created_at desc);
create index if not exists study_duels_opponent_created_idx on public.study_duels(opponent_id,created_at desc);
alter table public.study_duels enable row level security;
drop policy if exists "participants read their duels" on public.study_duels;
create policy "participants read their duels" on public.study_duels for select to authenticated using (challenger_id=(select auth.uid()) or opponent_id=(select auth.uid()));
grant select on public.study_duels to authenticated;

create or replace function public.create_study_duel(p_opponent_username text,p_goal_minutes integer default 120)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); target uuid; duel_id uuid;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if p_goal_minutes not between 15 and 600 then raise exception 'Goal must be between 15 and 600 minutes'; end if;
 select id into target from public.profiles where lower(username)=lower(trim(p_opponent_username)) and role='student' limit 1;
 if target is null then raise exception 'No student found with that username'; end if;
 if target=actor then raise exception 'You cannot challenge yourself'; end if;
 if exists(select 1 from public.study_duels where status in ('pending','active') and ((challenger_id=actor and opponent_id=target) or (challenger_id=target and opponent_id=actor))) then raise exception 'There is already an open duel between these students'; end if;
 insert into public.study_duels(challenger_id,opponent_id,goal_minutes) values(actor,target,p_goal_minutes) returning id into duel_id;
 return jsonb_build_object('id',duel_id);
end $$;

create or replace function public.respond_study_duel(p_duel_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); duel public.study_duels%rowtype;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 select * into duel from public.study_duels where id=p_duel_id for update;
 if not found then raise exception 'Duel not found'; end if;
 if duel.opponent_id<>actor then raise exception 'Only the challenged student can respond'; end if;
 if duel.status<>'pending' then raise exception 'This duel is no longer pending'; end if;
 if p_accept then update public.study_duels set status='active',starts_at=now(),ends_at=now()+interval '24 hours',updated_at=now() where id=p_duel_id;
 else update public.study_duels set status='declined',updated_at=now() where id=p_duel_id; end if;
 return jsonb_build_object('success',true);
end $$;

create or replace function public.refresh_study_duel(p_duel_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); duel public.study_duels%rowtype; a bigint; b bigint; winner uuid;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 select * into duel from public.study_duels where id=p_duel_id and (challenger_id=actor or opponent_id=actor) for update;
 if not found then raise exception 'Duel not found'; end if;
 if duel.status<>'active' then return jsonb_build_object('status',duel.status); end if;
 select coalesce(sum(duration_minutes),0) into a from public.focus_sessions where user_id=duel.challenger_id and ended_at>=duel.starts_at and ended_at<=least(now(),duel.ends_at);
 select coalesce(sum(duration_minutes),0) into b from public.focus_sessions where user_id=duel.opponent_id and ended_at>=duel.starts_at and ended_at<=least(now(),duel.ends_at);
 if now()>=duel.ends_at then
   winner:=case when a>b then duel.challenger_id when b>a then duel.opponent_id else null end;
   update public.study_duels set status='completed',challenger_minutes=a,opponent_minutes=b,winner_id=winner,updated_at=now() where id=p_duel_id;
 else update public.study_duels set challenger_minutes=a,opponent_minutes=b,updated_at=now() where id=p_duel_id; end if;
 return jsonb_build_object('status',case when now()>=duel.ends_at then 'completed' else 'active' end,'challenger_minutes',a,'opponent_minutes',b,'winner_id',winner);
end $$;
revoke all on function public.create_study_duel(text,integer) from public,anon;
revoke all on function public.respond_study_duel(uuid,boolean) from public,anon;
revoke all on function public.refresh_study_duel(uuid) from public,anon;
grant execute on function public.create_study_duel(text,integer) to authenticated;
grant execute on function public.respond_study_duel(uuid,boolean) to authenticated;
grant execute on function public.refresh_study_duel(uuid) to authenticated;
