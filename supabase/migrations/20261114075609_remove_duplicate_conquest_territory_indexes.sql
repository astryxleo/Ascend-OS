-- Remove redundant conquest map indexes. Keep the heavily used owner index
-- and one coordinate index; the removed duplicates had zero recorded scans.
begin;
drop index if exists public.conquest_territories_owner_idx;
drop index if exists public.conquest_territories_grid_idx;
commit;
