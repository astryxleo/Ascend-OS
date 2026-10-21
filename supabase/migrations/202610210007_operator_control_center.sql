-- Operator control-center RPCs: role checks happen in PostgreSQL, never in the client.
create or replace function public.operator_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_operator() then raise exception 'Operator access required'; end if;
 return jsonb_build_object(
  'users',(select count(*) from public.profiles where role='student'),
  'operators',(select count(*) from public.profiles where role='operator'),
  'focus_sessions',(select count(*) from public.focus_sessions),
  'focus_minutes',(select coalesce(sum(duration_minutes),0) from public.focus_sessions),
  'exams',(select count(*) from public.exams),
  'vehicles',(select count(*) from public.vehicles),
  'broadcasts',(select count(*) from public.broadcasts),
  'published_broadcasts',(select count(*) from public.broadcasts where is_published and starts_at<=now() and (ends_at is null or ends_at>now()))
 );
end $$;

create or replace function public.operator_search_users(p_query text default '')
returns table(user_id uuid,username text,full_name text,email text,role text,class_grade text,created_at timestamptz,coins bigint,cash bigint,focus_minutes bigint,completed_steps bigint)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_operator() then raise exception 'Operator access required'; end if;
 return query
 select p.id,p.username,p.full_name,p.email,p.role,p.class_grade,p.created_at,
  coalesce(w.coins,0),coalesce(w.cash,0),
  coalesce((select sum(fs.duration_minutes)::bigint from public.focus_sessions fs where fs.user_id=p.id),0),
  coalesce((select count(*)::bigint from public.chapter_progress cp where cp.user_id=p.id and cp.completed),0)
 from public.profiles p left join public.wallets w on w.user_id=p.id
 where coalesce(p_query,'')='' or p.username ilike '%'||p_query||'%' or p.full_name ilike '%'||p_query||'%' or p.email ilike '%'||p_query||'%'
 order by p.created_at desc limit 50;
end $$;

drop function if exists public.operator_adjust_wallet(uuid,text,bigint,text);
create function public.operator_adjust_wallet(p_target_user uuid,p_currency text,p_amount bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_wallet public.wallets%rowtype; v_balance bigint;
begin
 if not public.is_operator() then raise exception 'Operator access required'; end if;
 if p_target_user is null then raise exception 'Choose a target user'; end if;
 if p_currency not in ('coins','cash') then raise exception 'Unsupported currency'; end if;
 if p_amount is null or p_amount=0 or abs(p_amount)>100000000 then raise exception 'Amount must be non-zero and within the permitted limit'; end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(trim(p_reason))>240 then raise exception 'Provide a reason between 3 and 240 characters'; end if;
 if not exists(select 1 from public.profiles where id=p_target_user) then raise exception 'User not found'; end if;
 insert into public.wallets(user_id) values(p_target_user) on conflict(user_id) do nothing;
 select * into v_wallet from public.wallets where user_id=p_target_user for update;
 v_balance:=case when p_currency='coins' then v_wallet.coins else v_wallet.cash end;
 if v_balance+p_amount<0 then raise exception 'Adjustment would make the wallet balance negative'; end if;
 if p_currency='coins' then update public.wallets set coins=coins+p_amount,updated_at=now() where user_id=p_target_user returning * into v_wallet;
 else update public.wallets set cash=cash+p_amount,updated_at=now() where user_id=p_target_user returning * into v_wallet; end if;
 insert into public.wallet_transactions(user_id,currency,amount,reason,source,created_by)
 values(p_target_user,p_currency,p_amount,trim(p_reason),'operator_adjustment',auth.uid());
 return jsonb_build_object('success',true,'user_id',p_target_user,'coins',v_wallet.coins,'cash',v_wallet.cash);
end $$;

create or replace function public.operator_save_broadcast(p_id uuid,p_title text,p_message text,p_kind text,p_is_published boolean,p_ends_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.is_operator() then raise exception 'Operator access required'; end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 120 then raise exception 'Title must be 3-120 characters'; end if;
 if length(trim(coalesce(p_message,''))) not between 3 and 3000 then raise exception 'Message must be 3-3000 characters'; end if;
 if p_kind not in ('info','exam','urgent','maintenance') then raise exception 'Invalid broadcast category'; end if;
 if p_ends_at is not null and p_ends_at<=now() then raise exception 'Expiry must be in the future'; end if;
 if p_id is null then
  insert into public.broadcasts(title,message,kind,is_published,ends_at,created_by)
  values(trim(p_title),trim(p_message),p_kind,coalesce(p_is_published,false),p_ends_at,auth.uid()) returning id into v_id;
 else
  update public.broadcasts set title=trim(p_title),message=trim(p_message),kind=p_kind,is_published=coalesce(p_is_published,false),ends_at=p_ends_at
  where id=p_id returning id into v_id;
  if v_id is null then raise exception 'Broadcast not found'; end if;
 end if;
 return jsonb_build_object('success',true,'id',v_id);
end $$;

revoke all on function public.operator_dashboard_stats() from public,anon;
revoke all on function public.operator_search_users(text) from public,anon;
revoke all on function public.operator_adjust_wallet(uuid,text,bigint,text) from public,anon;
revoke all on function public.operator_save_broadcast(uuid,text,text,text,boolean,timestamptz) from public,anon;
grant execute on function public.operator_dashboard_stats() to authenticated;
grant execute on function public.operator_search_users(text) to authenticated;
grant execute on function public.operator_adjust_wallet(uuid,text,bigint,text) to authenticated;
grant execute on function public.operator_save_broadcast(uuid,text,text,text,boolean,timestamptz) to authenticated;
