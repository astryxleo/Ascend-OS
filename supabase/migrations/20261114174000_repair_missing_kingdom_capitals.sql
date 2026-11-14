with missing_capitals as (
  select distinct on (owner_id) id, owner_id
  from public.conquest_territories t
  where owner_id is not null
    and not exists (
      select 1 from public.conquest_territories h
      where h.owner_id = t.owner_id and h.is_home
    )
  order by owner_id, captured_at asc nulls first, id asc
)
update public.conquest_territories t
set is_home = true, updated_at = now()
from missing_capitals m
where t.id = m.id;

create or replace function public.get_conquest_leaderboard(p_limit integer default 100)
returns table(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  territory_count bigint,
  home_x integer,
  home_y integer,
  combat_level integer,
  combat_xp bigint,
  ascend_souls bigint,
  kingdom_flag_url text,
  rank_position bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ranked as (
    select
      p.id as uid,
      coalesce(p.username, 'player') as uname,
      coalesce(p.full_name, p.username, 'Player') as display_name,
      p.avatar_url,
      count(t.id)::bigint as territory_count,
      max(t.x) filter (where t.is_home) as home_x,
      max(t.y) filter (where t.is_home) as home_y,
      coalesce(f.level, 1)::integer as combat_level,
      coalesce(f.xp, 0)::bigint as combat_xp,
      coalesce(f.ascend_souls, 0)::bigint as ascend_souls,
      p.kingdom_flag_url,
      row_number() over (
        order by count(t.id) desc, coalesce(f.level, 1) desc,
                 coalesce(f.xp, 0) desc, p.id
      ) as rank_position
    from public.profiles p
    left join public.conquest_territories t on t.owner_id = p.id
    left join public.combat_fighters f on f.user_id = p.id
    group by p.id, p.username, p.full_name, p.avatar_url,
             p.kingdom_flag_url, f.level, f.xp, f.ascend_souls
  )
  select r.uid, r.uname, r.display_name, r.avatar_url, r.territory_count,
         r.home_x, r.home_y, r.combat_level, r.combat_xp, r.ascend_souls,
         r.kingdom_flag_url, r.rank_position
  from ranked r
  where r.territory_count > 0
    and r.rank_position <= greatest(1, least(coalesce(p_limit, 100), 500))
  order by r.rank_position;
$function$;