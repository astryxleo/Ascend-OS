-- Ascend Souls, stat progression, and formula-driven combat/economy.
alter table public.combat_fighters
  add column if not exists ascend_souls bigint not null default 0 check (ascend_souls >= 0);

-- One soul is earned for every 10 lifetime XP. XP is never spent; souls are.
update public.combat_fighters
set ascend_souls = floor(xp::numeric / 10)::bigint
where ascend_souls = 0 and xp >= 10;

create or replace function public.grant_ascend_souls_from_xp()
returns trigger language plpgsql security definer set search_path='' as $$
declare earned bigint;
begin
 if new.xp > old.xp then
   earned := floor(new.xp::numeric/10)::bigint-floor(old.xp::numeric/10)::bigint;
   if earned > 0 then new.ascend_souls := new.ascend_souls + earned; end if;
 end if;
 return new;
end $$;
drop trigger if exists combat_fighters_award_ascend_souls on public.combat_fighters;
create trigger combat_fighters_award_ascend_souls
before update of xp on public.combat_fighters
for each row execute function public.grant_ascend_souls_from_xp();

create or replace function public.upgrade_combat_attribute(p_attribute text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); current_level integer; price bigint; souls bigint; next_level integer;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_attribute not in ('command_level','attack_level','defense_level','vitality_level','discipline_level') then
   raise exception 'Invalid army attribute';
 end if;
 insert into public.combat_fighters(user_id) values(u) on conflict(user_id) do nothing;
 insert into public.combat_customizations(user_id) values(u) on conflict(user_id) do nothing;
 select ascend_souls into souls from public.combat_fighters where user_id=u for update;
 execute format('select %I from public.combat_customizations where user_id=$1 for update',p_attribute)
 into current_level using u;
 if current_level >= 50 then raise exception 'Attribute is already at maximum level'; end if;
 price := greatest(1,current_level);
 if souls < price then raise exception 'Not enough Ascend Souls'; end if;
 update public.combat_fighters set ascend_souls=ascend_souls-price,updated_at=now()
 where user_id=u returning ascend_souls into souls;
 next_level:=current_level+1;
 execute format('update public.combat_customizations set %I=$1,updated_at=now() where user_id=$2',p_attribute)
 using next_level,u;
 insert into public.activity_events(user_id,event_type,title,detail)
 values(u,'ascend_attribute_upgraded','Army quality upgraded',
 jsonb_build_object('attribute',p_attribute,'level',next_level,'souls_spent',price));
 return jsonb_build_object('success',true,'attribute',p_attribute,'level',next_level,'souls_spent',price,'ascend_souls',souls);
end $$;
revoke all on function public.upgrade_combat_attribute(text) from public,anon;
grant execute on function public.upgrade_combat_attribute(text) to authenticated;

