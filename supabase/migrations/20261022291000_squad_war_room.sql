-- Squad Wars: member armies combine automatically; no separate squad troop purchases.
create table if not exists public.study_squad_wars (
 id uuid primary key default gen_random_uuid(),
 attacker_squad_id uuid not null references public.study_squads(id) on delete cascade,
 defender_squad_id uuid not null references public.study_squads(id) on delete cascade,
 status text not null default 'active' check(status in ('active','completed')),
 attacker_snapshot jsonb not null,
 defender_snapshot jsonb not null,
 attacker_losses bigint not null default 0,
 defender_losses bigint not null default 0,
 winner_squad_id uuid references public.study_squads(id) on delete set null,
 battle_log jsonb not null default '[]'::jsonb,
 started_at timestamptz not null default now(),
 ends_at timestamptz not null default now()+interval '45 seconds',
 completed_at timestamptz,
 check(attacker_squad_id<>defender_squad_id)
);
create index if not exists study_squad_wars_attacker_idx on public.study_squad_wars(attacker_squad_id,started_at desc);
create index if not exists study_squad_wars_defender_idx on public.study_squad_wars(defender_squad_id,started_at desc);
alter table public.study_squad_wars enable row level security;
revoke all on public.study_squad_wars from anon,authenticated;
grant select on public.study_squad_wars to authenticated;
drop policy if exists "Squad members can view their wars" on public.study_squad_wars;
create policy "Squad members can view their wars" on public.study_squad_wars for select to authenticated using (
 exists(select 1 from public.study_squad_members sm where sm.squad_id=attacker_squad_id and sm.user_id=(select auth.uid()))
 or exists(select 1 from public.study_squad_members sm where sm.squad_id=defender_squad_id and sm.user_id=(select auth.uid()))
);

create or replace function public.squad_force_snapshot(p_squad uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s record; q numeric; power numeric; attack numeric; defense numeric; vitality numeric; discipline numeric; n integer;
begin
 select id,name into s from public.study_squads where id=p_squad;
 if not found then raise exception 'Squad not found'; end if;
 select count(*)::integer,
   coalesce(sum(coalesce(cc.army_quantity,5)),0),
   coalesce(sum(coalesce(cc.army_quantity,5)*100
    +coalesce(cc.attack_level,1)*140+coalesce(cc.defense_level,1)*120
    +coalesce(cc.vitality_level,1)*130+coalesce(cc.command_level,1)*160
    +coalesce(cc.discipline_level,1)*100),0),
   coalesce(sum(coalesce(cc.attack_level,1)*coalesce(cc.army_quantity,5)),0),
   coalesce(sum(coalesce(cc.defense_level,1)*coalesce(cc.army_quantity,5)),0),
   coalesce(sum(coalesce(cc.vitality_level,1)*coalesce(cc.army_quantity,5)),0),
   coalesce(sum(coalesce(cc.discipline_level,1)*coalesce(cc.army_quantity,5)),0)
 into n,q,power,attack,defense,vitality,discipline
 from public.study_squad_members sm left join public.combat_customizations cc on cc.user_id=sm.user_id
 where sm.squad_id=p_squad;
 return jsonb_build_object('squad_id',s.id,'name',s.name,'members',n,'army_quantity',q,
  'power',power,'attack',attack,'defense',defense,'vitality',vitality,'discipline',discipline);
end $$;

create or replace function public.get_squad_war_room() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); mine jsonb; targets jsonb; wars jsonb;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'my_role',sm.role,
  'force',public.squad_force_snapshot(s.id)) order by s.created_at), '[]'::jsonb)
 into mine from public.study_squad_members sm join public.study_squads s on s.id=sm.squad_id where sm.user_id=u;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'force',public.squad_force_snapshot(s.id)) order by s.name), '[]'::jsonb)
 into targets from public.study_squads s
 where not exists(select 1 from public.study_squad_members own where own.squad_id=s.id and own.user_id=u)
 and exists(select 1 from public.study_squad_members);
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'status',w.status,'attacker_squad_id',w.attacker_squad_id,
  'defender_squad_id',w.defender_squad_id,'attacker_snapshot',w.attacker_snapshot,'defender_snapshot',w.defender_snapshot,
  'attacker_losses',w.attacker_losses,'defender_losses',w.defender_losses,'winner_squad_id',w.winner_squad_id,
  'battle_log',w.battle_log,'started_at',w.started_at,'ends_at',w.ends_at,'completed_at',w.completed_at,
  'attacker_name',a.name,'defender_name',d.name) order by w.started_at desc), '[]'::jsonb)
 into wars from public.study_squad_wars w
 join public.study_squads a on a.id=w.attacker_squad_id join public.study_squads d on d.id=w.defender_squad_id
 where exists(select 1 from public.study_squad_members sm where sm.squad_id=w.attacker_squad_id and sm.user_id=u)
    or exists(select 1 from public.study_squad_members sm where sm.squad_id=w.defender_squad_id and sm.user_id=u);
 return jsonb_build_object('my_squads',mine,'targets',targets,'wars',wars);
end $$;

