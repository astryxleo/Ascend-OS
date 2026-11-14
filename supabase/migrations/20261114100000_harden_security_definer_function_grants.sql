-- Tighten direct execution of SECURITY DEFINER functions.
-- Client-facing RPCs remain available to signed-in users; operator RPCs retain
-- their internal public.is_operator() authorization checks.
begin;

revoke all on function public.conquest_has_starter_shield(uuid) from public, anon;
grant execute on function public.conquest_has_starter_shield(uuid) to authenticated;

revoke all on function public.edit_operator_contact_request(uuid, text, text, text) from public, anon;
grant execute on function public.edit_operator_contact_request(uuid, text, text, text) to authenticated;

revoke all on function public.ensure_default_combat_cosmetics() from public, anon;
grant execute on function public.ensure_default_combat_cosmetics() to authenticated;

revoke all on function public.equip_combat_cosmetic(text) from public, anon;
grant execute on function public.equip_combat_cosmetic(text) to authenticated;

revoke all on function public.get_achievement_leaderboard(integer) from public, anon;
grant execute on function public.get_achievement_leaderboard(integer) to authenticated;

revoke all on function public.get_conquest_leaderboard(integer) from public, anon;
grant execute on function public.get_conquest_leaderboard(integer) to authenticated;

revoke all on function public.operator_get_user_dossier(uuid) from public, anon;
grant execute on function public.operator_get_user_dossier(uuid) to authenticated;

revoke all on function public.operator_gift_rewards(uuid, bigint, bigint, bigint, text) from public, anon;
grant execute on function public.operator_gift_rewards(uuid, bigint, bigint, bigint, text) to authenticated;

revoke all on function public.operator_send_user_warning(uuid, text, text) from public, anon;
grant execute on function public.operator_send_user_warning(uuid, text, text) to authenticated;

revoke all on function public.operator_set_cosmetic_discount(text, integer, boolean) from public, anon;
grant execute on function public.operator_set_cosmetic_discount(text, integer, boolean) to authenticated;

revoke all on function public.set_study_squad_flag_url(uuid, text) from public, anon;
grant execute on function public.set_study_squad_flag_url(uuid, text) to authenticated;

revoke all on function public.upgrade_combat_army() from public, anon;
grant execute on function public.upgrade_combat_army() to authenticated;

revoke all on function public.upgrade_study_squad(uuid, text) from public, anon;
grant execute on function public.upgrade_study_squad(uuid, text) to authenticated;

-- Trigger functions are invoked by PostgreSQL triggers, never directly by clients.
revoke all on function public.enforce_conquest_territory_starter_shield() from public, anon, authenticated;
revoke all on function public.grant_ascend_souls_from_xp() from public, anon, authenticated;
revoke all on function public.record_conquest_shield_unlock() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
