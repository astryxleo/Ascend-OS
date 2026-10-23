-- Spread epic territories across the actual 500x400 map grid.
-- The previous distribution hashed sequential IDs; this version hashes x/y coordinates
-- so high-level sectors are scattered throughout the gaps between visual rows/stripes,
-- including the outer map boundaries, instead of following ID-shaped patterns.
-- About 50% of sectors become level 6-10, with a small ultra-rare level 9-10 presence.
with spatial_rolls as (
  select id, x, y,
         (hashtext(x::text || ':' || y::text || ':epic')::bigint & 2147483647) % 100 as epic_roll,
         (hashtext(x::text || ':' || y::text || ':low')::bigint & 2147483647) % 5 as low_roll
  from public.conquest_territories
)
update public.conquest_territories t
set level = case
  when s.epic_roll < 25 then 6
  when s.epic_roll < 39 then 7
  when s.epic_roll < 45 then 8
  when s.epic_roll < 48 then 9
  else 10
end
from spatial_rolls s
where t.id = s.id
  and s.epic_roll < 50;

with spatial_rolls as (
  select id,
         (hashtext(x::text || ':' || y::text || ':epic')::bigint & 2147483647) % 100 as epic_roll,
         (hashtext(x::text || ':' || y::text || ':low')::bigint & 2147483647) % 5 as low_roll
  from public.conquest_territories
)
update public.conquest_territories t
set level = (s.low_roll + 1)::integer
from spatial_rolls s
where t.id = s.id
  and s.epic_roll >= 50;
