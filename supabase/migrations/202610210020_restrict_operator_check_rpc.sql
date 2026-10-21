-- Keep the operator authorization helper unavailable to anonymous callers.
-- Authenticated RPCs and RLS policies can still evaluate the helper after sign-in.
revoke execute on function public.is_operator() from public, anon;
grant execute on function public.is_operator() to authenticated;
