create or replace function public.get_squad_power_leaderboard(p_limit integer default 30)
returns table(rank bigint,squad_id uuid,squad_name text,members bigint,power bigint,wins bigint)
language sql stable security definer set search_path=public as $$
 select row_number() over(order by coalesce(sum(f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25),0) desc),
 s.id,s.name,count(m.user_id),
 coalesce(sum(f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25),0)::bigint,
 coalesce(sum(f.wins),0)::bigint
 from public.study_squads s
 join public.study_squad_members m on m.squad_id=s.id
 left join public.combat_fighters f on f.user_id=m.user_id
 group by s.id,s.name
 order by coalesce(sum(f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25),0) desc
 limit greatest(1,least(p_limit,100));
$$;