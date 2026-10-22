-- Ascend OS build-first auto-battle duels. Rewards and results are server-settled.
create table if not exists public.combat_fighters (
 user_id uuid primary key references auth.users(id) on delete cascade,
 weapon_class text not null default 'katana' check(weapon_class in ('katana','dual_blades','greatsword','spear','gauntlets')),
 armor_class text not null default 'ronin' check(armor_class in ('ronin','guardian','phantom','bastion')),
 skill_one text not null default 'quick_slash' check(skill_one in ('quick_slash','guard_break','shadow_step','counter_stance','piercing_thrust')),
 skill_two text not null default 'iron_guard' check(skill_two in ('iron_guard','second_wind','focus_surge','riposte','blink_strike')),
 ultimate text not null default 'crimson_breaker' check(ultimate in ('crimson_breaker','void_tempest','aegis_burst','phantom_execution')),
 xp bigint not null default 0 check(xp>=0), level integer not null default 1 check(level between 1 and 100),
 wins integer not null default 0 check(wins>=0), losses integer not null default 0 check(losses>=0),
 rating integer not null default 1000 check(rating between 0 and 5000), updated_at timestamptz not null default now()
);
create table if not exists public.combat_matches (
 id uuid primary key default gen_random_uuid(), challenger_id uuid not null references auth.users(id) on delete cascade,
 opponent_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','active','completed','declined','cancelled')),
 challenger_ready boolean not null default false, opponent_ready boolean not null default false,
 seed bigint, duration_seconds integer check(duration_seconds between 60 and 180),
 challenger_snapshot jsonb, opponent_snapshot jsonb, event_log jsonb not null default '[]'::jsonb,
 winner_id uuid references auth.users(id), result jsonb, started_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), check(challenger_id<>opponent_id)
);
create index if not exists combat_matches_challenger_created_idx on public.combat_matches(challenger_id,created_at desc);
create index if not exists combat_matches_opponent_created_idx on public.combat_matches(opponent_id,created_at desc);
alter table public.combat_fighters enable row level security;
alter table public.combat_matches enable row level security;
drop policy if exists "Players can read own combat fighter" on public.combat_fighters;
create policy "Players can read own combat fighter" on public.combat_fighters for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "Participants can read combat matches" on public.combat_matches;
create policy "Participants can read combat matches" on public.combat_matches for select to authenticated using((select auth.uid())=challenger_id or (select auth.uid())=opponent_id);
revoke all on public.combat_fighters from anon,authenticated;
grant select on public.combat_fighters to authenticated;
revoke all on public.combat_matches from anon,authenticated;
grant select on public.combat_matches to authenticated;

create or replace function public.get_combat_fighter() returns public.combat_fighters language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); f public.combat_fighters;
begin if u is null then raise exception 'Sign in required'; end if;
insert into public.combat_fighters(user_id) values(u) on conflict(user_id) do nothing;
select * into f from public.combat_fighters where user_id=u; return f; end $$;

create or replace function public.save_combat_loadout(p_weapon text,p_armor text,p_skill_one text,p_skill_two text,p_ultimate text)
returns public.combat_fighters language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); f public.combat_fighters;
begin if u is null then raise exception 'Sign in required'; end if;
insert into public.combat_fighters(user_id) values(u) on conflict(user_id) do nothing;
update public.combat_fighters set weapon_class=p_weapon,armor_class=p_armor,skill_one=p_skill_one,skill_two=p_skill_two,ultimate=p_ultimate,updated_at=now()
where user_id=u and p_weapon in('katana','dual_blades','greatsword','spear','gauntlets') and p_armor in('ronin','guardian','phantom','bastion')
and p_skill_one in('quick_slash','guard_break','shadow_step','counter_stance','piercing_thrust')
and p_skill_two in('iron_guard','second_wind','focus_surge','riposte','blink_strike')
and p_ultimate in('crimson_breaker','void_tempest','aegis_burst','phantom_execution');
if not found then raise exception 'Invalid combat loadout'; end if;
select * into f from public.combat_fighters where user_id=u; return f; end $$;

create or replace function public.find_combat_opponents(p_search text)
returns table(user_id uuid,username text,full_name text,level integer,rating integer,wins integer,losses integer)
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); q text:=trim(coalesce(p_search,''));
begin if u is null then raise exception 'Sign in required'; end if; if length(q)<2 then return; end if;
return query select p.id,coalesce(nullif(p.username,''),'Scholar'),coalesce(nullif(p.full_name,''),'Ascend Player'),
coalesce(f.level,1),coalesce(f.rating,1000),coalesce(f.wins,0),coalesce(f.losses,0)
from public.profiles p left join public.combat_fighters f on f.user_id=p.id
where p.id<>u and (p.username ilike '%'||left(q,32)||'%' or p.full_name ilike '%'||left(q,32)||'%')
order by (p.username ilike left(q,32)||'%') desc,p.username asc limit 12; end $$;

