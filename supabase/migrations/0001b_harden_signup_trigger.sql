-- Harden the signup trigger: fail with clear, intentional errors instead of
-- raw NOT NULL / FK / cast violations when school_id metadata is missing,
-- malformed, or unknown. Signup remains fail-closed (no auth user without a
-- valid profile).
--
-- Note: profiles deliberately has NO client-facing insert policy — this
-- SECURITY DEFINER trigger (running as table owner, bypassing RLS) is the
-- only way profile rows are created. Do not "fix" that by adding an insert
-- policy: it would let clients forge school_id/rating/status at signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_school uuid;
begin
  begin
    v_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'signup rejected: school_id in metadata is not a valid uuid';
  end;
  if v_school is null then
    raise exception 'signup rejected: school_id missing from user metadata';
  end if;
  if not exists (select 1 from public.schools s where s.id = v_school) then
    raise exception 'signup rejected: unknown school_id %', v_school;
  end if;

  insert into public.profiles (id, display_name, school_id)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'Player'),
    v_school
  );
  return new;
end;
$$;
