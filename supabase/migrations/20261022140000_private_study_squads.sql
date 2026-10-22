-- Private, invite-only study squads. Membership and scoring are enforced by Postgres.
create extension if not exists pgcrypto;
create table if not exists public.study_squads (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(trim(name)) between 3 and 40),
 description text not null default '' check(char_length(description)<=240),
 invite_code text not null unique default upper(substr(encode(gen_random_bytes(8),'hex'),1,10)),
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.study_squad_members (
 squad_id uuid not null references public.study_squads(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check(role in ('leader','co_leader','member')),
 joined_at timestamptz not null default now(),
 primary key(squad_id,user_id)
);
create table if not exists public.study_squad_challenges (
 id uuid primary key default gen_random_uuid(),
 squad_id uuid not null references public.study_squads(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(trim(title)) between 3 and 100),
 description text not null default '' check(char_length(description)<=300),
 goal_type text not null check(goal_type in ('focus_minutes','tasks_completed')),
 target integer not null check(target between 1 and 100000),
 starts_at timestamptz not null default now(),
 ends_at timestamptz not null,
 created_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create index if not exists study_squad_members_user_idx on public.study_squad_members(user_id);
create index if not exists study_squad_challenges_squad_idx on public.study_squad_challenges(squad_id,ends_at desc);
create or replace function public.is_study_squad_member(p_squad uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.study_squad_members m where m.squad_id=p_squad and m.user_id=(select auth.uid())); $$;
create or replace function public.study_squad_role(p_squad uuid) returns text language sql stable security definer set search_path='' as $$ select m.role from public.study_squad_members m where m.squad_id=p_squad and m.user_id=(select auth.uid()) limit 1; $$;
alter table public.study_squads enable row level security;
alter table public.study_squad_members enable row level security;
alter table public.study_squad_challenges enable row level security;
revoke all on public.study_squads,public.study_squad_members,public.study_squad_challenges from anon;
grant select,delete on public.study_squads to authenticated;
grant select,delete on public.study_squad_members to authenticated;
grant select,insert,update,delete on public.study_squad_challenges to authenticated;
drop policy if exists "Members can view their squads" on public.study_squads;
create policy "Members can view their squads" on public.study_squads for select to authenticated using(public.is_study_squad_member(id));
drop policy if exists "Leaders can delete squads" on public.study_squads;
create policy "Leaders can delete squads" on public.study_squads for delete to authenticated using(public.study_squad_role(id)='leader');
drop policy if exists "Members can view squad membership" on public.study_squad_members;
create policy "Members can view squad membership" on public.study_squad_members for select to authenticated using(public.is_study_squad_member(squad_id));
drop policy if exists "Leaders can manage membership" on public.study_squad_members;
drop policy if exists "Members can leave or leaders manage membership" on public.study_squad_members;
create policy "Members can leave or leaders manage membership" on public.study_squad_members for delete to authenticated using((user_id=(select auth.uid()) and role<>'leader') or (public.study_squad_role(squad_id) in ('leader','co_leader') and (user_id<>(select auth.uid()) or role<>'leader')));
drop policy if exists "Members can view squad challenges" on public.study_squad_challenges;
create policy "Members can view squad challenges" on public.study_squad_challenges for select to authenticated using(public.is_study_squad_member(squad_id));
drop policy if exists "Leaders can create squad challenges" on public.study_squad_challenges;
create policy "Leaders can create squad challenges" on public.study_squad_challenges for insert to authenticated with check(public.is_study_squad_member(squad_id) and public.study_squad_role(squad_id) in ('leader','co_leader') and created_by=(select auth.uid()));
drop policy if exists "Leaders can update squad challenges" on public.study_squad_challenges;
create policy "Leaders can update squad challenges" on public.study_squad_challenges for update to authenticated using(public.study_squad_role(squad_id) in ('leader','co_leader')) with check(public.study_squad_role(squad_id) in ('leader','co_leader'));
drop policy if exists "Leaders can delete squad challenges" on public.study_squad_challenges;
create policy "Leaders can delete squad challenges" on public.study_squad_challenges for delete to authenticated using(public.study_squad_role(squad_id) in ('leader','co_leader'));
create or replace function public.create_study_squad(p_name text,p_description text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); sid uuid;
begin
 if actor is null then raise exception 'Sign in to create a squad.'; end if;
 if char_length(trim(coalesce(p_name,''))) not between 3 and 40 then raise exception 'Squad name must be 3–40 characters.'; end if;
 if char_length(coalesce(p_description,''))>240 then raise exception 'Description must be under 240 characters.'; end if;
 if (select count(*) from public.study_squad_members where user_id=actor)>=10 then raise exception 'You can belong to at most 10 squads.'; end if;
 insert into public.study_squads(name,description,created_by) values(trim(p_name),coalesce(trim(p_description),''),actor) returning id into sid;
 insert into public.study_squad_members(squad_id,user_id,role) values(sid,actor,'leader'); return sid;
end; $$;
create or replace function public.join_study_squad(p_invite_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); sid uuid; member_count integer;
begin
 if actor is null then raise exception 'Sign in to join a squad.'; end if;
 select s.id into sid from public.study_squads s where s.invite_code=upper(trim(coalesce(p_invite_code,'')));
 if sid is null then raise exception 'That invite code is invalid.'; end if;
 if exists(select 1 from public.study_squad_members where squad_id=sid and user_id=actor) then return sid; end if;
 select count(*) into member_count from public.study_squad_members where squad_id=sid;
 if member_count>=5 then raise exception 'This squad is full (maximum 5 members).'; end if;
 if (select count(*) from public.study_squad_members where user_id=actor)>=10 then raise exception 'You can belong to at most 10 squads.'; end if;
 insert into public.study_squad_members(squad_id,user_id,role) values(sid,actor,'member'); return sid;
end; $$;
create or replace function public.get_my_study_squads() returns table(id uuid,name text,description text,invite_code text,created_by uuid,created_at timestamptz,my_role text,member_count bigint) language sql stable security definer set search_path='' as $$
 select s.id,s.name,s.description,s.invite_code,s.created_by,s.created_at,m.role,(select count(*) from public.study_squad_members x where x.squad_id=s.id)
 from public.study_squads s join public.study_squad_members m on m.squad_id=s.id where m.user_id=(select auth.uid()) order by s.created_at desc;
$$;
create or replace function public.get_study_squad_leaderboard(p_squad_id uuid) returns table(user_id uuid,display_name text,avatar_url text,role text,focus_minutes bigint,tasks_completed bigint,score bigint) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_study_squad_member(p_squad_id) then raise exception 'Squad membership required.'; end if;
 return query select m.user_id,coalesce(nullif(p.full_name,''),nullif(p.username,''),'Student'),p.avatar_url,m.role,coalesce(f.focus_minutes,0)::bigint,coalesce(t.tasks_completed,0)::bigint,(coalesce(f.focus_minutes,0)+coalesce(t.tasks_completed,0)*25)::bigint
 from public.study_squad_members m left join public.profiles p on p.id=m.user_id
 left join lateral(select sum(fs.duration_minutes)::bigint focus_minutes from public.focus_sessions fs where fs.user_id=m.user_id and fs.completed and fs.ended_at>=now()-interval '30 days') f on true
 left join lateral(select count(*)::bigint tasks_completed from public.planner_tasks pt where pt.user_id=m.user_id and pt.completed and pt.completed_at>=now()-interval '30 days') t on true
 where m.squad_id=p_squad_id order by score desc,display_name;
end; $$;
create or replace function public.create_study_squad_challenge(p_squad_id uuid,p_title text,p_description text,p_goal_type text,p_target integer,p_duration_days integer default 7) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); cid uuid;
begin
 if actor is null or not public.is_study_squad_member(p_squad_id) or public.study_squad_role(p_squad_id) not in ('leader','co_leader') then raise exception 'Only squad leaders can create challenges.'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 3 and 100 then raise exception 'Challenge title must be 3–100 characters.'; end if;
 if p_goal_type not in ('focus_minutes','tasks_completed') then raise exception 'Invalid challenge type.'; end if;
 if p_target not between 1 and 100000 or p_duration_days not between 1 and 30 then raise exception 'Check the target and duration.'; end if;
 insert into public.study_squad_challenges(squad_id,created_by,title,description,goal_type,target,starts_at,ends_at) values(p_squad_id,actor,trim(p_title),coalesce(trim(p_description),''),p_goal_type,p_target,now(),now()+make_interval(days=>p_duration_days)) returning id into cid; return cid;
end; $$;
revoke all on function public.is_study_squad_member(uuid) from public,anon;
revoke all on function public.study_squad_role(uuid) from public,anon;
revoke all on function public.create_study_squad(text,text) from public,anon;
revoke all on function public.join_study_squad(text) from public,anon;
revoke all on function public.get_my_study_squads() from public,anon;
revoke all on function public.get_study_squad_leaderboard(uuid) from public,anon;
revoke all on function public.create_study_squad_challenge(uuid,text,text,text,integer,integer) from public,anon;
grant execute on function public.is_study_squad_member(uuid) to authenticated;
grant execute on function public.study_squad_role(uuid) to authenticated;
grant execute on function public.create_study_squad(text,text) to authenticated;
grant execute on function public.join_study_squad(text) to authenticated;
grant execute on function public.get_my_study_squads() to authenticated;
grant execute on function public.get_study_squad_leaderboard(uuid) to authenticated;
grant execute on function public.create_study_squad_challenge(uuid,text,text,text,integer,integer) to authenticated;
