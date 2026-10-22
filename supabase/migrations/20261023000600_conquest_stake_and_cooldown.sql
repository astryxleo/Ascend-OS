-- Conquest economy rebalance: 1,000-coin stake, win pays stake plus level bonus, 2-hour cooldown.
create or replace function public.get_conquest_map() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); home integer; territories jsonb; coins bigint:=0; fighter jsonb; recent jsonb; cooldown_until timestamptz; cooldown_seconds integer:=0;
begin
 if u is null then raise exception 'Sign in required'; end if;
 insert into public.combat_fighters(user_id) values(u) on conflict(user_id) do nothing;
 insert into public.wallets(user_id,coins,cash) values(u,0,0) on conflict(user_id) do nothing;
 select coalesce(w.coins,0) into coins from public.wallets w where w.user_id=u;
 if not exists(select 1 from public.conquest_territories where owner_id=u) then
   select id into home from public.conquest_territories where owner_id is null order by id limit 1 for update skip locked;
   if home is not null then update public.conquest_territories set owner_id=u,captured_at=now(),updated_at=now() where id=home; end if;
 end if;
 fighter:=public.combat_build_snapshot(u);
 select max(b.created_at)+interval '2 hours' into cooldown_until from public.conquest_battles b where b.attacker_id=u;
 cooldown_seconds:=greatest(0,ceil(extract(epoch from (coalesce(cooldown_until,now())-now())))::integer);
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'region',t.region,'x',t.x,'y',t.y,'level',t.level,'owner_id',t.owner_id,
   'owner_name',coalesce(nullif(p.username,''),nullif(p.full_name,''),'Unclaimed'),'is_mine',t.owner_id=u,
   'is_adjacent',exists(select 1 from public.conquest_territories mine where mine.owner_id=u and abs(mine.x-t.x)+abs(mine.y-t.y)=1),
   'income',t.level*15) order by t.y,t.x),'[]'::jsonb) into territories
 from public.conquest_territories t left join public.profiles p on p.id=t.owner_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'territory_id',b.territory_id,'territory_name',t.name,'outcome',b.outcome,
 'attack_score',b.attack_score,'defense_score',b.defense_score,'win_probability',b.win_probability,'reward_coins',b.reward_coins,'report',b.report,'created_at',b.created_at)
 order by b.created_at desc),'[]'::jsonb) into recent from (select * from public.conquest_battles where attacker_id=u order by created_at desc limit 8) b join public.conquest_territories t on t.id=b.territory_id;
 return jsonb_build_object('territories',territories,'coins',coalesce(coins,0),'fighter',fighter,'recent',recent,
 'owned_count',(select count(*) from public.conquest_territories where owner_id=u),
 'total_count',(select count(*) from public.conquest_territories),'cooldown_until',case when cooldown_seconds>0 then cooldown_until else null end,'cooldown_seconds',cooldown_seconds);
end $$;

