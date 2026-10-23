-- Allow the current Operator login while retaining the legacy Operator address.
drop policy if exists "Users read their own operator requests" on public.operator_contact_requests;
create policy "Users read their own operator requests"
on public.operator_contact_requests for select to authenticated
using (
  (select auth.uid()) = user_id
  or lower(coalesce((select auth.jwt()->>'email'),'')) in ('astryxleo@gmail.com','astryxleo@op.in')
);

create or replace function public.operator_manage_contact_request(
  p_request_id uuid, p_status text, p_remark text, p_read_confirmed boolean default false
)
returns public.operator_contact_requests
language plpgsql security definer set search_path='' as $$
declare
  e text := lower(coalesce(auth.jwt()->>'email',''));
  result public.operator_contact_requests;
begin
  if auth.uid() is null or e not in ('astryxleo@gmail.com','astryxleo@op.in') then
    raise exception 'Operator access required';
  end if;
  if not p_read_confirmed then raise exception 'Read the complete request before updating its status'; end if;
  if p_status not in ('accepted','in_progress','rejected','resolved') then raise exception 'Invalid request status'; end if;
  update public.operator_contact_requests r
  set status=p_status,
      operator_remark=left(coalesce(p_remark,''),4000),
      read_confirmed_at=coalesce(r.read_confirmed_at,now()),
      updated_at=now(),
      handled_by=e
  where r.id=p_request_id
  returning * into result;
  if result.id is null then raise exception 'Request not found'; end if;
  insert into public.ascend_notifications(user_id,title,message,kind,related_request_id)
  values(
    result.user_id,
    case p_status
      when 'accepted' then 'Operator accepted your request'
      when 'in_progress' then 'Your request is in progress'
      when 'rejected' then 'Operator updated your request'
      when 'resolved' then 'Your request is resolved'
    end,
    'Request: '||result.subject||E'\nStatus: '||replace(p_status,'_',' ')||
      case when coalesce(trim(p_remark),'')<>'' then E'\nOperator note: '||left(trim(p_remark),4000) else '' end,
    'operator',result.id
  );
  return result;
end; $$;
revoke all on function public.operator_manage_contact_request(uuid,text,text,boolean) from public,anon;
grant execute on function public.operator_manage_contact_request(uuid,text,text,boolean) to authenticated;

create or replace function public.operator_send_notification(
  p_user_id uuid, p_title text, p_message text, p_kind text default 'operator'
)
returns public.ascend_notifications
language plpgsql security definer set search_path='' as $$
declare
  e text := lower(coalesce(auth.jwt()->>'email',''));
  result public.ascend_notifications;
begin
  if auth.uid() is null or e not in ('astryxleo@gmail.com','astryxleo@op.in') then
    raise exception 'Operator access required';
  end if;
  if p_user_id is null then raise exception 'Choose a recipient'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 3 and 120 then raise exception 'Title must be 3–120 characters'; end if;
  if char_length(trim(coalesce(p_message,''))) not between 3 and 4000 then raise exception 'Message must be 3–4000 characters'; end if;
  if p_kind not in ('info','success','warning','operator') then raise exception 'Invalid notification type'; end if;
  insert into public.ascend_notifications(user_id,title,message,kind)
  values(p_user_id,trim(p_title),trim(p_message),p_kind)
  returning * into result;
  return result;
end; $$;
revoke all on function public.operator_send_notification(uuid,text,text,text) from public,anon;
grant execute on function public.operator_send_notification(uuid,text,text,text) to authenticated;
