-- Lets a member fix a typo in their own display name — and lets an admin fix
-- anyone's — without opening up the rest of the profiles row.
--
-- Why a function rather than an RLS policy: RLS is row-level, so a policy
-- permitting "update your own profile" would also permit updating your own
-- rating, role and status. That is a self-approval and privilege-escalation
-- hole. Postgres column grants could narrow it, but revoking UPDATE on the
-- other columns would simultaneously break the admin approval queue, which
-- writes status through the same user-scoped client.
--
-- So the write is expressed exactly once, here, with the authorization rule
-- inside it. profiles keeps its admin-only UPDATE policy untouched.
create or replace function public.update_display_name(
  p_profile_id uuid,
  p_display_name text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := trim(p_display_name);
begin
  if v_name = '' or v_name is null then
    raise exception 'display name cannot be blank';
  end if;
  if length(v_name) > 40 then
    raise exception 'display name must be 40 characters or fewer';
  end if;

  -- Rename yourself, or anyone if you are an admin. auth.uid() is null for
  -- anon and for the service role, so both fall through to the admin check
  -- and are refused.
  if p_profile_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not allowed to rename that member';
  end if;

  update profiles set display_name = v_name where id = p_profile_id;
  if not found then
    raise exception 'profile not found';
  end if;
end;
$$;

revoke execute on function public.update_display_name(uuid, text) from public, anon;
grant execute on function public.update_display_name(uuid, text) to authenticated;
