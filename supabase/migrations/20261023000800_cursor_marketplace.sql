create table if not exists public.ascend_cursor_preferences (user_id uuid primary key references auth.users(id) on delete cascade, selected_cursor_id integer not null default 6 check(selected_cursor_id between 1 and 20), updated_at timestamptz not null default now());
create table if not exists public.ascend_cursor_inventory (user_id uuid not null references auth.users(id) on delete cascade, cursor_id integer not null check(cursor_id between 1 and 20), purchased_at timestamptz not null default now(), primary key(user_id,cursor_id));
alter table public.ascend_cursor_preferences enable row level security;
alter table public.ascend_cursor_inventory enable row level security;
drop policy if exists "Users can read own cursor preference" on public.ascend_cursor_preferences;
create policy "Users can read own cursor preference" on public.ascend_cursor_preferences for select to authenticated using(user_id=auth.uid());
drop policy if exists "Users can read own cursor inventory" on public.ascend_cursor_inventory;
create policy "Users can read own cursor inventory" on public.ascend_cursor_inventory for select to authenticated using(user_id=auth.uid());
create or replace function public.get_ascend_cursor_store() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); selected integer:=6; owned jsonb; balance bigint:=0;
begin
 if u is null then raise exception 'Sign in required'; end if;
 insert into public.ascend_cursor_preferences(user_id) values(u) on conflict(user_id) do nothing;
 insert into public.ascend_cursor_inventory(user_id,cursor_id) values(u,6) on conflict do nothing;
 select selected_cursor_id into selected from public.ascend_cursor_preferences where user_id=u;
 select coalesce(coins,0) into balance from public.wallets where user_id=u;
 select coalesce(jsonb_agg(cursor_id order by cursor_id),'[]'::jsonb) into owned from public.ascend_cursor_inventory where user_id=u;
 return jsonb_build_object('selected_cursor_id',selected,'owned_cursor_ids',owned,'coins',coalesce(balance,0),'price',50000);
end $$;
create or replace function public.purchase_ascend_cursor(p_cursor_id integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); balance bigint; cost bigint:=50000;
begin
 if u is null then raise exception 'Sign in required'; end if;
 if p_cursor_id<1 or p_cursor_id>20 then raise exception 'Invalid cursor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cursor-store:'||u::text,0));
 insert into public.ascend_cursor_preferences(user_id) values(u) on conflict(user_id) do nothing;
 insert into public.ascend_cursor_inventory(user_id,cursor_id) values(u,6) on conflict do nothing;
 if exists(select 1 from public.ascend_cursor_inventory where user_id=u and cursor_id=p_cursor_id) then
   update public.ascend_cursor_preferences set selected_cursor_id=p_cursor_id,updated_at=now() where user_id=u;
   return public.get_ascend_cursor_store();
 end if;
 select coins into balance from public.wallets where user_id=u for update;
 if coalesce(balance,0)<cost then raise exception 'You need 50,000 Ascend Coins to unlock this cursor'; end if;
 update public.wallets set coins=coins-cost,updated_at=now() where user_id=u;
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',-cost,'Cursor marketplace purchase','cursor_store');
 insert into public.ascend_cursor_inventory(user_id,cursor_id) values(u,p_cursor_id);
 update public.ascend_cursor_preferences set selected_cursor_id=p_cursor_id,updated_at=now() where user_id=u;
 return public.get_ascend_cursor_store();
end $$;
create or replace function public.select_ascend_cursor(p_cursor_id integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Sign in required'; end if;
 if p_cursor_id<1 or p_cursor_id>20 then raise exception 'Invalid cursor'; end if;
 insert into public.ascend_cursor_preferences(user_id) values(u) on conflict(user_id) do nothing;
 insert into public.ascend_cursor_inventory(user_id,cursor_id) values(u,6) on conflict do nothing;
 if not exists(select 1 from public.ascend_cursor_inventory where user_id=u and cursor_id=p_cursor_id) then raise exception 'Purchase this cursor before selecting it'; end if;
 update public.ascend_cursor_preferences set selected_cursor_id=p_cursor_id,updated_at=now() where user_id=u;
 return public.get_ascend_cursor_store();
end $$;
revoke all on function public.get_ascend_cursor_store() from public,anon;
revoke all on function public.purchase_ascend_cursor(integer) from public,anon;
revoke all on function public.select_ascend_cursor(integer) from public,anon;
grant execute on function public.get_ascend_cursor_store() to authenticated;
grant execute on function public.purchase_ascend_cursor(integer) to authenticated;