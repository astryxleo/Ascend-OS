-- This helper is used internally by SECURITY DEFINER Conquest RPCs.
-- Clients receive the shield state as part of the map-region response and do not
-- need direct access to probe arbitrary user IDs.
revoke all on function public.conquest_has_starter_shield(uuid)
from public, anon, authenticated;
