-- Operator-only wallet audit RPC with account labels, independent of the 50-user search page.
create or replace function public.operator_wallet_audit(p_limit integer default 100)
returns table(
  id uuid,
  user_id uuid,
  username text,
  full_name text,
  currency text,
  amount bigint,
  reason text,
  source text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_operator() then
    raise exception 'Operator access required';
  end if;

  return query
  select wt.id, wt.user_id, p.username, p.full_name, wt.currency, wt.amount,
         wt.reason, wt.source, wt.created_by, wt.created_at
  from public.wallet_transactions wt
  left join public.profiles p on p.id = wt.user_id
  order by wt.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

revoke all on function public.operator_wallet_audit(integer) from public, anon;
grant execute on function public.operator_wallet_audit(integer) to authenticated;
