-- XP contributes to squad force attributes; personal army quantity remains coin-upgradable.
create or replace function public.squad_force_snapshot(p_squad uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s record; q numeric; power numeric; attack numeric; defense numeric; vitality numeric; discipline numeric; command numeric; n integer; total_xp numeric; xp_bonus numeric;
begin
 select id,name into s from public.study_squads where id=p_squad;
 if not found then raise exception 'Squad not found'; end if;
 select count(*)::integer,
  coalesce(sum(coalesce(cc.army_quantity,5)),0),
  coalesce(sum(coalesce(cc.army_quantity,5)*100
    +coalesce(cc.attack_level,1)*140+coalesce(cc.defense_level,1)*120
    +coalesce(cc.vitality_level,1)*130+coalesce(cc.command_level,1)*160
    +coalesce(cc.discipline_level,1)*100
    +floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*10),0),
  coalesce(sum(coalesce(cc.attack_level,1)*coalesce(cc.army_quantity,5)+floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*2),0),
  coalesce(sum(coalesce(cc.defense_level,1)*coalesce(cc.army_quantity,5)+floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*2),0),
  coalesce(sum(coalesce(cc.vitality_level,1)*coalesce(cc.army_quantity,5)+floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*2),0),
  coalesce(sum(coalesce(cc.discipline_level,1)*coalesce(cc.army_quantity,5)+floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))),0),
  coalesce(sum(coalesce(cc.command_level,1)*coalesce(cc.army_quantity,5)+floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))),0),
  coalesce(sum(coalesce(cf.xp,0)),0)
 into n,q,power,attack,defense,vitality,discipline,command,total_xp
 from public.study_squad_members sm
 left join public.combat_customizations cc on cc.user_id=sm.user_id
 left join public.combat_fighters cf on cf.user_id=sm.user_id
 where sm.squad_id=p_squad;
 return jsonb_build_object('squad_id',s.id,'name',s.name,'members',n,'army_quantity',q,
  'power',power,'attack',attack,'defense',defense,'vitality',vitality,'discipline',discipline,'command',command,'xp',total_xp);
end $$;
