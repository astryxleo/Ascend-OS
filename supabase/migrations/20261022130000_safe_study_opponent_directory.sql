-- Expose only safe public profile fields to authenticated users for the duel opponent picker.
-- Profile RLS intentionally keeps full profile records private, so this RPC is the directory boundary.
create or replace function public.list_study_opponents()
returns table(id uuid, username text, full_name text, avatar_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null then raise exception 'authentication required'; end if;
  return query
    select p.id,p.username,p.full_name,p.avatar_url
    from public.profiles p
    where p.id <> actor
    order by coalesce(nullif(p.full_name,''),p.username);
end;
$$;

revoke all on function public.list_study_opponents() from public, anon;
grant execute on function public.list_study_opponents() to authenticated;
