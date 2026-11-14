do $$
declare
  v_definition text;
  v_old text := 'if actor is null then raise exception ''authentication required''; end if;';
  v_new text := 'if actor is null then raise exception ''authentication required''; end if;
  if actor <> p_user_id and not public.is_operator() then
    raise exception ''You can only view your own study analytics'';
  end if;';
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_study_analytics'
    and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid';

  if v_definition is null then
    raise exception 'get_study_analytics(uuid) not found';
  end if;

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected authorization anchor not found; aborting safely';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$$;
