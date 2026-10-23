-- Scatter rare high-level Conquest sectors across the full world while preserving
-- the existing canvas epic-border/glow treatment for levels 6 through 10.
-- A stable hash makes placement look random but keeps the world consistent on every load.
update public.conquest_territories
set level = case
  when mod((hashtext(id::text)::bigint & 2147483647),1000) < 3 then 10
  when mod((hashtext(id::text)::bigint & 2147483647),1000) < 9 then 9
  when mod((hashtext(id::text)::bigint & 2147483647),1000) < 22 then 8
  when mod((hashtext(id::text)::bigint & 2147483647),1000) < 45 then 7
  when mod((hashtext(id::text)::bigint & 2147483647),1000) < 90 then 6
  else 1 + mod(id,5)
end
where level between 1 and 10;
