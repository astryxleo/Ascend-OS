-- Keep the Conquest Atlas initial response tiny: never serialize all 200,000 sectors on first paint.
create or replace function public.get_conquest_map_overview() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); home integer; anchor_x integer:=250; anchor_y integer:=200;
 coins bigint:=0; fighter jsonb; recent jsonb; cooldown_until timestamptz;
 cooldown_seconds integer:=0; fighter_level integer:=1;
begin
 if u is null then raise exception 'Sign in required'; end if;
 insert into public.combat_fighters(user_id) values(u) on conflict(user_id) do nothing;
 insert into public.wallets(user_id,coins,cash) values(u,0,0) on conflict(user_id) do nothing;
 select coalesce(w.coins,0) into coins from public.wallets w where w.user_id=u;
 select coalesce(cf.level,1) into fighter_level from public.combat_fighters cf where cf.user_id=u;
 if not exists(select 1 from public.conquest_territories where owner_id=u) then
   for i in 1..80 loop
     home:=1+floor(random()*200000)::integer;
     update public.conquest_territories set owner_id=u,captured_at=now(),updated_at=now()
       where id=home and owner_id is null;
     if found then exit; end if;
     home:=null;
   end loop;
   if home is null then
     select id into home from public.conquest_territories where owner_id is null order by id limit 1 for update skip locked;
     if home is not null then update public.conquest_territories set owner_id=u,captured_at=now(),updated_at=now() where id=home and owner_id is null; end if;
   end if;
 end if;
 select t.x,t.y into anchor_x,anchor_y from public.conquest_territories t
 where t.owner_id=u order by t.captured_at desc nulls last,t.id limit 1;
 fighter:=public.combat_build_snapshot(u);
 select max(b.created_at)+interval '2 hours' into cooldown_until
 from public.conquest_battles b where b.created_at>now()-interval '2 hours'
 and (b.attacker_id=u or b.defender_id=u);
 cooldown_seconds:=greatest(0,ceil(extract(epoch from (coalesce(cooldown_until,now())-now())))::integer);
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'territory_id',b.territory_id,'territory_name',t.name,'outcome',b.outcome,
   'attack_score',b.attack_score,'defense_score',b.defense_score,'win_probability',b.win_probability,'reward_coins',b.reward_coins,
   'report',b.report,'created_at',b.created_at) order by b.created_at desc),'[]'::jsonb) into recent
 from (select * from public.conquest_battles where attacker_id=u or defender_id=u order by created_at desc limit 8) b
 join public.conquest_territories t on t.id=b.territory_id;
 return jsonb_build_object('territories','[]'::jsonb,'coins',coalesce(coins,0),'fighter',fighter,'recent',recent,
   'owned_count',(select count(*) from public.conquest_territories where owner_id=u),
   'total_count',(select count(*) from public.conquest_territories),'shield_level',10,
   'player_level',fighter_level,'player_shielded',fighter_level<10,
   'home_x',coalesce(anchor_x,250),'home_y',coalesce(anchor_y,200),
   'cooldown_until',case when cooldown_seconds>0 then cooldown_until else null end,'cooldown_seconds',cooldown_seconds);
end $$;

create or replace function public.get_conquest_map_region(
  p_center_x integer,
  p_center_y integer,
  p_radius integer default 35
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  cx integer := greatest(0, least(499, coalesce(p_center_x, 250)));
  cy integer := greatest(0, least(399, coalesce(p_center_y, 200)));
  radius integer := greatest(12, least(45, coalesce(p_radius, 35)));
  sectors jsonb;
begin
  if u is null then raise exception 'Sign in required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'region', t.region, 'x', t.x, 'y', t.y,
    'level', t.level, 'owner_id', t.owner_id,
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
    select ct.* from public.conquest_territories ct
    where ct.x between greatest(0, cx - radius) and least(499, cx + radius)
      and ct.y between greatest(0, cy - radius) and least(399, cy + radius)
    order by abs(ct.x - cx) + abs(ct.y - cy), ct.y, ct.x
    limit 8000
  ) t
  left join public.profiles p on p.id = t.owner_id
  left join public.combat_fighters df on df.user_id = t.owner_id;
  return sectors;
end;
$$;

revoke all on function public.get_conquest_map_overview() from public, anon;
grant execute on function public.get_conquest_map_overview() to authenticated;
revoke all on function public.get_conquest_map_region(integer, integer, integer) from public, anon;
grant execute on function public.get_conquest_map_region(integer, integer, integer) to authenticated;
