begin;

-- Keep published broadcasts readable; the separate ALL policy grants operators full access.
drop policy if exists "broadcasts published read" on public.broadcasts;
create policy "broadcasts published read"
on public.broadcasts for select to authenticated
using (
  is_published
  and starts_at <= now()
  and (ends_at is null or ends_at > now())
);

-- Merge active-catalog and operator visibility into one SELECT policy.
drop policy if exists "Cosmetic catalog is visible to authenticated users" on public.combat_cosmetic_catalog;
drop policy if exists "Operator can inspect complete cosmetic catalog" on public.combat_cosmetic_catalog;
create policy "Authenticated users can read active cosmetics; operators can read all"
on public.combat_cosmetic_catalog for select to authenticated
using (active or public.is_operator());

-- The second DELETE policy already contains the complete leader/co-leader rule
-- plus the member-self-leave rule, so the narrower duplicate is redundant.
drop policy if exists "Leaders can manage membership" on public.study_squad_members;

-- Operators retain ALL access through the separate ALL policy; normal users
-- can read only published syllabus steps.
drop policy if exists "published syllabus readable" on public.syllabus_steps;
create policy "published syllabus readable"
on public.syllabus_steps for select to authenticated
using (is_published);

commit;
