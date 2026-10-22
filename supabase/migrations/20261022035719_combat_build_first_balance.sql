CREATE OR REPLACE FUNCTION public.combat_build_snapshot(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.combat_fighters; un text; fn text; a integer; d integer; s integer; u_power integer;
begin
 select * into f from public.combat_fighters where user_id=p_user;
 if not found then raise exception 'Fighter not found'; end if;
 select coalesce(nullif(username,''),'Scholar'),coalesce(nullif(full_name,''),'Ascend Player') into un,fn from public.profiles where id=p_user;
 a:=18+least(f.level,100)+case f.weapon_class when 'greatsword' then 15 when 'dual_blades' then 5 when 'gauntlets' then 9 when 'spear' then 8 else 10 end
   +case f.skill_one when 'guard_break' then 8 when 'piercing_thrust' then 6 when 'quick_slash' then 3 else 0 end
   +case f.skill_two when 'focus_surge' then 3 when 'blink_strike' then 4 else 0 end;
 d:=10+least(f.level,100)/2+case f.armor_class when 'guardian' then 18 when 'bastion' then 24 when 'phantom' then 5 else 12 end
   +case f.skill_one when 'counter_stance' then 7 else 0 end+case f.skill_two when 'iron_guard' then 9 when 'second_wind' then 3 else 0 end;
 s:=case f.weapon_class when 'dual_blades' then 27 when 'gauntlets' then 22 when 'spear' then 18 when 'katana' then 20 else 11 end
   +case f.armor_class when 'phantom' then 12 when 'bastion' then -6 else 0 end
   +case f.skill_one when 'shadow_step' then 9 else 0 end+case f.skill_two when 'blink_strike' then 5 else 0 end;
 u_power:=case f.ultimate when 'void_tempest' then 34 when 'aegis_burst' then 18 when 'phantom_execution' then 40 else 25 end;
 return jsonb_build_object('user_id',p_user,'username',un,'name',fn,'level',f.level,'rating',f.rating,'weapon',f.weapon_class,'armor',f.armor_class,
 'skill_one',f.skill_one,'skill_two',f.skill_two,'ultimate',f.ultimate,'attack',a,'defense',d,'speed',s,'stamina',90,'max_hp',180+d*2,'ultimate_power',u_power);
end $function$


CREATE OR REPLACE FUNCTION public.resolve_combat_match(p_match uuid)
 RETURNS combat_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); m public.combat_matches; ha integer; hb integer; aa integer; ab integer; da integer; db integer; sa integer; sb integer;
