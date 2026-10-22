alter table public.ascend_cursor_preferences drop constraint if exists ascend_cursor_preferences_selected_cursor_id_check;
alter table public.ascend_cursor_preferences add constraint ascend_cursor_preferences_selected_cursor_id_check check(selected_cursor_id between 0 and 20);
alter table public.ascend_cursor_inventory drop constraint if exists ascend_cursor_inventory_cursor_id_check;
alter table public.ascend_cursor_inventory add constraint ascend_cursor_inventory_cursor_id_check check(cursor_id between 0 and 20);
create or replace function public.purchase_ascend_cursor(p_cursor_id integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); balance bigint; cost bigint:=50000;
begin
 if u is null then raise exception 'Sign in required'; end if;
 if p_cursor_id<0 or p_cursor_id>20 then raise exception 'Invalid cursor'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cursor-store:'||u::text,0));
 insert into public.ascend_cursor_preferences(user_id) values(u) on conflict(user_id) do nothing;
 insert into public.ascend_cursor_inventory(user_id,cursor_id) values(u,6) on conflict do nothing;
 if p_cursor_id=6 or exists(select 1 from public.ascend_cursor_inventory where user_id=u and cursor_id=p_cursor_id) then
   insert into public.ascend_cursor_inventory(user_id,cursor_id) values(u,p_cursor_id) on conflict do nothing;
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
 if p_cursor_id<0 or p_cursor_id>20 then raise exception 'Invalid cursor'; end if;
 insert into public.ascend_cursor_preferences(user_id) values(u) on conflict(user_id) do nothing;
 insert into public.ascend_cursor_inventory(user_id,cursor_id) values(u,6) on conflict do nothing;
 if not exists(select 1 from public.ascend_cursor_inventory where user_id=u and cursor_id=p_cursor_id) then raise exception 'Purchase this cursor before selecting it'; end if;
 update public.ascend_cursor_preferences set selected_cursor_id=p_cursor_id,updated_at=now() where user_id=u;
 return public.get_ascend_cursor_store();
end $$;