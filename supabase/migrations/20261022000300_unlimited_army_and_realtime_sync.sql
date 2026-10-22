-- Unlimited army quantity and live, cross-client updates for Ascend OS.
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass as rel from pg_constraint
    where conrelid in ('public.combat_customizations'::regclass, 'public.study_squads'::regclass)
      and contype='c' and pg_get_constraintdef(oid) ilike '%army_quantity%'
  loop execute format('alter table %s drop constraint %I',c.rel,c.conname); end loop;
end $$;
alter table public.combat_customizations alter column army_quantity type bigint using army_quantity::bigint;
alter table public.study_squads alter column army_quantity type bigint using army_quantity::bigint;

create or replace function public.upgrade_combat_army()
returns jsonb language plpgsql security definer set search_path=public as $function$
declare u uuid:=auth.uid(); current_qty bigint; price bigint; balance bigint; next_qty bigint;
begin
 if u is null then raise exception 'Authentication required'; end if;
 insert into public.combat_customizations(user_id) values(u) on conflict(user_id) do nothing;
 select army_quantity into current_qty from public.combat_customizations where user_id=u for update;
 if current_qty > 9223372036854775790 then raise exception 'Army quantity has reached the database numeric ceiling'; end if;
 price:=250*((current_qty-5)/5+1);
 update public.wallets set coins=coins-price,updated_at=now() where user_id=u and coins>=price returning coins into balance;
 if not found then raise exception 'Not enough coins'; end if;
 next_qty:=current_qty+5;
 update public.combat_customizations set army_quantity=next_qty,updated_at=now() where user_id=u;
 insert into public.wallet_transactions(user_id,currency,amount,reason,source) values(u,'coins',-price,'Combat army capacity upgrade','combat_army_upgrade');
 return jsonb_build_object('success',true,'army_quantity',next_qty,'price',price,'coins',balance);
end $function$;
revoke all on function public.upgrade_combat_army() from public;
grant execute on function public.upgrade_combat_army() to authenticated;

create or replace function public.upgrade_study_squad(p_squad_id uuid,p_attribute text)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare u uuid:=auth.uid(); current_level bigint; next_level bigint; price bigint; balance bigint; new_power bigint; new_level integer; new_quantity bigint;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_attribute not in ('army_quantity','attack_level','defense_level','vitality_level','discipline_level') then raise exception 'Invalid squad upgrade'; end if;
 perform 1 from public.study_squad_members where squad_id=p_squad_id and user_id=u and role in ('leader','co_leader');
 if not found then raise exception 'Only squad leaders and co-leaders can upgrade Squad Ascend'; end if;
 perform 1 from public.study_squads where id=p_squad_id for update;
 if not found then raise exception 'Squad not found'; end if;
 execute format('select %I from public.study_squads where id=$1',p_attribute) into current_level using p_squad_id;
 if p_attribute='army_quantity' then
   if current_level > 9223372036854775790 then raise exception 'Army quantity has reached the database numeric ceiling'; end if;
   price:=250*((current_level-5)/5+1); next_level:=current_level+5;
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
end $function$;
revoke all on function public.upgrade_study_squad(uuid,text) from public;
grant execute on function public.upgrade_study_squad(uuid,text) to authenticated;

do $$
declare t record;
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
   raise notice 'supabase_realtime publication is unavailable'; return;
 end if;
 for t in select schemaname,tablename from pg_tables where schemaname='public' loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname=t.schemaname and tablename=t.tablename) then
     execute format('alter publication supabase_realtime add table %I.%I',t.schemaname,t.tablename);
   end if;
 end loop;
end $$;
