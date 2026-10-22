create or replace function public.get_conquest_map_region(
  p_center_x integer,
  p_center_y integer,
  p_radius integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  cx integer := greatest(0, least(499, coalesce(p_center_x, 250)));
  cy integer := greatest(0, least(399, coalesce(p_center_y, 200)));
  radius integer := greatest(12, least(150, coalesce(p_radius, 60)));
  sectors jsonb;
begin
  if u is null then raise exception 'Sign in required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'region', t.region,
    'x', t.x,
    'y', t.y,
    'level', t.level,
    'owner_id', t.owner_id,
    'owner_name', coalesce(nullif(p.username, ''), nullif(p.full_name, ''), 'Unclaimed'),
    'is_mine', t.owner_id = u,
    'owner_level', coalesce(df.level, 0),
    'is_shielded', t.owner_id is not null and coalesce(df.level, 1) < 10,
    'is_adjacent', exists (
      select 1 from public.conquest_territories mine
      where mine.owner_id = u and abs(mine.x - t.x) + abs(mine.y - t.y) = 1
    ),
    'income', t.level * 15
  ) order by abs(t.x - cx) + abs(t.y - cy), t.y, t.x), '[]'::jsonb)
  into sectors
  from (
    select ct.*
    from public.conquest_territories ct
    where ct.x between greatest(0, cx - radius) and least(499, cx + radius)
      and ct.y between greatest(0, cy - radius) and least(399, cy + radius)
    order by abs(ct.x - cx) + abs(ct.y - cy), ct.y, ct.x
    limit 20000
  ) t
  left join public.profiles p on p.id = t.owner_id
  left join public.combat_fighters df on df.user_id = t.owner_id;

  return sectors;
end;
$$;

revoke all on function public.get_conquest_map_region(integer, integer, integer) from public, anon;
grant execute on function public.get_conquest_map_region(integer, integer, integer) to authenticated;
