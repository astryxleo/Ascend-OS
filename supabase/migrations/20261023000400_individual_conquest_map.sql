-- Individual Conquest Map: persistent territories, adjacent attacks and server-calculated rewards.
create table if not exists public.conquest_territories (
 id integer primary key,
 name text not null,
 region text not null,
 x integer not null,
 y integer not null,
 level integer not null default 1 check(level between 1 and 10),
 owner_id uuid references auth.users(id) on delete set null,
 captured_at timestamptz,
 updated_at timestamptz not null default now()
);
create index if not exists conquest_territories_owner_idx on public.conquest_territories(owner_id);
insert into public.conquest_territories(id,name,region,x,y,level) values
 (1,'Ashen Gate','NORTH',0,0,1),(2,'Frostwatch','NORTH',1,0,2),(3,'Crownspire','NORTH',2,0,3),(4,'Iron Pass','NORTH',3,0,2),
 (5,'Stormhold','MIDLANDS',0,1,2),(6,'Violet Reach','MIDLANDS',1,1,3),(7,'Astral Keep','MIDLANDS',2,1,4),(8,'Kingsfall','MIDLANDS',3,1,3),
 (9,'Ember Coast','SOUTH',0,2,1),(10,'Sunken Vale','SOUTH',1,2,2),(11,'Goldhaven','SOUTH',2,2,3),(12,'Obsidian Throne','SOUTH',3,2,5)
on conflict(id) do nothing;

create table if not exists public.conquest_battles (
 id uuid primary key default gen_random_uuid(),
 attacker_id uuid not null references auth.users(id) on delete cascade,
 territory_id integer not null references public.conquest_territories(id) on delete cascade,
 outcome text not null check(outcome in ('captured','repelled')),
 attack_score numeric not null,
 defense_score numeric not null,
 win_probability numeric not null,
 reward_coins bigint not null default 0,
 report jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists conquest_battles_player_idx on public.conquest_battles(attacker_id,created_at desc);
alter table public.conquest_territories enable row level security;
alter table public.conquest_battles enable row level security;
drop policy if exists "Conquest map visible to signed-in users" on public.conquest_territories;
create policy "Conquest map visible to signed-in users" on public.conquest_territories for select to authenticated using(true);
drop policy if exists "Players can view own conquest reports" on public.conquest_battles;
create policy "Players can view own conquest reports" on public.conquest_battles for select to authenticated using(attacker_id=auth.uid());

create or replace function public.get_conquest_map() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); home integer; territories jsonb; coins bigint:=0; fighter jsonb; recent jsonb;
begin
 if u is null then raise exception 'Sign in required'; end if;
 insert into public.combat_fighters(user_id) values(u) on conflict(user_id) do nothing;
 select coalesce(w.coins,0) into coins from public.wallets w where w.user_id=u;
 if not exists(select 1 from public.conquest_territories where owner_id=u) then
   select id into home from public.conquest_territories where owner_id is null order by id limit 1 for update skip locked;
   if home is not null then update public.conquest_territories set owner_id=u,captured_at=now(),updated_at=now() where id=home; end if;
 end if;
 fighter:=public.combat_build_snapshot(u);
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
 'total_count',(select count(*) from public.conquest_territories));
end $$;

create or replace function public.attack_conquest_territory(p_territory_id integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t public.conquest_territories; mine jsonb; defender jsonb;
 atk numeric; def numeric; chance numeric; roll numeric; win boolean; reward bigint; cost bigint:=15;
 atkqty numeric; defqty numeric; owner_name text;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select * into t from public.conquest_territories where id=p_territory_id for update;
 if not found then raise exception 'Territory not found'; end if;
 if t.owner_id=u then raise exception 'You already control this territory'; end if;
 if not exists(select 1 from public.conquest_territories own where own.owner_id=u and abs(own.x-t.x)+abs(own.y-t.y)=1) then
   raise exception 'You can only attack a territory next to your borders'; end if;
 if exists(select 1 from public.conquest_battles where attacker_id=u and created_at>now()-interval '30 seconds') then
   raise exception 'Your army needs 30 seconds to regroup before another attack'; end if;
 select coalesce(w.coins,0) into atkqty from public.wallets w where w.user_id=u;
 if coalesce(atkqty,0)<cost then raise exception 'You need 15 coins to launch an expedition'; end if;
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
   reward:=30+t.level*20;
   update public.conquest_territories set owner_id=u,captured_at=now(),updated_at=now() where id=t.id;
   insert into public.wallets(user_id,coins,cash) values(u,reward,0)
    on conflict(user_id) do update set coins=public.wallets.coins+reward,updated_at=now();
   insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',reward,'Conquest territory captured','conquest_map');
 else
   reward:=10;
   insert into public.wallets(user_id,coins,cash) values(u,reward,0)
    on conflict(user_id) do update set coins=public.wallets.coins+reward,updated_at=now();
   insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',reward,'Conquest battle participation','conquest_map');
 end if;
 insert into public.conquest_battles(attacker_id,territory_id,outcome,attack_score,defense_score,win_probability,reward_coins,report)
 values(u,t.id,case when win then 'captured' else 'repelled' end,round(atk,2),round(def,2),round(chance*100,1),reward,
 jsonb_build_object('roll',round(roll::numeric,4),'expedition_cost',cost,'net_coins',reward-cost,
 'attacker_attack',mine->>'attack','attacker_defense',mine->>'defense','attacker_vitality',mine->>'vitality',
 'attacker_command',mine->>'command','attacker_discipline',mine->>'discipline','attacker_speed',mine->>'speed',
 'attacker_army',mine->>'army_quantity','defender_army',defqty,'territory_level',t.level,
 'defender_attack',defender->>'attack','defender_defense',defender->>'defense'));
 return jsonb_build_object('outcome',case when win then 'captured' else 'repelled' end,'territory_id',t.id,
 'territory_name',t.name,'attack_score',round(atk,1),'defense_score',round(def,1),
 'win_probability',round(chance*100,1),'reward_coins',reward,'expedition_cost',cost,'net_coins',reward-cost,
 'report',jsonb_build_object('attack',round(atk,1),'defense',round(def,1),'probability',round(chance*100,1),'roll',round(roll::numeric,4),
 'troops',mine->>'army_quantity','defender_troops',defqty,'territory_level',t.level));
end $$;

revoke all on function public.get_conquest_map() from public,anon;
revoke all on function public.attack_conquest_territory(integer) from public,anon;
grant execute on function public.get_conquest_map() to authenticated;
grant execute on function public.attack_conquest_territory(integer) to authenticated;
