-- Harden marketplace purchase RPC against search_path-based object shadowing.
-- All application relations and auth functions are schema-qualified; built-ins resolve
-- from pg_catalog when the function search_path is empty.
create or replace function public.purchase_vehicle(p_vehicle_id text, p_currency text default 'coins')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_user uuid := auth.uid();
 v_car public.vehicles%rowtype;
 v_wallet public.wallets%rowtype;
 v_price bigint;
 v_balance bigint;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_currency not in ('coins','cash') then raise exception 'Unsupported currency'; end if;
 select * into v_car from public.vehicles where id=p_vehicle_id and is_available for update;
 if not found then raise exception 'Vehicle is unavailable'; end if;
 if v_car.release_at is not null and v_car.release_at>now() then raise exception 'Vehicle has not been released yet'; end if;
 if v_car.stock_limit is not null and v_car.stock_sold>=v_car.stock_limit then raise exception 'This vehicle is sold out'; end if;
 if exists(select 1 from public.vehicles_owned where user_id=v_user and vehicle_id=p_vehicle_id) then raise exception 'You already own this vehicle'; end if;
 v_price := case when p_currency='coins' then v_car.price_coins else v_car.price_cash end;
 if v_price<=0 then raise exception 'This vehicle is not purchasable with this currency'; end if;
 insert into public.wallets(user_id) values(v_user) on conflict(user_id) do nothing;
 select * into v_wallet from public.wallets where user_id=v_user for update;
 v_balance := case when p_currency='coins' then v_wallet.coins else v_wallet.cash end;
 if v_balance<v_price then raise exception 'Insufficient % balance',p_currency; end if;
 if p_currency='coins' then
  update public.wallets set coins=coins-v_price,updated_at=now() where user_id=v_user returning * into v_wallet;
 else
  update public.wallets set cash=cash-v_price,updated_at=now() where user_id=v_user returning * into v_wallet;
 end if;
 insert into public.vehicles_owned(user_id,vehicle_id) values(v_user,p_vehicle_id);
 insert into public.wallet_transactions(user_id,currency,amount,reason,source)
 values(v_user,p_currency,-v_price,'Vehicle purchase: '||v_car.name,'vehicle_marketplace');
 update public.vehicles set stock_sold=stock_sold+1 where id=p_vehicle_id;
 return jsonb_build_object('success',true,'vehicle_id',p_vehicle_id,'currency',p_currency,'price',v_price,'coins',v_wallet.coins,'cash',v_wallet.cash);
end;
$$;
revoke all on function public.purchase_vehicle(text,text) from public, anon;
grant execute on function public.purchase_vehicle(text,text) to authenticated;
