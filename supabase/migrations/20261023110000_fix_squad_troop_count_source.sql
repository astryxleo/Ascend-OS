-- Ensure squad totals use persisted member army profiles, not UI-only fallback values.
-- Members without a combat_customizations row receive the database's canonical starting army.
create or replace function public.squad_force_snapshot(p_squad uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 s record;
 q numeric;
 power numeric;
 attack numeric;
 defense numeric;
 vitality numeric;
 discipline numeric;
 command numeric;
 n integer;
 total_xp numeric;
begin
 select id,name into s from public.study_squads where id=p_squad;
 if not found then raise exception 'Squad not found'; end if;

 insert into public.combat_customizations(user_id)
 select sm.user_id
 from public.study_squad_members sm
 where sm.squad_id=p_squad
 on conflict(user_id) do nothing;

 select count(*)::integer,
  coalesce(sum(cc.army_quantity),0),
  coalesce(sum(cc.army_quantity*100
    +cc.attack_level*140
    +cc.defense_level*120
    +cc.vitality_level*130
    +cc.command_level*160
    +cc.discipline_level*100
    +floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*10),0),
  coalesce(sum(cc.attack_level*cc.army_quantity
    +floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*2),0),
  coalesce(sum(cc.defense_level*cc.army_quantity
    +floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*2),0),
  coalesce(sum(cc.vitality_level*cc.army_quantity
    +floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*2),0),
  coalesce(sum(cc.discipline_level*cc.army_quantity
    +floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))),0),
  coalesce(sum(cc.command_level*cc.army_quantity
    +floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))),0),
  coalesce(sum(coalesce(cf.xp,0)),0)
 into n,q,power,attack,defense,vitality,discipline,command,total_xp
 from public.study_squad_members sm
 join public.combat_customizations cc on cc.user_id=sm.user_id
 left join public.combat_fighters cf on cf.user_id=sm.user_id
 where sm.squad_id=p_squad;

 return jsonb_build_object(
  'squad_id',s.id,'name',s.name,'members',n,'army_quantity',q,
  'power',power,'attack',attack,'defense',defense,'vitality',vitality,
  'discipline',discipline,'command',command,'xp',total_xp
 );
end $$;
