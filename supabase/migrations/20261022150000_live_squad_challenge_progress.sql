create or replace function public.get_study_squad_challenge_progress(p_squad_id uuid)
returns table(id uuid,title text,description text,goal_type text,target integer,starts_at timestamptz,ends_at timestamptz,current_value bigint,progress_percent numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_study_squad_member(p_squad_id) then raise exception 'Squad membership required.'; end if;
 return query
 select c.id,c.title,c.description,c.goal_type,c.target,c.starts_at,c.ends_at,
  (case when c.goal_type='focus_minutes' then
    (select coalesce(sum(fs.duration_minutes),0)::bigint from public.focus_sessions fs join public.study_squad_members m on m.user_id=fs.user_id and m.squad_id=c.squad_id where fs.completed and fs.ended_at>=c.starts_at and fs.ended_at<=least(now(),c.ends_at))
   else
    (select count(*)::bigint from public.planner_tasks pt join public.study_squad_members m on m.user_id=pt.user_id and m.squad_id=c.squad_id where pt.completed and pt.completed_at>=c.starts_at and pt.completed_at<=least(now(),c.ends_at))
   end) as current_value,
  least(100,round(100.0*(case when c.goal_type='focus_minutes' then
    (select coalesce(sum(fs.duration_minutes),0)::bigint from public.focus_sessions fs join public.study_squad_members m on m.user_id=fs.user_id and m.squad_id=c.squad_id where fs.completed and fs.ended_at>=c.starts_at and fs.ended_at<=least(now(),c.ends_at))
   else
    (select count(*)::bigint from public.planner_tasks pt join public.study_squad_members m on m.user_id=pt.user_id and m.squad_id=c.squad_id where pt.completed and pt.completed_at>=c.starts_at and pt.completed_at<=least(now(),c.ends_at))
   end)/nullif(c.target,0))) as progress_percent
 from public.study_squad_challenges c where c.squad_id=p_squad_id order by c.created_at desc;
end; $$;
revoke all on function public.get_study_squad_challenge_progress(uuid) from public,anon;
grant execute on function public.get_study_squad_challenge_progress(uuid) to authenticated;