i integer; ra integer; rb integer; dmg integer; actor text; act text; events jsonb:='[]'::jsonb; win uuid;
xa integer:=40; xb integer:=40; ca integer:=50; cb integer:=50; r_a integer; r_b integer;
maxa integer; maxb integer; healed_a boolean:=false; healed_b boolean:=false; s1a text; s1b text; s2a text; s2b text; ua integer; ub integer;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select * into m from public.combat_matches where id=p_match for update;
 if not found or (m.challenger_id<>u and m.opponent_id<>u) then raise exception 'Duel not found'; end if;
 if m.status='completed' then return m; end if;
 if m.status<>'active' then raise exception 'Both players must be ready before battle'; end if;
 if now()<m.started_at+make_interval(secs=>m.duration_seconds) then raise exception 'Battle is still in progress'; end if;
 ha:=(m.challenger_snapshot->>'max_hp')::integer; hb:=(m.opponent_snapshot->>'max_hp')::integer; maxa:=ha;maxb:=hb;
 aa:=(m.challenger_snapshot->>'attack')::integer; ab:=(m.opponent_snapshot->>'attack')::integer;
 da:=(m.challenger_snapshot->>'defense')::integer; db:=(m.opponent_snapshot->>'defense')::integer;
 sa:=(m.challenger_snapshot->>'speed')::integer; sb:=(m.opponent_snapshot->>'speed')::integer;
 s1a:=m.challenger_snapshot->>'skill_one';s1b:=m.opponent_snapshot->>'skill_one';
 s2a:=m.challenger_snapshot->>'skill_two';s2b:=m.opponent_snapshot->>'skill_two';
 ua:=coalesce((m.challenger_snapshot->>'ultimate_power')::integer,25);ub:=coalesce((m.opponent_snapshot->>'ultimate_power')::integer,25);
 for i in 1..12 loop
  ra:=get_byte(decode(substr(md5(m.seed::text||':a:'||i::text),1,8),'hex'),0)%100;
  rb:=get_byte(decode(substr(md5(m.seed::text||':b:'||i::text),1,8),'hex'),0)%100;
  if ha<=0 or hb<=0 then exit; end if;
  if sa+ra>=sb+rb then
   actor:='challenger';dmg:=greatest(4,aa-floor(db*.28)::integer+(ra%11));
   if i=6 then dmg:=dmg+ua;act:='ultimate';
   elsif i%3=0 and s1a='guard_break' then dmg:=dmg+12;act:='GUARD BREAK';
   elsif i%3=0 and s1a='piercing_thrust' then dmg:=dmg+9;act:='PIERCING THRUST';
   elsif i%4=0 and s2a='focus_surge' then dmg:=dmg+10;act:='FOCUS SURGE';
   elsif i%4=0 then dmg:=dmg+8;act:='combo';else act:='strike';end if;
   if s1b='counter_stance' and i%3=0 then dmg:=greatest(2,dmg-9);end if;
   if s2b='iron_guard' then dmg:=greatest(2,dmg-5);end if;
   hb:=greatest(0,hb-dmg);
   if not healed_b and s2b='second_wind' and hb>0 and hb<maxb/2 then hb:=least(maxb,hb+22);healed_b:=true;end if;
  else
   actor:='opponent';dmg:=greatest(4,ab-floor(da*.28)::integer+(rb%11));
   if i=6 then dmg:=dmg+ub;act:='ultimate';
   elsif i%3=0 and s1b='guard_break' then dmg:=dmg+12;act:='GUARD BREAK';
   elsif i%3=0 and s1b='piercing_thrust' then dmg:=dmg+9;act:='PIERCING THRUST';
   elsif i%4=0 and s2b='focus_surge' then dmg:=dmg+10;act:='FOCUS SURGE';
   elsif i%4=0 then dmg:=dmg+8;act:='combo';else act:='strike';end if;
   if s1a='counter_stance' and i%3=0 then dmg:=greatest(2,dmg-9);end if;
   if s2a='iron_guard' then dmg:=greatest(2,dmg-5);end if;
   ha:=greatest(0,ha-dmg);
   if not healed_a and s2a='second_wind' and ha>0 and ha<maxa/2 then ha:=least(maxa,ha+22);healed_a:=true;end if;
  end if;
  events:=events||jsonb_build_array(jsonb_build_object('turn',i,'actor',actor,'action',act,'damage',dmg,'hp_challenger',ha,'hp_opponent',hb,'label',case act when 'ultimate' then 'ULTIMATE IMPACT' when 'GUARD BREAK' then 'GUARD BREAK' when 'PIERCING THRUST' then 'PIERCING THRUST' when 'FOCUS SURGE' then 'FOCUS SURGE' when 'combo' then 'COMBO CHAIN' else 'CLEAN STRIKE' end));
 end loop;
 if ha=hb then if aa+sa+ra>=ab+sb+rb then win:=m.challenger_id;else win:=m.opponent_id;end if;elsif ha>hb then win:=m.challenger_id;else win:=m.opponent_id;end if;
 if win=m.challenger_id then xa:=75;ca:=120;r_a:=20;r_b:=-15;else xb:=75;cb:=120;r_a:=-15;r_b:=20;end if;
 update public.combat_fighters set xp=xp+xa,level=least(100,1+floor(sqrt((xp+xa)::numeric/100))::integer),wins=wins+case when win=m.challenger_id then 1 else 0 end,losses=losses+case when win<>m.challenger_id then 1 else 0 end,rating=greatest(0,least(5000,rating+r_a)),updated_at=now() where user_id=m.challenger_id;
 update public.combat_fighters set xp=xp+xb,level=least(100,1+floor(sqrt((xp+xb)::numeric/100))::integer),wins=wins+case when win=m.opponent_id then 1 else 0 end,losses=losses+case when win<>m.opponent_id then 1 else 0 end,rating=greatest(0,least(5000,rating+r_b)),updated_at=now() where user_id=m.opponent_id;
 insert into public.wallets(user_id,coins,cash) values(m.challenger_id,ca,0) on conflict(user_id) do update set coins=public.wallets.coins+ca,updated_at=now();
 insert into public.wallets(user_id,coins,cash) values(m.opponent_id,cb,0) on conflict(user_id) do update set coins=public.wallets.coins+cb,updated_at=now();
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(m.challenger_id,'coins',ca,'Combat duel reward','combat'),(m.opponent_id,'coins',cb,'Combat duel reward','combat');
 update public.combat_matches set status='completed',winner_id=win,event_log=events,completed_at=now(),result=jsonb_build_object('winner_id',win,'challenger_hp',ha,'opponent_hp',hb,'challenger_coins',ca,'opponent_coins',cb,'challenger_xp',xa,'opponent_xp',xb) where id=p_match returning * into m;return m;
end $function$

