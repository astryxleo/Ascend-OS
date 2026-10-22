create or replace function public.set_study_squad_member_role(p_squad_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.study_squad_role(p_squad_id)<>'leader' then raise exception 'Only the squad leader can change member roles.'; end if;
 if p_role not in ('co_leader','member') then raise exception 'Invalid squad role.'; end if;
 if p_user_id=auth.uid() then raise exception 'You cannot change your own leader role.'; end if;
 update public.study_squad_members set role=p_role where squad_id=p_squad_id and user_id=p_user_id and role<>'leader';
 if not found then raise exception 'Squad member not found or role cannot be changed.'; end if;
end; $$;
revoke all on function public.set_study_squad_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_study_squad_member_role(uuid,uuid,text) to authenticated;
