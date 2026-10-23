-- Raise roughly 40% of all Conquest territories to epic levels (6–10),
-- scattered deterministically across the entire map. The existing canvas keeps
-- its per-level glow/line styling for these territories.
update public.conquest_territories
set level = case
  when mod((hashtext(id::text)::bigint & 2147483647),100) < 20 then 6
  when mod((hashtext(id::text)::bigint & 2147483647),100) < 32 then 7
  when mod((hashtext(id::text)::bigint & 2147483647),100) < 37 then 8
  when mod((hashtext(id::text)::bigint & 2147483647),100) < 39 then 9
  else 10
end
where mod((hashtext(id::text)::bigint & 2147483647),100) < 40;

-- Keep the remaining ~60% as low-level territories, also distributed throughout
-- the map, rather than leaving the previous update's high-level placements behind.
update public.conquest_territories
set level = 1 + mod(id,5)
where mod((hashtext(id::text)::bigint & 2147483647),100) >= 40;