create or replace function public.start_squad_war(p_attacker_squad_id uuid,p_defender_squad_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a jsonb; d jsonb; war_id uuid;
begin
 if u is null then raise exception 'Sign in required'; end if;
 if p_attacker_squad_id=p_defender_squad_id then raise exception 'Choose a different opposing squad'; end if;
 if not exists(select 1 from public.study_squad_members where squad_id=p_attacker_squad_id and user_id=u and role in('leader','co_leader')) then
  raise exception 'Only squad leaders and co-leaders can declare war'; end if;
 if not exists(select 1 from public.study_squad_members where squad_id=p_defender_squad_id) then raise exception 'Opponent squad not found'; end if;
 if exists(select 1 from public.study_squad_wars w where w.status='active' and w.ends_at>now()
  and ((w.attacker_squad_id=p_attacker_squad_id and w.defender_squad_id=p_defender_squad_id)
    or (w.attacker_squad_id=p_defender_squad_id and w.defender_squad_id=p_attacker_squad_id))) then raise exception 'A war between these squads is already in progress'; end if;
 a:=public.squad_force_snapshot(p_attacker_squad_id); d:=public.squad_force_snapshot(p_defender_squad_id);
 if coalesce((a->>'army_quantity')::numeric,0)<=0 or coalesce((d->>'army_quantity')::numeric,0)<=0 then raise exception 'Both squads need at least one troop'; end if;
 insert into public.study_squad_wars(attacker_squad_id,defender_squad_id,attacker_snapshot,defender_snapshot)
 values(p_attacker_squad_id,p_defender_squad_id,a,d) returning id into war_id;
 return war_id;
end $$;

create or replace function public.resolve_squad_war(p_war_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w public.study_squad_wars; ap numeric; dp numeric; aq numeric; dq numeric;
 al bigint; dl bigint; winner uuid; aleft bigint; dleft bigint; events jsonb;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select * into w from public.study_squad_wars where id=p_war_id for update;
 if not found then raise exception 'War not found'; end if;
 if not exists(select 1 from public.study_squad_members where squad_id in(w.attacker_squad_id,w.defender_squad_id) and user_id=u) then raise exception 'You are not part of this war'; end if;
 if w.status='completed' then return jsonb_build_object('id',w.id,'status',w.status,'winner_squad_id',w.winner_squad_id,'attacker_losses',w.attacker_losses,'defender_losses',w.defender_losses,'battle_log',w.battle_log); end if;
 if now()<w.ends_at then raise exception 'War is still in progress'; end if;
 ap:=greatest(1,(w.attacker_snapshot->>'power')::numeric); dp:=greatest(1,(w.defender_snapshot->>'power')::numeric);
 aq:=greatest(1,(w.attacker_snapshot->>'army_quantity')::numeric); dq:=greatest(1,(w.defender_snapshot->>'army_quantity')::numeric);
 if ap=dp then if random()>=0.5 then winner:=w.attacker_squad_id; else winner:=w.defender_squad_id; end if;
 elsif ap>dp then winner:=w.attacker_squad_id; else winner:=w.defender_squad_id; end if;
 -- Each side loses a power-weighted share of its force; the victor still takes casualties.
 al:=least(aq::bigint,ceil(aq*least(0.42,0.12+(dp/(ap+dp))*0.35))::bigint);
 dl:=least(dq::bigint,ceil(dq*least(0.42,0.12+(ap/(ap+dp))*0.35))::bigint);
 if winner=w.attacker_squad_id then dl:=greatest(dl,least(dq::bigint,ceil(dq*0.28)::bigint));
 else al:=greatest(al,least(aq::bigint,ceil(aq*0.28)::bigint)); end if;
 aleft:=greatest(0,aq::bigint-al); dleft:=greatest(0,dq::bigint-dl);
 events:=jsonb_build_array(
  jsonb_build_object('phase','OPENING CLASH','detail',format('%s committed %s troops against %s',w.attacker_snapshot->>'name',aq,w.defender_snapshot->>'name')),
  jsonb_build_object('phase','POWER EXCHANGE','detail',format('Power %s vs %s · attack/defence/vitality/discipline factored into total force',ap,dp)),
  jsonb_build_object('phase','CASUALTY REPORT','detail',format('%s lost %s troops; %s lost %s troops',w.attacker_snapshot->>'name',al,w.defender_snapshot->>'name',dl)),
  jsonb_build_object('phase','WAR RESULT','detail',format('%s wins with %s troops remaining',case when winner=w.attacker_squad_id then w.attacker_snapshot->>'name' else w.defender_snapshot->>'name' end,case when winner=w.attacker_squad_id then aleft else dleft end))
 );
 update public.study_squad_wars set status='completed',winner_squad_id=winner,attacker_losses=al,defender_losses=dl,battle_log=events,completed_at=now() where id=p_war_id;
 return jsonb_build_object('id',p_war_id,'status','completed','winner_squad_id',winner,'attacker_losses',al,'defender_losses',dl,'battle_log',events);
end $$;
revoke all on function public.squad_force_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.get_squad_war_room() from public,anon;
revoke all on function public.start_squad_war(uuid,uuid) from public,anon;
revoke all on function public.resolve_squad_war(uuid) from public,anon;
grant execute on function public.get_squad_war_room() to authenticated;
grant execute on function public.start_squad_war(uuid,uuid) to authenticated;
grant execute on function public.resolve_squad_war(uuid) to authenticated;
