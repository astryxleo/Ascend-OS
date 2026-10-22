-- Persistent army capacity and server-verified coin upgrades.
alter table public.combat_customizations
  add column if not exists army_quantity integer not null default 5
  check (army_quantity between 5 and 50);

create or replace function public.upgrade_combat_army()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  u uuid := auth.uid();
  current_qty integer;
  price bigint;
  balance bigint;
begin
  if u is null then raise exception 'Authentication required'; end if;

  insert into public.combat_customizations(user_id)
    values (u) on conflict (user_id) do nothing;

  select army_quantity into current_qty
    from public.combat_customizations where user_id = u for update;

  if current_qty >= 50 then raise exception 'Army is already at maximum capacity'; end if;

  price := 250 * ((current_qty - 5) / 5 + 1);

  update public.wallets
    set coins = coins - price, updated_at = now()
    where user_id = u and coins >= price
    returning coins into balance;

  if not found then raise exception 'Not enough coins'; end if;

  update public.combat_customizations
    set army_quantity = least(50, current_qty + 5), updated_at = now()
    where user_id = u;

  insert into public.wallet_transactions(user_id,currency,amount,reason,source)
    values (u,'coins',-price,'Combat army capacity upgrade','combat_army_upgrade');

  return jsonb_build_object(
    'success', true,
    'army_quantity', least(50,current_qty+5),
    'price', price,
    'coins', balance
  );
end
$function$;

revoke all on function public.upgrade_combat_army() from public;
grant execute on function public.upgrade_combat_army() to authenticated;
