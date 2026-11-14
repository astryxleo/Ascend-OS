-- Add indexes for foreign-key columns that currently lack covering indexes.
begin;

create index if not exists ascend_notifications_related_request_id_idx
  on public.ascend_notifications (related_request_id);
create index if not exists combat_cosmetic_equipped_cosmetic_id_idx
  on public.combat_cosmetic_equipped (cosmetic_id);
create index if not exists combat_cosmetic_owned_cosmetic_id_idx
  on public.combat_cosmetic_owned (cosmetic_id);
create index if not exists conquest_battles_territory_id_idx
  on public.conquest_battles (territory_id);
create index if not exists operator_reward_gifts_target_user_idx
  on public.operator_reward_gifts (target_user);
create index if not exists operator_user_bans_created_by_idx
  on public.operator_user_bans (created_by);
create index if not exists player_card_equipped_user_card_idx
  on public.player_card_equipped (user_id, card_id);
create index if not exists player_card_owned_card_id_idx
  on public.player_card_owned (card_id);
create index if not exists study_squad_challenges_created_by_idx
  on public.study_squad_challenges (created_by);
create index if not exists study_squad_wars_winner_squad_id_idx
  on public.study_squad_wars (winner_squad_id);
create index if not exists study_squads_created_by_idx
  on public.study_squads (created_by);

-- Cache auth.uid() once per statement instead of evaluating it for every row.
drop policy if exists "Users can update own combat customization" on public.combat_customizations;
create policy "Users can update own combat customization"
on public.combat_customizations for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read own cosmetic inventory" on public.combat_cosmetic_owned;
create policy "Users can read own cosmetic inventory"
on public.combat_cosmetic_owned for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Read own player card inventory" on public.player_card_owned;
create policy "Read own player card inventory"
on public.player_card_owned for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Read own equipped player card" on public.player_card_equipped;
create policy "Read own equipped player card"
on public.player_card_equipped for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own combat customization" on public.combat_customizations;
create policy "Users can read own combat customization"
on public.combat_customizations for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own combat customization" on public.combat_customizations;
create policy "Users can create own combat customization"
on public.combat_customizations for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Players can view own conquest reports" on public.conquest_battles;
create policy "Players can view own conquest reports"
on public.conquest_battles for select to authenticated
using (attacker_id = (select auth.uid()));

drop policy if exists "Users can read own cursor preference" on public.ascend_cursor_preferences;
create policy "Users can read own cursor preference"
on public.ascend_cursor_preferences for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own cursor inventory" on public.ascend_cursor_inventory;
create policy "Users can read own cursor inventory"
on public.ascend_cursor_inventory for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users read their own operator requests" on public.operator_contact_requests;
create policy "Users read their own operator requests"
on public.operator_contact_requests for select to authenticated
using (
  (user_id = (select auth.uid()))
  or lower(coalesce(((select auth.jwt())->>'email'),'')) in ('astryxleo@gmail.com','yoursjace@gmail.com')
);

notify pgrst, 'reload schema';
commit;
