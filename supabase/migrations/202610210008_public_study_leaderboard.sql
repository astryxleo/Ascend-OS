-- Public, privacy-limited study leaderboard. Never returns emails or account roles.
create or replace function public.get_public_leaderboard(p_limit integer default 50)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  focus_minutes bigint,
  completed_steps bigint,
  completed_sessions bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with student_stats as (
    select
      p.id as uid,
      coalesce(nullif(trim(p.username), ''), 'student')::text as uname,
      coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.username), ''), 'Lumen Student')::text as display,
      p.avatar_url::text as avatar,
      coalesce((select sum(fs.duration_minutes)::bigint
        from public.focus_sessions fs
        where fs.user_id = p.id and coalesce(fs.completed, true)), 0) as minutes,
      coalesce((select count(*)::bigint
        from public.chapter_progress cp
        where cp.user_id = p.id and cp.completed), 0) as steps,
      coalesce((select count(*)::bigint
        from public.focus_sessions fs
        where fs.user_id = p.id and coalesce(fs.completed, true)), 0) as sessions
    from public.profiles p
    where p.role = 'student'
  ), ranked as (
    select row_number() over (order by minutes desc, steps desc, sessions desc, uname asc)::bigint as place,
           uid, uname, display, avatar, minutes, steps, sessions
    from student_stats
  )
  select place, uid, uname, display, avatar, minutes, steps, sessions
  from ranked
  order by place
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.get_public_leaderboard(integer) from public, anon;
grant execute on function public.get_public_leaderboard(integer) to authenticated;
