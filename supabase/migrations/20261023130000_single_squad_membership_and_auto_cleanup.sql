-- Enforce one squad per user at the database layer, hide entry actions in the UI,
-- and safely remove a squad only after its final member leaves.
create or replace function public.create_study_squad(p_name text,p_description text default '')
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 actor uuid := (select auth.uid());
 sid uuid;
begin
 if actor is null then raise exception 'Sign in to create a squad.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if exists(select 1 from public.study_squad_members where user_id=actor) then
   raise exception 'Leave your current squad before creating another one.';
 end if;
 if char_length(trim(coalesce(p_name,''))) not between 3 and 40 then
   raise exception 'Squad name must be 3–40 characters.';
 end if;
 if char_length(coalesce(p_description,''))>240 then
   raise exception 'Description must be under 240 characters.';
 end if;
 insert into public.study_squads(name,description,created_by)
 values(trim(p_name),coalesce(trim(p_description),''),actor)
 returning id into sid;
 insert into public.study_squad_members(squad_id,user_id,role)
 values(sid,actor,'leader');
 return sid;
end;
$$;

create or replace function public.join_study_squad(p_invite_code text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 actor uuid := (select auth.uid());
 sid uuid;
 member_count integer;
begin
 if actor is null then raise exception 'Sign in to join a squad.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if exists(select 1 from public.study_squad_members where user_id=actor) then
   raise exception 'Leave your current squad before joining another one.';
 end if;
 select s.id into sid
 from public.study_squads s
 where s.invite_code=upper(trim(coalesce(p_invite_code,'')))
 for update;
 if sid is null then raise exception 'That invite code is invalid.'; end if;
 select count(*) into member_count
 from public.study_squad_members
 where squad_id=sid;
 if member_count>=5 then raise exception 'This squad is full (maximum 5 members).'; end if;
 insert into public.study_squad_members(squad_id,user_id,role)
 values(sid,actor,'member');
 return sid;
end;
$$;

create or replace function public.leave_study_squad(p_squad_id uuid)
returns text
language plpgsql security definer set search_path=''
as $$
declare
 actor uuid := (select auth.uid());
 actor_role text;
 remaining_user uuid;
begin
 if actor is null then raise exception 'Sign in to leave a squad.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 perform 1 from public.study_squads where id=p_squad_id for update;
 if not found then raise exception 'This squad no longer exists.'; end if;

 select role into actor_role
 from public.study_squad_members
 where squad_id=p_squad_id and user_id=actor
 for update;
 if actor_role is null then raise exception 'You are not a member of this squad.'; end if;

 select user_id into remaining_user
 from public.study_squad_members
 where squad_id=p_squad_id and user_id<>actor
 order by case when role='co_leader' then 0 else 1 end, joined_at asc
 limit 1
 for update;

 if actor_role='leader' and remaining_user is not null then
   update public.study_squad_members set role='leader'
   where squad_id=p_squad_id and user_id=remaining_user;
 end if;

 delete from public.study_squad_members
 where squad_id=p_squad_id and user_id=actor;

 if not exists(select 1 from public.study_squad_members where squad_id=p_squad_id) then
   delete from public.study_squads where id=p_squad_id;
   return 'deleted';
 end if;
 return 'left';
end;
$$;

revoke all on function public.create_study_squad(text,text) from public,anon;
revoke all on function public.join_study_squad(text) from public,anon;
revoke all on function public.leave_study_squad(uuid) from public,anon;
grant execute on function public.create_study_squad(text,text) to authenticated;
grant execute on function public.join_study_squad(text) to authenticated;
grant execute on function public.leave_study_squad(uuid) to authenticated;
