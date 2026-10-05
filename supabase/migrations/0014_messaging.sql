-- Phase 5: messaging. One machinery, three channel types (parent spec §9):
--   everyone — every approved member, membership automatic
--   school   — one room per school, membership follows profiles.school_id
--   dm       — exactly two participants, created on first message
-- Design: docs/superpowers/specs/2026-10-05-messaging-design.md

create type public.channel_type as enum ('everyone', 'school', 'dm');

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  type public.channel_type not null,
  name text not null check (length(trim(name)) > 0),
  school_id uuid references public.schools(id) on delete cascade,
  -- least(a,b) || ':' || greatest(a,b) of the two participant ids. The
  -- partial unique index below is the parent spec's duplicate-DM guard.
  dm_key text,
  created_at timestamptz not null default now(),
  check ((type = 'school') = (school_id is not null)),
  check ((type = 'dm') = (dm_key is not null))
);

create unique index channels_one_everyone_idx
  on public.channels ((true)) where type = 'everyone';
create unique index channels_school_idx
  on public.channels (school_id) where type = 'school';
create unique index channels_dm_key_idx
  on public.channels (dm_key) where type = 'dm';

-- Cascades on both FKs: membership and read-state are disposable, like RSVPs.
create table public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Defaults to join time so a new member is not greeted by every message
  -- ever posted to Everyone showing as unread.
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

create index channel_members_profile_idx on public.channel_members (profile_id);

-- Identity, not uuid: messages are ordered and paged by id, and a bigint
-- keyset ("older than id X") is the cheapest possible pagination.
create table public.messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  -- Echoed back by the insert so the sender can match the real row to its
  -- optimistic bubble even when Realtime delivers it first. Never trusted
  -- for anything else.
  client_id text,
  created_at timestamptz not null default now()
);

create index messages_channel_id_idx on public.messages (channel_id, id desc);
-- Unread counts compare created_at against last_read_at per channel.
create index messages_channel_created_idx on public.messages (channel_id, created_at);
-- The rate limiter looks at one sender's last few seconds.
create index messages_sender_created_idx on public.messages (sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER on purpose: a policy on channel_members that selected from
-- channel_members would recurse. This is the one membership check every
-- messaging policy uses.
create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from channel_members
    where channel_id = p_channel_id and profile_id = auth.uid()
  );
$$;

