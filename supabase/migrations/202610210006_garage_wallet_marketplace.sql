-- Lumen dealership catalog and atomic wallet-backed vehicle purchases.
insert into public.vehicles(id,name,maker,tier,rarity,top_speed_kmh,zero_to_100,horsepower,price_coins,price_cash,is_available)
values
('apex-s1','Apex S1','Apex Works','Track Toy','Common',180,4.8,220,250,0,true),
('monza-r','Monza R','Scuderia Nova','Track Toy','Common',205,4.1,310,400,0,true),
('vector-gt','Vector GT','Vector Automotive','Luxury GT','Common',250,4.6,420,550,0,true),
('solstice-coupe','Solstice Coupe','Solstice','Luxury GT','Common',235,5,360,600,0,true),
('nightjar-rs','Nightjar RS','Nightjar','Track Toy','Rare',285,3.7,510,900,0,true),
('falcon-x','Falcon X','Falcon Motorworks','Track Toy','Rare',300,3.4,580,1100,0,true),
('zenith-gt','Zenith GT','Zenith','Luxury GT','Rare',290,3.8,490,1200,0,true),
('aurora-luxe','Aurora Luxe','Aurora Atelier','Luxury GT','Rare',260,4.2,430,1300,0,true),
('vortex-900','Vortex 900','Vortex','Hypercar','Exotic',345,2.8,900,2500,0,true),
('nebula-r','Nebula R','Nebula Performance','Hypercar','Exotic',355,2.6,980,3000,0,true),
('spectre-x','Spectre X','Spectre','Hypercar','Exotic',365,2.5,1050,3400,0,true),
('redline-gtx','Redline GTX','Redline','Hypercar','Exotic',350,2.7,940,3200,0,true),
('eclipse-one','Eclipse One','Eclipse','Hypercar','Mythic',390,2.2,1250,6000,0,true),
('nova-velocity','Nova Velocity','Nova','Hypercar','Mythic',405,2,1400,7500,0,true),
('ion-phantom','Ion Phantom','Ion Mobility','Concept Prototype','Mythic',380,2.1,1180,8000,0,true),
('quantum-gt','Quantum GT','Quantum Labs','Concept Prototype','Mythic',410,1.9,1500,9000,0,true),
('aether-01','Aether 01','Aether','Concept Prototype','1-of-1',430,1.7,1800,18000,0,true),
('chrono-zero','Chrono Zero','Chrono','Concept Prototype','1-of-1',440,1.6,1900,20000,0,true),
('endurance-7','Endurance 7','Aster Racing','Le Mans Legend','Rare',320,3,700,1800,0,true),
('midnight-proto','Midnight Proto','Midnight Motorsport','Le Mans Legend','Exotic',335,2.7,820,2800,0,true),
('circuit-legend','Circuit Legend','Circuit Heritage','Le Mans Legend','Exotic',330,2.8,780,2600,0,true),
('pinnacle-lm','Pinnacle LM','Pinnacle Racing','Le Mans Legend','Mythic',360,2.3,1100,6200,0,true),
('aurum-roadster','Aurum Roadster','Aurum','Luxury GT','Exotic',310,3.2,640,2800,0,true),
('obsidian-coupe','Obsidian Coupe','Obsidian','Luxury GT','Exotic',305,3.3,620,2600,0,true),
('crimson-arrow','Crimson Arrow','Crimson Dynamics','Hypercar','Mythic',400,2.1,1350,7000,0,true),
('cyan-striker','Cyan Striker','Cyan Automotive','Track Toy','Exotic',315,3,680,2400,0,true),
('golden-ghost','Golden Ghost','Aurum Atelier','Concept Prototype','Mythic',395,2,1300,8200,0,true),
('titanium-v12','Titanium V12','Titanium Motors','Luxury GT','Rare',275,4,500,1400,0,true),
('stormchaser','Stormchaser','Tempest','Track Toy','Rare',295,3.5,560,1050,0,true),
('zenith-omega','Zenith Omega','Zenith','Hypercar','Exotic',370,2.4,1080,3900,0,true)
on conflict (id) do update set name=excluded.name,maker=excluded.maker,tier=excluded.tier,rarity=excluded.rarity,top_speed_kmh=excluded.top_speed_kmh,zero_to_100=excluded.zero_to_100,horsepower=excluded.horsepower,price_coins=excluded.price_coins,price_cash=excluded.price_cash,is_available=true;

create or replace function public.purchase_vehicle(p_vehicle_id text, p_currency text default 'coins')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
 v_user uuid := auth.uid();
 v_car public.vehicles%rowtype;
 v_wallet public.wallets%rowtype;
 v_price bigint;
 v_balance bigint;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_currency not in ('coins','cash') then raise exception 'Unsupported currency'; end if;
 select * into v_car from public.vehicles where id=p_vehicle_id and is_available for update;
 if not found then raise exception 'Vehicle is unavailable'; end if;
 if v_car.release_at is not null and v_car.release_at>now() then raise exception 'Vehicle has not been released yet'; end if;
 if v_car.stock_limit is not null and v_car.stock_sold>=v_car.stock_limit then raise exception 'This vehicle is sold out'; end if;
 if exists(select 1 from public.vehicles_owned where user_id=v_user and vehicle_id=p_vehicle_id) then raise exception 'You already own this vehicle'; end if;
 v_price := case when p_currency='coins' then v_car.price_coins else v_car.price_cash end;
 if v_price<=0 then raise exception 'This vehicle is not purchasable with this currency'; end if;
 insert into public.wallets(user_id) values(v_user) on conflict(user_id) do nothing;
 select * into v_wallet from public.wallets where user_id=v_user for update;
 v_balance := case when p_currency='coins' then v_wallet.coins else v_wallet.cash end;
 if v_balance<v_price then raise exception 'Insufficient % balance',p_currency; end if;
 if p_currency='coins' then
  update public.wallets set coins=coins-v_price,updated_at=now() where user_id=v_user returning * into v_wallet;
 else
  update public.wallets set cash=cash-v_price,updated_at=now() where user_id=v_user returning * into v_wallet;
 end if;
 insert into public.vehicles_owned(user_id,vehicle_id) values(v_user,p_vehicle_id);
 insert into public.wallet_transactions(user_id,currency,amount,reason,source)
 values(v_user,p_currency,-v_price,'Vehicle purchase: '||v_car.name,'vehicle_marketplace');
 update public.vehicles set stock_sold=stock_sold+1 where id=p_vehicle_id;
 return jsonb_build_object('success',true,'vehicle_id',p_vehicle_id,'currency',p_currency,'price',v_price,'coins',v_wallet.coins,'cash',v_wallet.cash);
end;
$$;
revoke all on function public.purchase_vehicle(text,text) from public, anon;
grant execute on function public.purchase_vehicle(text,text) to authenticated;
