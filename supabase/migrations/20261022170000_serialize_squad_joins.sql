-- Serialize invite-code joins on the squad row so concurrent joins cannot exceed five members.
create or replace function public.join_study_squad(p_invite_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); sid uuid; member_count integer;
begin
 if actor is null then raise exception 'Sign in to join a squad.'; end if;
 select s.id into sid from public.study_squads s where s.invite_code=upper(trim(coalesce(p_invite_code,''))) for update;
 if sid is null then raise exception 'That invite code is invalid.'; end if;
 if exists(select 1 from public.study_squad_members where squad_id=sid and user_id=actor) then return sid; end if;
 select count(*) into member_count from public.study_squad_members where squad_id=sid;
 if member_count>=5 then raise exception 'This squad is full (maximum 5 members).'; end if;
 if (select count(*) from public.study_squad_members where user_id=actor)>=10 then raise exception 'You can belong to at most 10 squads.'; end if;
 insert into public.study_squad_members(squad_id,user_id,role) values(sid,actor,'member'); return sid;
end; $$;
revoke all on function public.join_study_squad(text) from public,anon;
grant execute on function public.join_study_squad(text) to authenticated;