create or replace function public.attack_conquest_territory(p_territory_id integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t public.conquest_territories; mine jsonb; defender jsonb;
 atk numeric; def numeric; chance numeric; roll numeric; win boolean; reward bigint; cost bigint:=1000;
 atkqty numeric; defqty numeric; owner_name text;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select * into t from public.conquest_territories where id=p_territory_id for update;
 if not found then raise exception 'Territory not found'; end if;
 if t.owner_id=u then raise exception 'You already control this territory'; end if;
 if not exists(select 1 from public.conquest_territories own where own.owner_id=u and abs(own.x-t.x)+abs(own.y-t.y)=1) then
   raise exception 'You can only attack a territory next to your borders'; end if;
 if exists(select 1 from public.conquest_battles where attacker_id=u and created_at>now()-interval '2 hours') then
   raise exception 'Your army is on a 2-hour cooldown after its last attack'; end if;
 select coalesce(w.coins,0) into atkqty from public.wallets w where w.user_id=u;
 if coalesce(atkqty,0)<cost then raise exception 'You need 1,000 coins to launch an expedition'; end if;
 update public.wallets set coins=coins-cost,updated_at=now() where user_id=u;
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',-cost,'Conquest expedition cost','conquest_map');
 mine:=public.combat_build_snapshot(u);
 if t.owner_id is null then
   def:=35+t.level*22;
   defqty:=t.level*10;
 else
   defender:=public.combat_build_snapshot(t.owner_id);
   def:=coalesce((defender->>'attack')::numeric,0)*0.28+
        coalesce((defender->>'defense')::numeric,0)*0.55+
        coalesce((defender->>'vitality')::numeric,1)*8+
        coalesce((defender->>'command')::numeric,1)*7+
        coalesce((defender->>'discipline')::numeric,1)*6+
        sqrt(greatest(1,coalesce((defender->>'army_quantity')::numeric,5)))*28+
        t.level*22;
   defqty:=coalesce((defender->>'army_quantity')::numeric,5);
 end if;
 atk:=coalesce((mine->>'attack')::numeric,0)*0.55+
      coalesce((mine->>'defense')::numeric,0)*0.25+
      coalesce((mine->>'vitality')::numeric,1)*8+
      coalesce((mine->>'command')::numeric,1)*8+
      coalesce((mine->>'discipline')::numeric,1)*7+
      coalesce((mine->>'speed')::numeric,1)*2+
      sqrt(greatest(1,coalesce((mine->>'army_quantity')::numeric,5)))*36+
      coalesce((mine->>'level')::numeric,1)*2;
 chance:=least(0.92,greatest(0.08,atk/(atk+def)));
 roll:=random(); win:=roll<chance;
 if win then
   reward:=1000+t.level*100;
   update public.conquest_territories set owner_id=u,captured_at=now(),updated_at=now() where id=t.id;
   insert into public.wallets(user_id,coins,cash) values(u,reward,0)
    on conflict(user_id) do update set coins=public.wallets.coins+reward,updated_at=now();
   insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',reward,'Conquest territory captured','conquest_map');
 else
   reward:=0;
 end if;
 insert into public.conquest_battles(attacker_id,territory_id,outcome,attack_score,defense_score,win_probability,reward_coins,report)
 values(u,t.id,case when win then 'captured' else 'repelled' end,round(atk,2),round(def,2),round(chance*100,1),reward,
 jsonb_build_object('roll',round(roll::numeric,4),'expedition_cost',cost,'net_coins',case when win then reward-cost else -cost end,'cooldown_hours',2,
 'attacker_attack',mine->>'attack','attacker_defense',mine->>'defense','attacker_vitality',mine->>'vitality',
 'attacker_command',mine->>'command','attacker_discipline',mine->>'discipline','attacker_speed',mine->>'speed',
 'attacker_army',mine->>'army_quantity','defender_army',defqty,'territory_level',t.level,
 'defender_attack',defender->>'attack','defender_defense',defender->>'defense'));
 return jsonb_build_object('outcome',case when win then 'captured' else 'repelled' end,'territory_id',t.id,
 'territory_name',t.name,'attack_score',round(atk,1),'defense_score',round(def,1),
 'win_probability',round(chance*100,1),'reward_coins',reward,'expedition_cost',cost,'net_coins',case when win then reward-cost else -cost end,'cooldown_hours',2,
 'report',jsonb_build_object('attack',round(atk,1),'defense',round(def,1),'probability',round(chance*100,1),'roll',round(roll::numeric,4),
 'troops',mine->>'army_quantity','defender_troops',defqty,'territory_level',t.level));
end $$;

revoke all on function public.get_conquest_map() from public,anon;
revoke all on function public.attack_conquest_territory(integer) from public,anon;
grant execute on function public.get_conquest_map() to authenticated;
grant execute on function public.attack_conquest_territory(integer) to authenticated;
