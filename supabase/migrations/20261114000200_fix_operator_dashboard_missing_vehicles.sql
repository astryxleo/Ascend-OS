-- Repair Operator Overview stats for the deployed Ascend OS schema.
-- The vehicles table is not part of this schema, so do not reference it here.
-- The designated dual-access account is included in the student total while
-- retaining its operator role for authorization.
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
       or id = 'c3aa7f83-df87-4924-8594-dc16590d961f'::uuid
  ),
  'operators',(select count(*) from public.profiles where role='operator'),
  'focus_sessions',(select count(*) from public.focus_sessions),
  'focus_minutes',(select coalesce(sum(duration_minutes),0) from public.focus_sessions),
  'exams',(select count(*) from public.exams),
  'broadcasts',(select count(*) from public.broadcasts),
  'published_broadcasts',(select count(*) from public.broadcasts where is_published and starts_at<=now() and (ends_at is null or ends_at>now()))
 );
end;
$$;
revoke all on function public.operator_dashboard_stats() from public, anon;
grant execute on function public.operator_dashboard_stats() to authenticated;
