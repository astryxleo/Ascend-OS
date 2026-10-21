-- Private study uploads and public profile avatars. Applied to Supabase project lavhnyodtacrjrcbyymj.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('lumen-avatars','lumen-avatars',true,5242880,array['image/jpeg','image/png','image/webp','image/avif']),
('lumen-study-files','lumen-study-files',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','text/plain'])
on conflict(id) do nothing;
drop policy if exists "lumen avatar public read" on storage.objects;
create policy "lumen avatar public read" on storage.objects for select to public using(bucket_id='lumen-avatars');
drop policy if exists "lumen avatar owner upload" on storage.objects;
create policy "lumen avatar owner upload" on storage.objects for insert to authenticated with check(bucket_id='lumen-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "lumen avatar owner update" on storage.objects;
create policy "lumen avatar owner update" on storage.objects for update to authenticated using(bucket_id='lumen-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='lumen-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "lumen avatar owner delete" on storage.objects;
create policy "lumen avatar owner delete" on storage.objects for delete to authenticated using(bucket_id='lumen-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "lumen study files owner read" on storage.objects;
create policy "lumen study files owner read" on storage.objects for select to authenticated using(bucket_id='lumen-study-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "lumen study files owner upload" on storage.objects;
create policy "lumen study files owner upload" on storage.objects for insert to authenticated with check(bucket_id='lumen-study-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "lumen study files owner update" on storage.objects;
create policy "lumen study files owner update" on storage.objects for update to authenticated using(bucket_id='lumen-study-files' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='lumen-study-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "lumen study files owner delete" on storage.objects;
create policy "lumen study files owner delete" on storage.objects for delete to authenticated using(bucket_id='lumen-study-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