-- Combat snapshots include every relevant army quality, not just a simple count of higher stats.
create or replace function public.combat_build_snapshot(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.combat_fighters; c public.combat_customizations; un text; fn text;
 a integer; d integer; s integer; v integer; cmd integer; dis integer; qty integer;
begin
 select * into f from public.combat_fighters where user_id=p_user;
 if not found then raise exception 'Fighter not found'; end if;
 insert into public.combat_customizations(user_id) values(p_user) on conflict(user_id) do nothing;
 select * into c from public.combat_customizations where user_id=p_user;
 select coalesce(nullif(username,''),'Scholar'),coalesce(nullif(full_name,''),'Ascend Player')
 into un,fn from public.profiles where id=p_user;
 qty:=coalesce(c.army_quantity,5); v:=coalesce(c.vitality_level,1);
 cmd:=coalesce(c.command_level,1); dis:=coalesce(c.discipline_level,1);
 a:=18+least(f.level,100)+coalesce(c.attack_level,1)*3+cmd*2+dis+floor(sqrt(qty::numeric))*2
   +case f.weapon_class when 'greatsword' then 15 when 'dual_blades' then 5 when 'gauntlets' then 9 when 'spear' then 8 else 10 end;
 d:=10+least(f.level,100)/2+coalesce(c.defense_level,1)*3+v*2+dis+floor(sqrt(qty::numeric))
   +case f.armor_class when 'guardian' then 18 when 'bastion' then 24 when 'phantom' then 5 else 12 end;
 s:=case f.weapon_class when 'dual_blades' then 27 when 'gauntlets' then 22 when 'spear' then 18 when 'katana' then 20 else 11 end
   +case f.armor_class when 'phantom' then 12 when 'bastion' then -6 else 0 end+cmd+dis*2;
 return jsonb_build_object('user_id',p_user,'username',un,'name',fn,'level',f.level,'rating',f.rating,
 'weapon',f.weapon_class,'armor',f.armor_class,'skill_one',f.skill_one,'skill_two',f.skill_two,'ultimate',f.ultimate,
 'army_quantity',qty,'attack',a,'defense',d,'speed',s,'vitality',v,'command',cmd,'discipline',dis,
 'max_hp',180+d*2+v*4+qty*3,'composite_power',a*1.35+d*1.25+v*1.05+cmd*1.15+dis*1.10+sqrt(qty::numeric)*100+f.xp*0.015,'ascend_souls',f.ascend_souls);
end $$;
revoke all on function public.combat_build_snapshot(uuid) from public,anon,authenticated;

-- Combined squad force uses all members' army quantities, XP and quality levels.
create or replace function public.squad_force_snapshot(p_squad uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s record; q numeric; power numeric; attack numeric; defense numeric; vitality numeric;
 discipline numeric; command numeric; n integer; total_xp numeric; xp_bonus numeric;
begin
 select id,name into s from public.study_squads where id=p_squad;
 if not found then raise exception 'Squad not found'; end if;
 select count(*)::integer,coalesce(sum(coalesce(cc.army_quantity,5)),0),
 coalesce(sum(coalesce(cc.army_quantity,5)*100+coalesce(cc.attack_level,1)*140+
 coalesce(cc.defense_level,1)*120+coalesce(cc.vitality_level,1)*130+
 coalesce(cc.command_level,1)*160+coalesce(cc.discipline_level,1)*100+
 floor(sqrt(greatest(0,coalesce(cf.xp,0))::numeric))*10),0),
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
 'power',power,'attack',attack,'defense',defense,'vitality',vitality,'discipline',discipline,
 'command',command,'xp',total_xp);
end $$;

-- War outcome is probability-weighted by a multi-stat combat score. The weaker force can win,
-- but no single attribute or count alone guarantees victory. Casualties and coins are settled server-side.
create or replace function public.resolve_squad_war(p_war_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w public.study_squad_wars; aq numeric; dq numeric;
 aa numeric; da numeric; av numeric; dv numeric; atc numeric; dtc numeric; ad numeric; dd numeric;
 ascore numeric; dscore numeric; chance numeric; al bigint; dl bigint; winner uuid;
 aleft bigint; dleft bigint; events jsonb; reward_win bigint; reward_loss bigint;
 member_row record; paid_winner integer:=0; paid_loser integer:=0;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select * into w from public.study_squad_wars where id=p_war_id for update;
 if not found then raise exception 'War not found'; end if;
 if not exists(select 1 from public.study_squad_members where squad_id in(w.attacker_squad_id,w.defender_squad_id) and user_id=u)
 then raise exception 'You are not part of this war'; end if;
 if w.status='completed' then return jsonb_build_object('id',w.id,'status',w.status,'winner_squad_id',w.winner_squad_id,
 'attacker_losses',w.attacker_losses,'defender_losses',w.defender_losses,'battle_log',w.battle_log); end if;
 if now()<w.ends_at then raise exception 'War is still in progress'; end if;
 aq:=greatest(1,(w.attacker_snapshot->>'army_quantity')::numeric);
 dq:=greatest(1,(w.defender_snapshot->>'army_quantity')::numeric);
 aa:=greatest(0,coalesce((w.attacker_snapshot->>'attack')::numeric,0));
 da:=greatest(0,coalesce((w.defender_snapshot->>'attack')::numeric,0));
 av:=greatest(0,coalesce((w.attacker_snapshot->>'vitality')::numeric,0));
 dv:=greatest(0,coalesce((w.defender_snapshot->>'vitality')::numeric,0));
 atc:=greatest(0,coalesce((w.attacker_snapshot->>'command')::numeric,0));
 dtc:=greatest(0,coalesce((w.defender_snapshot->>'command')::numeric,0));
 ad:=greatest(0,coalesce((w.attacker_snapshot->>'discipline')::numeric,0));
 dd:=greatest(0,coalesce((w.defender_snapshot->>'discipline')::numeric,0));
 ascore:=greatest(1,aa*1.35+coalesce((w.attacker_snapshot->>'defense')::numeric,0)*1.25+av*1.05+
 atc*1.15+ad*1.10+sqrt(aq)*100+coalesce((w.attacker_snapshot->>'xp')::numeric,0)*0.015);
 dscore:=greatest(1,da*1.35+coalesce((w.defender_snapshot->>'defense')::numeric,0)*1.25+dv*1.05+
 dtc*1.15+dd*1.10+sqrt(dq)*100+coalesce((w.defender_snapshot->>'xp')::numeric,0)*0.015);
 chance:=ascore/(ascore+dscore);
 if random()<chance then winner:=w.attacker_squad_id; else winner:=w.defender_squad_id; end if;
 al:=least(aq::bigint,ceil(aq*least(0.50,0.10+(dscore/(ascore+dscore))*0.38))::bigint);
 dl:=least(dq::bigint,ceil(dq*least(0.50,0.10+(ascore/(ascore+dscore))*0.38))::bigint);
 if winner=w.attacker_squad_id then dl:=greatest(dl,least(dq::bigint,ceil(dq*0.25)::bigint));
 else al:=greatest(al,least(aq::bigint,ceil(aq*0.25)::bigint)); end if;
 aleft:=greatest(0,aq::bigint-al); dleft:=greatest(0,dq::bigint-dl);
 reward_win:=least(500,75+floor(sqrt(greatest(1,case when winner=w.attacker_squad_id then dscore else ascore end))*2)::bigint);
 reward_loss:=25;
 for member_row in select sm.user_id,sm.squad_id from public.study_squad_members sm
 where sm.squad_id in(w.attacker_squad_id,w.defender_squad_id)
 loop
   if member_row.squad_id=winner then
     insert into public.wallets(user_id,coins,cash) values(member_row.user_id,reward_win,0)
     on conflict(user_id) do update set coins=public.wallets.coins+reward_win,updated_at=now();
     insert into public.wallet_transactions(user_id,currency,amount,reason,source)
     values(member_row.user_id,'coins',reward_win,'Squad war victory reward','squad_war');
     paid_winner:=paid_winner+1;
   else
     insert into public.wallets(user_id,coins,cash) values(member_row.user_id,reward_loss,0)
     on conflict(user_id) do update set coins=public.wallets.coins+reward_loss,updated_at=now();
     insert into public.wallet_transactions(user_id,currency,amount,reason,source)
     values(member_row.user_id,'coins',reward_loss,'Squad war participation reward','squad_war');
     paid_loser:=paid_loser+1;
   end if;
 end loop;
 events:=jsonb_build_array(
 jsonb_build_object('phase','FORCE ANALYSIS','detail',format('Composite score: %s vs %s. Attacker win probability: %s%%.',round(ascore,1),round(dscore,1),round(chance*100,1))),
 jsonb_build_object('phase','STAT BREAKDOWN','detail',format('Attack, defence, vitality, command, discipline, troop quantity and lifetime XP all contribute; no single stat guarantees victory.')),
 jsonb_build_object('phase','CASUALTY REPORT','detail',format('%s lost %s troops; %s lost %s troops',w.attacker_snapshot->>'name',al,w.defender_snapshot->>'name',dl)),
 jsonb_build_object('phase','COIN SETTLEMENT','detail',format('Winning squad: %s coins per member; losing squad: %s coins per member.',reward_win,reward_loss)),
 jsonb_build_object('phase','WAR RESULT','detail',format('%s wins with %s troops remaining',case when winner=w.attacker_squad_id then w.attacker_snapshot->>'name' else w.defender_snapshot->>'name' end,case when winner=w.attacker_squad_id then aleft else dleft end))
 );
 update public.study_squad_wars set status='completed',winner_squad_id=winner,attacker_losses=al,defender_losses=dl,battle_log=events,completed_at=now()
 where id=p_war_id;
 return jsonb_build_object('id',p_war_id,'status','completed','winner_squad_id',winner,'attacker_losses',al,
 'defender_losses',dl,'attacker_remaining',aleft,'defender_remaining',dleft,'attacker_score',round(ascore,1),
 'defender_score',round(dscore,1),'attacker_win_probability',round(chance*100,1),
 'winner_coins_per_member',reward_win,'loser_coins_per_member',reward_loss,'battle_log',events);
end $$;
revoke all on function public.resolve_squad_war(uuid) from public,anon;
grant execute on function public.resolve_squad_war(uuid) to authenticated;