create or replace function public.combat_build_snapshot(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.combat_fighters; un text; fn text; a integer; d integer; s integer;
begin select * into f from public.combat_fighters where user_id=p_user;
if not found then raise exception 'Fighter not found'; end if;
select coalesce(nullif(username,''),'Scholar'),coalesce(nullif(full_name,''),'Ascend Player') into un,fn from public.profiles where id=p_user;
a:=18+least(f.level,100)+case f.weapon_class when 'greatsword' then 15 when 'dual_blades' then 5 when 'gauntlets' then 9 when 'spear' then 8 else 10 end;
d:=10+least(f.level,100)/2+case f.armor_class when 'guardian' then 18 when 'bastion' then 24 when 'phantom' then 5 else 12 end;
s:=case f.weapon_class when 'dual_blades' then 27 when 'gauntlets' then 22 when 'spear' then 18 when 'katana' then 20 else 11 end+case f.armor_class when 'phantom' then 12 when 'bastion' then -6 else 0 end;
return jsonb_build_object('user_id',p_user,'username',un,'name',fn,'level',f.level,'rating',f.rating,'weapon',f.weapon_class,'armor',f.armor_class,
'skill_one',f.skill_one,'skill_two',f.skill_two,'ultimate',f.ultimate,'attack',a,'defense',d,'speed',s,'stamina',90,'max_hp',180+d*2);
end $$;

create or replace function public.create_combat_challenge(p_opponent uuid) returns public.combat_matches
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.combat_matches;
begin if u is null then raise exception 'Sign in required'; end if; if p_opponent is null or p_opponent=u then raise exception 'Choose another player'; end if;
if not exists(select 1 from public.profiles where id=p_opponent) then raise exception 'Player not found'; end if;
insert into public.combat_fighters(user_id) values(u) on conflict(user_id) do nothing;
insert into public.combat_fighters(user_id) values(p_opponent) on conflict(user_id) do nothing;
if exists(select 1 from public.combat_matches x where x.status in('pending','active') and ((x.challenger_id=u and x.opponent_id=p_opponent) or (x.challenger_id=p_opponent and x.opponent_id=u))) then raise exception 'There is already an open duel between these players'; end if;
insert into public.combat_matches(challenger_id,opponent_id) values(u,p_opponent) returning * into m; return m; end $$;

create or replace function public.set_combat_ready(p_match uuid) returns public.combat_matches
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.combat_matches;
begin if u is null then raise exception 'Sign in required'; end if;
select * into m from public.combat_matches where id=p_match for update;
if not found or (m.challenger_id<>u and m.opponent_id<>u) then raise exception 'Duel not found'; end if;
if m.status<>'pending' then return m; end if;
if u=m.challenger_id then m.challenger_ready:=true; else m.opponent_ready:=true; end if;
update public.combat_matches set challenger_ready=m.challenger_ready,opponent_ready=m.opponent_ready where id=p_match;
if m.challenger_ready and m.opponent_ready then update public.combat_matches set status='active',seed=floor(random()*9000000000000000000)::bigint,
duration_seconds=60+floor(random()*121)::integer,started_at=now(),challenger_snapshot=public.combat_build_snapshot(m.challenger_id),
opponent_snapshot=public.combat_build_snapshot(m.opponent_id) where id=p_match returning * into m;
else select * into m from public.combat_matches where id=p_match; end if; return m; end $$;

create or replace function public.resolve_combat_match(p_match uuid) returns public.combat_matches
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.combat_matches; ha integer; hb integer; aa integer; ab integer; da integer; db integer; sa integer; sb integer;
i integer; ra integer; rb integer; dmg integer; actor text; act text; events jsonb:='[]'::jsonb; win uuid; xa integer:=40; xb integer:=40; ca integer:=50; cb integer:=50; r_a integer; r_b integer;
begin if u is null then raise exception 'Sign in required'; end if;
select * into m from public.combat_matches where id=p_match for update;
if not found or (m.challenger_id<>u and m.opponent_id<>u) then raise exception 'Duel not found'; end if;
if m.status='completed' then return m; end if;
if m.status<>'active' then raise exception 'Both players must be ready before battle'; end if;
if now()<m.started_at+make_interval(secs=>m.duration_seconds) then raise exception 'Battle is still in progress'; end if;
ha:=(m.challenger_snapshot->>'max_hp')::integer; hb:=(m.opponent_snapshot->>'max_hp')::integer;
aa:=(m.challenger_snapshot->>'attack')::integer; ab:=(m.opponent_snapshot->>'attack')::integer;
da:=(m.challenger_snapshot->>'defense')::integer; db:=(m.opponent_snapshot->>'defense')::integer;
sa:=(m.challenger_snapshot->>'speed')::integer; sb:=(m.opponent_snapshot->>'speed')::integer;
for i in 1..12 loop
ra:=get_byte(decode(substr(md5(m.seed::text||':a:'||i::text),1,8),'hex'),0)%100;
rb:=get_byte(decode(substr(md5(m.seed::text||':b:'||i::text),1,8),'hex'),0)%100;
if ha<=0 or hb<=0 then exit; end if;
if sa+ra>=sb+rb then actor:='challenger'; dmg:=greatest(4,aa-floor(db*.28)::integer+(ra%11)); if i=6 then dmg:=dmg+18;act:='ultimate';elsif i%4=0 then dmg:=dmg+8;act:='combo';else act:='strike';end if; hb:=greatest(0,hb-dmg);
else actor:='opponent';dmg:=greatest(4,ab-floor(da*.28)::integer+(rb%11));if i=6 then dmg:=dmg+18;act:='ultimate';elsif i%4=0 then dmg:=dmg+8;act:='combo';else act:='strike';end if;ha:=greatest(0,ha-dmg);end if;
events:=events||jsonb_build_array(jsonb_build_object('turn',i,'actor',actor,'action',act,'damage',dmg,'hp_challenger',ha,'hp_opponent',hb,'label',case act when 'ultimate' then 'ULTIMATE IMPACT' when 'combo' then 'COMBO CHAIN' else 'CLEAN STRIKE' end));
end loop;
if ha=hb then if aa+sa+ra>=ab+sb+rb then win:=m.challenger_id;else win:=m.opponent_id;end if;elsif ha>hb then win:=m.challenger_id;else win:=m.opponent_id;end if;
if win=m.challenger_id then xa:=75;ca:=120;r_a:=20;r_b:=-15;else xb:=75;cb:=120;r_a:=-15;r_b:=20;end if;
update public.combat_fighters set xp=xp+xa,level=least(100,1+floor(sqrt((xp+xa)::numeric/100))::integer),wins=wins+case when win=m.challenger_id then 1 else 0 end,
losses=losses+case when win<>m.challenger_id then 1 else 0 end,rating=greatest(0,least(5000,rating+r_a)),updated_at=now() where user_id=m.challenger_id;
update public.combat_fighters set xp=xp+xb,level=least(100,1+floor(sqrt((xp+xb)::numeric/100))::integer),wins=wins+case when win=m.opponent_id then 1 else 0 end,
losses=losses+case when win<>m.opponent_id then 1 else 0 end,rating=greatest(0,least(5000,rating+r_b)),updated_at=now() where user_id=m.opponent_id;
insert into public.wallets(user_id,coins,cash) values(m.challenger_id,ca,0) on conflict(user_id) do update set coins=public.wallets.coins+ca,updated_at=now();
insert into public.wallets(user_id,coins,cash) values(m.opponent_id,cb,0) on conflict(user_id) do update set coins=public.wallets.coins+cb,updated_at=now();
insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(m.challenger_id,'coins',ca,'Combat duel reward','combat'),(m.opponent_id,'coins',cb,'Combat duel reward','combat');
update public.combat_matches set status='completed',winner_id=win,event_log=events,completed_at=now(),result=jsonb_build_object('winner_id',win,'challenger_hp',ha,'opponent_hp',hb,'challenger_coins',ca,'opponent_coins',cb,'challenger_xp',xa,'opponent_xp',xb) where id=p_match returning * into m;return m;end $$;

create or replace function public.decline_combat_challenge(p_match uuid) returns public.combat_matches
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.combat_matches;
begin if u is null then raise exception 'Sign in required';end if;
update public.combat_matches set status='declined' where id=p_match and status='pending' and opponent_id=u returning * into m;
if not found then raise exception 'Challenge cannot be declined';end if;return m;end $$;

revoke all on function public.get_combat_fighter() from public,anon;
revoke all on function public.save_combat_loadout(text,text,text,text,text) from public,anon;
revoke all on function public.find_combat_opponents(text) from public,anon;
revoke all on function public.combat_build_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.create_combat_challenge(uuid) from public,anon;
revoke all on function public.set_combat_ready(uuid) from public,anon;
revoke all on function public.resolve_combat_match(uuid) from public,anon;
revoke all on function public.decline_combat_challenge(uuid) from public,anon;
grant execute on function public.get_combat_fighter() to authenticated;
grant execute on function public.save_combat_loadout(text,text,text,text,text) to authenticated;
grant execute on function public.find_combat_opponents(text) to authenticated;
grant execute on function public.create_combat_challenge(uuid) to authenticated;
grant execute on function public.set_combat_ready(uuid) to authenticated;
grant execute on function public.resolve_combat_match(uuid) to authenticated;
grant execute on function public.decline_combat_challenge(uuid) to authenticated;
