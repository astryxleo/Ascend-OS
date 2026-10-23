-- Expand the cosmetics catalog with the dedicated printed territory-border slot.
-- Keep the supported marketplace slots limited to the four existing categories plus territory borders.
alter table public.combat_cosmetic_catalog
  drop constraint if exists combat_cosmetic_catalog_slot_check;

alter table public.combat_cosmetic_catalog
  add constraint combat_cosmetic_catalog_slot_check
  check (slot = any (array['team_color','border_skin','profile_frame','atlas_card','territory_border_skin']::text[]));

insert into public.combat_cosmetic_catalog
  (id, label, slot, value, price_coins, original_price_coins, discount_percent, rarity, active)
values
  ('territory_border_conqueror', 'Conqueror''s Cartograph', 'territory_border_skin', 'territory', 65000, 65000, 0, 'Legendary', true)
on conflict (id) do update
set label = excluded.label,
    slot = excluded.slot,
    value = excluded.value,
    price_coins = excluded.price_coins,
    original_price_coins = excluded.original_price_coins,
    discount_percent = excluded.discount_percent,
    rarity = excluded.rarity,
    active = excluded.active;
