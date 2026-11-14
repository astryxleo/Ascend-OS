begin;

-- Replace ALL policies with command-specific operator policies so SELECT can
-- be expressed once without duplicate permissive evaluation.
drop policy if exists "broadcasts operator manage" on public.broadcasts;
drop policy if exists "broadcasts published read" on public.broadcasts;
create policy "broadcasts read published or operator"
on public.broadcasts for select to authenticated
using (
  public.is_operator()
  or (
    is_published
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  )
);
create policy "broadcasts operator insert"
on public.broadcasts for insert to authenticated
with check (public.is_operator());
create policy "broadcasts operator update"
on public.broadcasts for update to authenticated
using (public.is_operator())
with check (public.is_operator());
create policy "broadcasts operator delete"
on public.broadcasts for delete to authenticated
using (public.is_operator());

drop policy if exists "operator authors syllabus" on public.syllabus_steps;
drop policy if exists "published syllabus readable" on public.syllabus_steps;
create policy "syllabus published read or operator"
on public.syllabus_steps for select to authenticated
using (is_published or public.is_operator());
create policy "syllabus operator insert"
on public.syllabus_steps for insert to authenticated
with check (public.is_operator());
create policy "syllabus operator update"
on public.syllabus_steps for update to authenticated
using (public.is_operator())
with check (public.is_operator());
create policy "syllabus operator delete"
on public.syllabus_steps for delete to authenticated
using (public.is_operator());

commit;
