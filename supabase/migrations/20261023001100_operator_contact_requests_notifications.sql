create table if not exists public.operator_contact_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 user_email text not null default '',
 category text not null check (category in ('Bug / technical issue','Feature request','Account & progress','Rewards / economy','Combat / territory','Safety or moderation','Other')),
 subject text not null check (char_length(subject) between 3 and 140),
 message text not null check (char_length(message) between 10 and 8000),
 status text not null default 'awaiting' check (status in ('awaiting','accepted','in_progress','rejected','resolved')),
 operator_remark text not null default '',
 read_confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 handled_by text
);
create index if not exists operator_contact_requests_user_created_idx on public.operator_contact_requests(user_id,created_at desc);
create index if not exists operator_contact_requests_status_created_idx on public.operator_contact_requests(status,created_at desc);
alter table public.operator_contact_requests enable row level security;
drop policy if exists "Users read their own operator requests" on public.operator_contact_requests;
create policy "Users read their own operator requests" on public.operator_contact_requests for select to authenticated using ((select auth.uid())=user_id or lower(coalesce((select auth.jwt()->>'email'),''))='astryxleo@gmail.com');
create table if not exists public.ascend_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 message text not null,
 kind text not null default 'info' check(kind in ('info','success','warning','operator','level_up','battle')),
 related_request_id uuid references public.operator_contact_requests(id) on delete cascade,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists ascend_notifications_user_created_idx on public.ascend_notifications(user_id,created_at desc);
alter table public.ascend_notifications enable row level security;
drop policy if exists "Users read their own notifications" on public.ascend_notifications;
create policy "Users read their own notifications" on public.ascend_notifications for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "Users mark own notifications read" on public.ascend_notifications;
create policy "Users mark own notifications read" on public.ascend_notifications for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select on public.operator_contact_requests, public.ascend_notifications to authenticated;
grant update(read_at) on public.ascend_notifications to authenticated;
create or replace function public.submit_operator_contact_request(p_category text,p_subject text,p_message text)
returns public.operator_contact_requests language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e text:=coalesce(auth.jwt()->>'email',''); result public.operator_contact_requests;
begin
 if u is null then raise exception 'Sign in required'; end if;
 if char_length(trim(coalesce(p_subject,''))) not between 3 and 140 then raise exception 'Subject must be 3–140 characters'; end if;
 if char_length(trim(coalesce(p_message,''))) not between 10 and 8000 then raise exception 'Message must be 10–8000 characters'; end if;
 if p_category not in ('Bug / technical issue','Feature request','Account & progress','Rewards / economy','Combat / territory','Safety or moderation','Other') then raise exception 'Choose a valid request category'; end if;
 insert into public.operator_contact_requests(user_id,user_email,category,subject,message) values(u,e,p_category,trim(p_subject),trim(p_message)) returning * into result;
 insert into public.ascend_notifications(user_id,title,message,kind,related_request_id)
 select id,'New operator request',coalesce(nullif(e,''),'A player')||' submitted: '||trim(p_subject),'operator',result.id from auth.users where lower(coalesce(email,''))='astryxleo@gmail.com';
 return result;
end; $$;
revoke all on function public.submit_operator_contact_request(text,text,text) from public,anon;
grant execute on function public.submit_operator_contact_request(text,text,text) to authenticated;
create or replace function public.operator_manage_contact_request(p_request_id uuid,p_status text,p_remark text,p_read_confirmed boolean default false)
returns public.operator_contact_requests language plpgsql security definer set search_path='' as $$
declare e text:=lower(coalesce(auth.jwt()->>'email','')); result public.operator_contact_requests;
begin
 if auth.uid() is null or e <> 'astryxleo@gmail.com' then raise exception 'Operator access required'; end if;
 if not p_read_confirmed then raise exception 'Read the complete request before updating its status'; end if;
 if p_status not in ('accepted','in_progress','rejected','resolved') then raise exception 'Invalid request status'; end if;
 update public.operator_contact_requests r set status=p_status,operator_remark=left(coalesce(p_remark,''),4000),read_confirmed_at=coalesce(r.read_confirmed_at,now()),updated_at=now(),handled_by=e where r.id=p_request_id returning * into result;
 if result.id is null then raise exception 'Request not found'; end if;
 insert into public.ascend_notifications(user_id,title,message,kind,related_request_id)
 values(result.user_id,case p_status when 'accepted' then 'Operator accepted your request' when 'in_progress' then 'Your request is in progress' when 'rejected' then 'Operator updated your request' when 'resolved' then 'Your request is resolved' end,
 'Request: '||result.subject||E'\nStatus: '||replace(p_status,'_',' ')||case when coalesce(trim(p_remark),'')<>'' then E'\nOperator note: '||left(trim(p_remark),4000) else '' end,'operator',result.id);
 return result;
end; $$;
revoke all on function public.operator_manage_contact_request(uuid,text,text,boolean) from public,anon;
grant execute on function public.operator_manage_contact_request(uuid,text,text,boolean) to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='operator_contact_requests') then alter publication supabase_realtime add table public.operator_contact_requests; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ascend_notifications') then alter publication supabase_realtime add table public.ascend_notifications; end if;
end $$;
revoke all on table public.operator_contact_requests from public, anon, authenticated;
revoke all on table public.ascend_notifications from public, anon, authenticated;
grant select on table public.operator_contact_requests, public.ascend_notifications to authenticated;
grant update(read_at) on table public.ascend_notifications to authenticated;

create or replace function public.operator_send_notification(p_user_id uuid,p_title text,p_message text,p_kind text default 'operator')
returns public.ascend_notifications language plpgsql security definer set search_path='' as $$
declare e text:=lower(coalesce(auth.jwt()->>'email','')); result public.ascend_notifications;
begin
 if auth.uid() is null or e<>'astryxleo@gmail.com' then raise exception 'Operator access required'; end if;
 if p_user_id is null then raise exception 'Choose a recipient'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 3 and 120 then raise exception 'Title must be 3–120 characters'; end if;
 if char_length(trim(coalesce(p_message,''))) not between 3 and 4000 then raise exception 'Message must be 3–4000 characters'; end if;
 if p_kind not in ('info','success','warning','operator') then raise exception 'Invalid notification type'; end if;
 insert into public.ascend_notifications(user_id,title,message,kind) values(p_user_id,trim(p_title),trim(p_message),p_kind) returning * into result;
 return result;
end; $$;
revoke all on function public.operator_send_notification(uuid,text,text,text) from public,anon;
grant execute on function public.operator_send_notification(uuid,text,text,text) to authenticated;
