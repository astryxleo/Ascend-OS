-- Raise the luxury armory economy while keeping a defined 50,000 coin ceiling.
update public.combat_cosmetic_catalog
set price_coins=least(50000, price_coins*2)
where active;

-- Lifetime XP is never deducted; progression thresholds become more prestigious.
update public.combat_weapon_skill_catalog sk
set unlock_xp=v.xp
from (values
 (1,2500),(2,5000),(3,8000),(4,12000),(5,16000),
 (6,22000),(7,30000),(8,40000),(9,50000),(10,65000)
) as v(slot_number,xp)
where sk.slot_number=v.slot_number;
