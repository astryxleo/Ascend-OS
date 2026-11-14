-- Count an operator's own account as a student too when they have dual workspace access.
-- The profile remains role='operator' for server-side operator authorization.
create or replace function public.operator_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
 if not public.is_operator() then raise exception 'Operator access required'; end if;
 return jsonb_build_object(
  'users',(
    select count(*)
    from public.profiles
    where role = 'student'
       or (id = (select auth.uid()) and role = 'operator')
  ),
  'operators',(select count(*) from public.profiles where role='operator'),
  'focus_sessions',(select count(*) from public.focus_sessions),
  'focus_minutes',(select coalesce(sum(duration_minutes),0) from public.focus_sessions),
  'exams',(select count(*) from public.exams),
  'vehicles',(select count(*) from public.vehicles),
  'broadcasts',(select count(*) from public.broadcasts),
  'published_broadcasts',(select count(*) from public.broadcasts where is_published and starts_at<=now() and (ends_at is null or ends_at>now()))
 );
end;
$$;
revoke all on function public.operator_dashboard_stats() from public, anon;
grant execute on function public.operator_dashboard_stats() to authenticated;
