-- Isolate operator wallet and broadcast RPCs from caller-controlled schema resolution.
create or replace function public.operator_adjust_wallet(p_target_user uuid, p_currency text, p_amount bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_wallet public.wallets%rowtype;
 v_balance bigint;
begin
 if not public.is_operator() then raise exception 'Operator access required'; end if;
 if p_target_user is null then raise exception 'Choose a target user'; end if;
 if p_currency not in ('coins','cash') then raise exception 'Unsupported currency'; end if;
 if p_amount is null or p_amount=0 or abs(p_amount)>100000000 then
   raise exception 'Amount must be non-zero and within the permitted limit';
 end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(trim(p_reason))>240 then
   raise exception 'Provide a reason between 3 and 240 characters';
 end if;
 if not exists(select 1 from public.profiles where id=p_target_user) then raise exception 'User not found'; end if;
 insert into public.wallets(user_id) values(p_target_user) on conflict(user_id) do nothing;
 select * into v_wallet from public.wallets where user_id=p_target_user for update;
 v_balance:=case when p_currency='coins' then v_wallet.coins else v_wallet.cash end;
 if v_balance+p_amount<0 then raise exception 'Adjustment would make the wallet balance negative'; end if;
 if p_currency='coins' then
   update public.wallets set coins=coins+p_amount,updated_at=now() where user_id=p_target_user returning * into v_wallet;
 else
   update public.wallets set cash=cash+p_amount,updated_at=now() where user_id=p_target_user returning * into v_wallet;
 end if;
 insert into public.wallet_transactions(user_id,currency,amount,reason,source,created_by)
 values(p_target_user,p_currency,p_amount,trim(p_reason),'operator_adjustment',auth.uid());
 return jsonb_build_object('success',true,'user_id',p_target_user,'coins',v_wallet.coins,'cash',v_wallet.cash);
end;
$$;
revoke all on function public.operator_adjust_wallet(uuid,text,bigint,text) from public, anon;
grant execute on function public.operator_adjust_wallet(uuid,text,bigint,text) to authenticated;

create or replace function public.operator_save_broadcast(
 p_id uuid, p_title text, p_message text, p_kind text, p_is_published boolean,
 p_ends_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
 if not public.is_operator() then raise exception 'Operator access required'; end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 120 then
   raise exception 'Title must be 3-120 characters';
 end if;
 if length(trim(coalesce(p_message,''))) not between 3 and 3000 then
   raise exception 'Message must be 3-3000 characters';
 end if;
 if p_kind is null or p_kind not in ('info','exam','urgent','maintenance') then
   raise exception 'Invalid broadcast category';
 end if;
 if p_ends_at is not null and p_ends_at<=now() then raise exception 'Expiry must be in the future'; end if;
 if p_id is null then
   insert into public.broadcasts(title,message,kind,is_published,ends_at,created_by)
   values(trim(p_title),trim(p_message),p_kind,coalesce(p_is_published,false),p_ends_at,auth.uid())
   returning id into v_id;
 else
   update public.broadcasts set title=trim(p_title),message=trim(p_message),kind=p_kind,
     is_published=coalesce(p_is_published,false),ends_at=p_ends_at
   where id=p_id returning id into v_id;
   if v_id is null then raise exception 'Broadcast not found'; end if;
 end if;
 return jsonb_build_object('success',true,'id',v_id);
end;
$$;
revoke all on function public.operator_save_broadcast(uuid,text,text,text,boolean,timestamptz) from public, anon;
grant execute on function public.operator_save_broadcast(uuid,text,text,text,boolean,timestamptz) to authenticated;
