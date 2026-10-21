-- Harden operator-only reporting RPCs with an empty search_path.
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
  'users',(select count(*) from public.profiles where role='student'),
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

create or replace function public.operator_search_users(p_query text default '')
returns table(
 user_id uuid, username text, full_name text, email text, role text,
 class_grade text, created_at timestamptz, coins bigint, cash bigint,
 focus_minutes bigint, completed_steps bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
 if not public.is_operator() then raise exception 'Operator access required'; end if;
 return query
 select p.id,p.username,p.full_name,p.email,p.role,p.class_grade,p.created_at,
  coalesce(w.coins,0),coalesce(w.cash,0),
  coalesce((select sum(fs.duration_minutes)::bigint from public.focus_sessions fs where fs.user_id=p.id),0),
  coalesce((select count(*)::bigint from public.chapter_progress cp where cp.user_id=p.id and cp.completed),0)
 from public.profiles p
 left join public.wallets w on w.user_id=p.id
 where coalesce(p_query,'')='' or p.username ilike '%'||p_query||'%'
   or p.full_name ilike '%'||p_query||'%' or p.email ilike '%'||p_query||'%'
 order by p.created_at desc
 limit 50;
end;
$$;
revoke all on function public.operator_search_users(text) from public, anon;
grant execute on function public.operator_search_users(text) to authenticated;

create or replace function public.operator_wallet_audit(p_limit integer default 100)
returns table(
 id uuid, user_id uuid, username text, full_name text, currency text, amount bigint,
 reason text, source text, created_by uuid, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
 if auth.uid() is null or not public.is_operator() then
   raise exception 'Operator access required';
 end if;
 return query
 select wt.id,wt.user_id,p.username,p.full_name,wt.currency,wt.amount,wt.reason,
  wt.source,wt.created_by,wt.created_at
 from public.wallet_transactions wt
 left join public.profiles p on p.id=wt.user_id
 order by wt.created_at desc
 limit greatest(1,least(coalesce(p_limit,100),200));
end;
$$;
revoke all on function public.operator_wallet_audit(integer) from public, anon;
grant execute on function public.operator_wallet_audit(integer) to authenticated;