-- Puts an approved profile in Everyone and its school room (and out of any
-- other school room, for a school change); takes a non-approved profile out
-- of both group rooms. DMs are never touched — suspension already hides them
-- via is_approved() in the policies, and reinstating should restore them.
create or replace function public.sync_group_memberships(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status member_status;
  v_school uuid;
begin
  select status, school_id into v_status, v_school
  from profiles where id = p_profile_id;
  if not found then
    return;
  end if;

  if v_status = 'approved' then
    insert into channel_members (channel_id, profile_id)
    select c.id, p_profile_id
    from channels c
    where c.type = 'everyone' or (c.type = 'school' and c.school_id = v_school)
    on conflict do nothing;

    delete from channel_members cm
    using channels c
    where cm.channel_id = c.id
      and cm.profile_id = p_profile_id
      and c.type = 'school'
      and c.school_id <> v_school;
  else
    delete from channel_members cm
    using channels c
    where cm.channel_id = c.id
      and cm.profile_id = p_profile_id
      and c.type in ('everyone', 'school');
  end if;
end;
$$;

create or replace function public.profiles_sync_memberships()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_group_memberships(new.id);
  return new;
end;
$$;

create trigger profiles_sync_memberships
after insert or update of status, school_id on public.profiles
for each row execute function public.profiles_sync_memberships();

-- Every school gets a room the moment it exists, named by its short code.
create or replace function public.schools_create_channel()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into channels (type, name, school_id)
    values ('school', new.short_name, new.id)
    on conflict do nothing;
  elsif new.short_name <> old.short_name then
    update channels set name = new.short_name
    where type = 'school' and school_id = new.id;
  end if;
  return new;
end;
$$;

create trigger schools_create_channel
after insert or update of short_name on public.schools
for each row execute function public.schools_create_channel();

-- Spam guard plus clock authority: clients cannot backdate a message, and one
-- sender gets at most 8 messages per rolling 10 seconds.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (
    select count(*) from messages
    where sender_id = new.sender_id
      and created_at > now() - interval '10 seconds'
  ) >= 8 then
    raise exception 'slow down — you are sending messages too quickly';
  end if;
  new.created_at := now();
  new.body := trim(new.body);
  return new;
end;
$$;

create trigger messages_before_insert
before insert on public.messages
for each row execute function public.messages_before_insert();

-- ---------------------------------------------------------------------------
-- Member-callable functions
-- ---------------------------------------------------------------------------

-- The DM between the caller and another approved member, created on demand.
-- Both memberships are inserted here, so the other party sees the room (and
-- the unread badge) the instant the first message lands.
create or replace function public.get_or_create_dm(p_other_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null or not public.is_approved() then
    raise exception 'only approved members can message';
  end if;
  if p_other_id is null or p_other_id = v_me then
    raise exception 'pick someone else to message';
  end if;
  if not exists (select 1 from profiles where id = p_other_id and status = 'approved') then
    raise exception 'that member is not available';
  end if;

  v_key := least(v_me::text, p_other_id::text) || ':' || greatest(v_me::text, p_other_id::text);

  select id into v_id from channels where type = 'dm' and dm_key = v_key;
  if v_id is null then
    insert into channels (type, name, dm_key)
    values ('dm', 'Direct message', v_key)
    on conflict (dm_key) where type = 'dm' do nothing
    returning id into v_id;
    -- Lost a race with the other participant creating the same DM.
    if v_id is null then
      select id into v_id from channels where type = 'dm' and dm_key = v_key;
    end if;
  end if;

  insert into channel_members (channel_id, profile_id)
  values (v_id, v_me), (v_id, p_other_id)
  on conflict do nothing;

  return v_id;
end;
$$;

create or replace function public.mark_channel_read(p_channel_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and profile_id = auth.uid();
$$;

-- The caller's inbox in one round trip. Ordering is left to the client
-- (group rooms pinned, DMs by activity) so the rule lives in tested code.
create or replace function public.list_my_channels()
returns table (
  id uuid,
  type public.channel_type,
  name text,
  school_id uuid,
  other_id uuid,
  other_name text,
  member_count bigint,
  unread bigint,
  last_message_id bigint,
  last_body text,
  last_sender_id uuid,
  last_sender_name text,
  last_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    c.id,
    c.type,
    c.name,
    c.school_id,
    o.id,
    o.display_name,
    (select count(*) from channel_members x where x.channel_id = c.id),
    (
      select count(*) from messages m
      where m.channel_id = c.id
        and m.created_at > cm.last_read_at
        and m.sender_id <> cm.profile_id
    ),
    lm.id,
    lm.body,
    lm.sender_id,
    sp.display_name,
    lm.created_at
  from channel_members cm
  join channels c on c.id = cm.channel_id
  left join lateral (
    select p.id, p.display_name
    from channel_members om
    join profiles p on p.id = om.profile_id
    where c.type = 'dm' and om.channel_id = c.id and om.profile_id <> cm.profile_id
    limit 1
  ) o on true
  left join lateral (
    select m.id, m.body, m.sender_id, m.created_at
    from messages m
    where m.channel_id = c.id
    order by m.id desc
    limit 1
  ) lm on true
  left join profiles sp on sp.id = lm.sender_id
  where cm.profile_id = auth.uid()
    and public.is_approved();
$$;

-- Header badge.
create or replace function public.unread_total()
returns bigint
language sql stable security definer set search_path = public
as $$
  select count(*)
  from messages m
  join channel_members cm
    on cm.channel_id = m.channel_id and cm.profile_id = auth.uid()
  where public.is_approved()
    and m.created_at > cm.last_read_at
    and m.sender_id <> cm.profile_id;
$$;

revoke execute on function public.get_or_create_dm(uuid) from public, anon;
revoke execute on function public.mark_channel_read(uuid) from public, anon;
revoke execute on function public.list_my_channels() from public, anon;
revoke execute on function public.unread_total() from public, anon;
revoke execute on function public.sync_group_memberships(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.mark_channel_read(uuid) to authenticated;
grant execute on function public.list_my_channels() to authenticated;
grant execute on function public.unread_total() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;

-- Membership is the whole story: no admin carve-out anywhere, so a DM is
-- visible to exactly its two participants (parent spec §9).
create policy "members read their channels"
  on public.channels for select to authenticated
  using (public.is_approved() and public.is_channel_member(id));

create policy "members read co-members"
  on public.channel_members for select to authenticated
  using (public.is_approved() and public.is_channel_member(channel_id));

create policy "members read channel messages"
  on public.messages for select to authenticated
  using (public.is_approved() and public.is_channel_member(channel_id));

create policy "members post to their channels"
  on public.messages for insert to authenticated
  with check (
    public.is_approved()
    and sender_id = auth.uid()
    and public.is_channel_member(channel_id)
  );

-- No UPDATE/DELETE policies: v1 has no edits or deletes. Membership rows are
-- only ever written by the SECURITY DEFINER functions above.

-- Realtime: clients subscribe to INSERTs on messages filtered by channel.
-- Realtime evaluates each subscriber's RLS, so the policies above also decide
-- who may listen.
alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------------
-- Seed and backfill
-- ---------------------------------------------------------------------------

insert into public.channels (type, name) values ('everyone', 'Everyone');

insert into public.channels (type, name, school_id)
select 'school', s.short_name, s.id from public.schools s
on conflict do nothing;

select public.sync_group_memberships(p.id)
from public.profiles p
where p.status = 'approved';
