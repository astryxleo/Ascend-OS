-- Keep only profile/team cosmetics in the Combat Arena marketplace.
-- The user explicitly requested permanent removal of all other cosmetic categories,
-- including their ownership and equipped records.
begin;
delete from public.combat_cosmetic_owned o
using public.combat_cosmetic_catalog c
where o.cosmetic_id = c.id
  and c.slot not in ('atlas_card', 'border_skin', 'profile_frame', 'team_color');
delete from public.combat_cosmetic_catalog
where slot not in ('atlas_card', 'border_skin', 'profile_frame', 'team_color');
commit;