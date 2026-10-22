-- Ascend progression: server-authoritative army stats and squad upgrades.
alter table public.combat_customizations
 add column if not exists command_level integer not null default 1 check(command_level between 1 and 50),
 add column if not exists attack_level integer not null default 1 check(attack_level between 1 and 50),
 add column if not exists defense_level integer not null default 1 check(defense_level between 1 and 50),
 add column if not exists vitality_level integer not null default 1 check(vitality_level between 1 and 50),
 add column if not exists discipline_level integer not null default 1 check(discipline_level between 1 and 50);
create or replace function public.upgrade_combat_attribute(p_attribute text) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); current_level integer; price bigint; balance bigint;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_attribute not in ('command_level','attack_level','defense_level','vitality_level','discipline_level') then raise exception 'Invalid army attribute'; end if;
 insert into public.combat_customizations(user_id) values(u) on conflict(user_id) do nothing;
 execute format('select %I from public.combat_customizations where user_id=$1 for update',p_attribute) into current_level using u;
 if current_level>=50 then raise exception 'Attribute is already at maximum level'; end if;
 price:=150*current_level;
 update public.wallets set coins=coins-price,updated_at=now() where user_id=u and coins>=price returning coins into balance;
 if not found then raise exception 'Not enough coins'; end if;
 execute format('update public.combat_customizations set %I=$1,updated_at=now() where user_id=$2',p_attribute) using current_level+1,u;
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',-price,'Army attribute upgrade: '||p_attribute,'combat_stat_upgrade');
 return jsonb_build_object('success',true,'attribute',p_attribute,'level',current_level+1,'price',price,'coins',balance);
end $$;
revoke all on function public.upgrade_combat_attribute(text) from public;
grant execute on function public.upgrade_combat_attribute(text) to authenticated;

alter table public.study_squads
 add column if not exists ascend_level integer not null default 1 check(ascend_level between 1 and 50),
 add column if not exists ascend_power bigint not null default 500,
 add column if not exists army_quantity integer not null default 5 check(army_quantity between 5 and 50),
 add column if not exists attack_level integer not null default 1 check(attack_level between 1 and 50),
 add column if not exists defense_level integer not null default 1 check(defense_level between 1 and 50),
 add column if not exists vitality_level integer not null default 1 check(vitality_level between 1 and 50),
 add column if not exists discipline_level integer not null default 1 check(discipline_level between 1 and 50);
create or replace function public.upgrade_study_squad(p_squad_id uuid,p_attribute text) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); current_level integer; next_level integer; price bigint; balance bigint; new_power bigint; new_level integer; new_quantity integer;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_attribute not in ('army_quantity','attack_level','defense_level','vitality_level','discipline_level') then raise exception 'Invalid squad upgrade'; end if;
 perform 1 from public.study_squad_members where squad_id=p_squad_id and user_id=u and role in ('leader','co_leader');
 if not found then raise exception 'Only squad leaders and co-leaders can upgrade Squad Ascend'; end if;
 perform 1 from public.study_squads where id=p_squad_id for update;
 if not found then raise exception 'Squad not found'; end if;
 execute format('select %I from public.study_squads where id=$1',p_attribute) into current_level using p_squad_id;
 if p_attribute='army_quantity' then
  if current_level>=50 then raise exception 'Squad army is at maximum capacity'; end if;
  price:=250*((current_level-5)/5+1); next_level:=least(50,current_level+5);
 else
  if current_level>=50 then raise exception 'Squad attribute is at maximum level'; end if;
  price:=200*current_level; next_level:=current_level+1;
 end if;
 update public.wallets set coins=coins-price,updated_at=now() where user_id=u and coins>=price returning coins into balance;
 if not found then raise exception 'Not enough coins'; end if;
 execute format('update public.study_squads set %I=$1,ascend_level=least(50,ascend_level+1),ascend_power=ascend_power+$2 where id=$3',p_attribute)
 using next_level,case when p_attribute='army_quantity' then 500 else 100*next_level end,p_squad_id;
 select ascend_power,ascend_level,army_quantity into new_power,new_level,new_quantity from public.study_squads where id=p_squad_id;
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',-price,'Squad Ascend upgrade: '||p_attribute,'squad_ascend_upgrade');
 return jsonb_build_object('success',true,'attribute',p_attribute,'level',next_level,'army_quantity',new_quantity,'ascend_power',new_power,'ascend_level',new_level,'price',price,'coins',balance);
end $$;
revoke all on function public.upgrade_study_squad(uuid,text) from public;
grant execute on function public.upgrade_study_squad(uuid,text) to authenticated;
