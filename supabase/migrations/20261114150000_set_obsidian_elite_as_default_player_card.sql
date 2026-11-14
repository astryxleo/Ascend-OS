insert into public.player_card_owned(user_id, card_id, purchased_at)
select u.id, 'card:obsidian-elite', now()
from auth.users u
where exists (select 1 from public.player_card_catalog c where c.id = 'card:obsidian-elite' and c.active)
on conflict (user_id, card_id) do nothing;

insert into public.player_card_equipped(user_id, card_id, updated_at)
select u.id, 'card:obsidian-elite', now()
from auth.users u
where exists (select 1 from public.player_card_catalog c where c.id = 'card:obsidian-elite' and c.active)
on conflict (user_id) do nothing;

create or replace function public.get_player_card_store()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  u uuid := auth.uid();
  cards jsonb;
  owned jsonb;
  equipped text;
  balance bigint := 0;
begin
  if u is null then raise exception 'Sign in required'; end if;

  if exists (select 1 from public.player_card_catalog where id = 'card:obsidian-elite' and active) then
    insert into public.player_card_owned(user_id, card_id, purchased_at)
    values (u, 'card:obsidian-elite', now())
    on conflict (user_id, card_id) do nothing;

    insert into public.player_card_equipped(user_id, card_id, updated_at)
    values (u, 'card:obsidian-elite', now())
    on conflict (user_id) do nothing;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'label',label,'price_coins',price_coins,'rarity',rarity,
    'theme',theme,'description',description,'display_order',display_order
  ) order by price_coins asc,id asc),'[]'::jsonb)
  into cards from public.player_card_catalog where active;

  select coalesce(jsonb_agg(card_id order by card_id),'[]'::jsonb)
  into owned from public.player_card_owned where user_id=u;

  select card_id into equipped from public.player_card_equipped where user_id=u;
  select coalesce(coins,0) into balance from public.wallets where user_id=u;

  return jsonb_build_object(
    'cards',cards,'owned_card_ids',owned,'equipped_card_id',equipped,'coins',coalesce(balance,0)
  );
end
$function$;
