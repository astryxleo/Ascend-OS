-- Expand the Atlas Card catalogue into a 12-tier elemental collection.
begin;
update public.combat_cosmetic_catalog set label='Woodland Core', value='wood', price_coins=1000, original_price_coins=1000, discount_percent=0, rarity='Standard', active=true where id='atlas_card_neon' and slot='atlas_card';
update public.combat_cosmetic_catalog set label='Iron Bastion', value='iron', price_coins=2500, original_price_coins=2500, discount_percent=0, rarity='Standard', active=true where id='atlas_card_prism' and slot='atlas_card';
update public.combat_cosmetic_catalog set label='Copper Forge', value='copper', price_coins=4000, original_price_coins=4000, discount_percent=0, rarity='Standard', active=true where id='atlas_card_void' and slot='atlas_card';
update public.combat_cosmetic_catalog set label='Silver Tempest', value='silver', price_coins=6500, original_price_coins=6500, discount_percent=0, rarity='Premium', active=true where id='atlas_card_ascendant' and slot='atlas_card';
update public.combat_cosmetic_catalog set label='Gold Sovereign', value='gold', price_coins=10000, original_price_coins=10000, discount_percent=0, rarity='Premium', active=true where id='atlas_card_mythic' and slot='atlas_card';
update public.combat_cosmetic_catalog set label='Obsidian Eclipse', value='obsidian', price_coins=45000, original_price_coins=45000, discount_percent=0, rarity='Mythic', active=true where id='atlas_card_obsidian' and slot='atlas_card';
insert into public.combat_cosmetic_catalog (id,label,slot,value,price_coins,original_price_coins,discount_percent,rarity,active)
values
('atlas_card_ruby','Ruby Inferno','atlas_card','ruby',16000,16000,0,'Elite',true),
('atlas_card_sapphire','Sapphire Tide','atlas_card','sapphire',18000,18000,0,'Elite',true),
('atlas_card_emerald','Emerald Wildheart','atlas_card','emerald',20000,20000,0,'Elite',true),
('atlas_card_amethyst','Amethyst Rift','atlas_card','amethyst',28000,28000,0,'Legendary',true),
('atlas_card_diamond','Diamond Zenith','atlas_card','diamond',36000,36000,0,'Legendary',true),
('atlas_card_celestial','Celestial Prism','atlas_card','celestial',55000,55000,0,'Celestial',true)
on conflict (id) do update set label=excluded.label,slot=excluded.slot,value=excluded.value,price_coins=excluded.price_coins,original_price_coins=excluded.original_price_coins,discount_percent=excluded.discount_percent,rarity=excluded.rarity,active=excluded.active;
commit;
