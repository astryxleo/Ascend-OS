create table if not exists public.combat_cosmetic_catalog (id text primary key,label text not null,slot text not null check(slot in ('team_color','helmet','visor','armor_style','weapon_skin','aura')),value text not null,price_coins integer not null check(price_coins between 100 and 2000),rarity text not null check(rarity in ('Standard','Premium','Elite','Legendary')),active boolean not null default true,unique(slot,value));
create table if not exists public.combat_cosmetic_owned (user_id uuid not null references auth.users(id) on delete cascade,cosmetic_id text not null references public.combat_cosmetic_catalog(id) on delete restrict,purchased_at timestamptz not null default now(),primary key(user_id,cosmetic_id));
alter table public.combat_cosmetic_catalog enable row level security;
alter table public.combat_cosmetic_owned enable row level security;
drop policy if exists "Cosmetic catalog is visible to authenticated users" on public.combat_cosmetic_catalog;
create policy "Cosmetic catalog is visible to authenticated users" on public.combat_cosmetic_catalog for select to authenticated using(active);
drop policy if exists "Users can read own cosmetic inventory" on public.combat_cosmetic_owned;
create policy "Users can read own cosmetic inventory" on public.combat_cosmetic_owned for select to authenticated using(auth.uid()=user_id);
grant select on public.combat_cosmetic_catalog,public.combat_cosmetic_owned to authenticated;
revoke all on public.combat_cosmetic_owned from anon;
insert into public.combat_cosmetic_catalog(id,label,slot,value,price_coins,rarity) values
('team_color:cyan','Cyber Cyan','team_color','cyan',180,'Standard'),('team_color:gold','Imperial Gold','team_color','gold',250,'Premium'),('team_color:violet','Royal Violet','team_color','violet',300,'Premium'),('team_color:emerald','Emerald Pulse','team_color','emerald',300,'Premium'),
('helmet:tactical','Tactical Helm','helmet','tactical',400,'Premium'),('helmet:horned','Warlord Horns','helmet','horned',750,'Elite'),('visor:slit','Predator Slit','visor','slit',200,'Standard'),('visor:cross','Crosshair Visor','visor','cross',350,'Premium'),
('armor_style:ronin','Ronin Armor','armor_style','ronin',500,'Premium'),('armor_style:heavy','Titan Heavy Plate','armor_style','heavy',700,'Elite'),('armor_style:tech','Aether Exosuit','armor_style','tech',900,'Elite'),
('weapon_skin:steel','Polished Steel','weapon_skin','steel',350,'Premium'),('weapon_skin:void','Void Obsidian','weapon_skin','void',600,'Elite'),('weapon_skin:plasma','Plasma Sovereign','weapon_skin','plasma',850,'Elite'),('aura:legendary','Celestial Aura','aura','true',1200,'Legendary')
on conflict(id) do update set label=excluded.label,slot=excluded.slot,value=excluded.value,price_coins=excluded.price_coins,rarity=excluded.rarity,active=true;
create or replace function public.purchase_combat_cosmetic(p_cosmetic_id text) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); c public.combat_cosmetic_catalog%rowtype; balance bigint;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select * into c from public.combat_cosmetic_catalog where id=p_cosmetic_id and active for update;
 if not found then raise exception 'Cosmetic is unavailable'; end if;
 if exists(select 1 from public.combat_cosmetic_owned where user_id=u and cosmetic_id=c.id) then raise exception 'Already owned'; end if;
 perform 1 from public.wallets where user_id=u for update;
 if not found then raise exception 'Wallet not found'; end if;
 update public.wallets set coins=coins-c.price_coins,updated_at=now() where user_id=u and coins>=c.price_coins returning coins into balance;
 if not found then raise exception 'Not enough coins'; end if;
 insert into public.combat_cosmetic_owned(user_id,cosmetic_id) values(u,c.id);
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',-c.price_coins,'Combat cosmetic: '||c.label,'combat_cosmetic_marketplace');
 insert into public.combat_customizations(user_id) values(u) on conflict(user_id) do nothing;
 if c.slot='team_color' then update public.combat_customizations set team_color=c.value,updated_at=now() where user_id=u;
 elsif c.slot='helmet' then update public.combat_customizations set helmet=c.value,updated_at=now() where user_id=u;
 elsif c.slot='visor' then update public.combat_customizations set visor=c.value,updated_at=now() where user_id=u;
 elsif c.slot='armor_style' then update public.combat_customizations set armor_style=c.value,updated_at=now() where user_id=u;
 elsif c.slot='weapon_skin' then update public.combat_customizations set weapon_skin=c.value,updated_at=now() where user_id=u;
 elsif c.slot='aura' then update public.combat_customizations set aura=true,updated_at=now() where user_id=u;
 end if;
 return jsonb_build_object('success',true,'cosmetic_id',c.id,'label',c.label,'price',c.price_coins,'coins',balance,'rarity',c.rarity);
end $$;
revoke all on function public.purchase_combat_cosmetic(text) from public,anon;
grant execute on function public.purchase_combat_cosmetic(text) to authenticated;
create or replace function public.get_combat_power_leaderboard(p_limit integer default 50)
returns table(rank bigint,user_id uuid,display_name text,level integer,xp bigint,rating integer,wins integer,power bigint) language sql stable security definer set search_path=public as $$
 select row_number() over(order by (f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25) desc),f.user_id,coalesce(nullif(p.full_name,''),p.username,'Ascender'),f.level,f.xp,f.rating,f.wins,(f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25)
 from public.combat_fighters f join public.profiles p on p.id=f.user_id order by (f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25) desc limit greatest(1,least(p_limit,100));
$$;
create or replace function public.get_squad_power_leaderboard(p_limit integer default 30)
returns table(rank bigint,squad_id uuid,squad_name text,members bigint,power bigint,wins bigint) language sql stable security definer set search_path=public as $$
 select row_number() over(order by coalesce(sum(f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25),0) desc),s.id,s.name,count(m.user_id),coalesce(sum(f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25),0),coalesce(sum(f.wins),0)::bigint
 from public.study_squads s join public.study_squad_members m on m.squad_id=s.id left join public.combat_fighters f on f.user_id=m.user_id group by s.id,s.name order by coalesce(sum(f.rating::bigint*10+f.level::bigint*100+f.xp/10+f.wins::bigint*25),0) desc limit greatest(1,least(p_limit,100));
$$;
revoke all on function public.get_combat_power_leaderboard(integer) from public,anon;
revoke all on function public.get_squad_power_leaderboard(integer) from public,anon;
grant execute on function public.get_combat_power_leaderboard(integer) to authenticated;
grant execute on function public.get_squad_power_leaderboard(integer) to authenticated;