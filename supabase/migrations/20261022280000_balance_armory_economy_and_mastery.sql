update public.combat_cosmetic_catalog set price_coins=case
 when slot='aura' then greatest(2500,least(18000,round(price_coins/2.5)::integer))
 when slot='eye_glow' then greatest(1800,least(9000,round(price_coins/3.0)::integer))
 when slot='armor' then greatest(4000,least(17000,round(price_coins/3.0)::integer))
 when slot='weapon' then greatest(5000,least(18000,round(price_coins/3.0)::integer))
 when slot='helmet' then greatest(1500,least(12000,round(price_coins/3.0)::integer))
 when slot='visor' then greatest(1200,least(10000,round(price_coins/3.0)::integer))
 else greatest(1200,least(5000,round(price_coins/3.0)::integer))
end where active;
update public.combat_weapon_skill_catalog sk set unlock_xp=v.xp from (values (1,1500),(2,3000),(3,5000),(4,7500),(5,10000),(6,13500),(7,18000),(8,23000),(9,29000),(10,36000)) as v(slot_number,xp) where sk.slot_number=v.slot_number;