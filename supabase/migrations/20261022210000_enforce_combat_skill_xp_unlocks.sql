create or replace function public.enforce_combat_skill_xp_unlocks()
returns trigger language plpgsql set search_path=public as $$
declare required_xp bigint;
begin
 if tg_op='INSERT' then return new; end if;
 if new.skill_one is distinct from old.skill_one then
  required_xp:=case new.skill_one when 'quick_slash' then 0 when 'guard_break' then 100 when 'shadow_step' then 250 when 'counter_stance' then 500 when 'piercing_thrust' then 1000 else 0 end;
  if new.xp<required_xp then raise exception 'This tactical skill unlocks at % lifetime XP',required_xp; end if;
 end if;
 if new.skill_two is distinct from old.skill_two then
  required_xp:=case new.skill_two when 'iron_guard' then 0 when 'second_wind' then 100 when 'focus_surge' then 250 when 'riposte' then 500 when 'blink_strike' then 1000 else 0 end;
  if new.xp<required_xp then raise exception 'This tactical skill unlocks at % lifetime XP',required_xp; end if;
 end if;
 if new.ultimate is distinct from old.ultimate then
  required_xp:=case new.ultimate when 'crimson_breaker' then 0 when 'void_tempest' then 500 when 'aegis_burst' then 1000 when 'phantom_execution' then 2000 else 0 end;
  if new.xp<required_xp then raise exception 'This ultimate unlocks at % lifetime XP',required_xp; end if;
 end if;
 return new;
end $$;
drop trigger if exists combat_skill_xp_unlock_guard on public.combat_fighters;
create trigger combat_skill_xp_unlock_guard before update of skill_one,skill_two,ultimate on public.combat_fighters for each row execute function public.enforce_combat_skill_xp_unlocks();