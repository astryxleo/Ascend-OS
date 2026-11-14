do $$
declare
  fn regprocedure;
  def text;
  old_guard text := 'if auth.uid() is null or e not in (''astryxleo@gmail.com'',''yoursjace@gmail.com'') then';
  new_guard text := 'if auth.uid() is null or not public.is_operator() then';
begin
  foreach fn in array array[
    'public.operator_manage_contact_request(uuid,text,text,boolean)'::regprocedure,
    'public.operator_send_notification(uuid,text,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(fn::oid) into def;
    if position(old_guard in def)=0 then
      raise exception 'Expected email allowlist guard missing in %; aborting', fn;
    end if;
    execute replace(def,old_guard,new_guard);
  end loop;
end
$$;
