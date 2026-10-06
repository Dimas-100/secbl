-- Open membership: the invitation link is the gate, so the app no longer
-- adds a second one. New accounts are approved the moment they are created
-- (the signup trigger joins them to Everyone and their school room through
-- profiles_sync_memberships), and anyone still waiting is let in. Suspend and
-- reinstate are unchanged, and is_approved() keeps guarding every policy.

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

  insert into public.profiles (id, display_name, school_id, status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'Player'),
    v_school,
    'approved'
  );
  return new;
end;
$$;

update public.profiles set status = 'approved' where status = 'pending';
