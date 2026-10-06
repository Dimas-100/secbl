-- Personalization: profile photos (Supabase Storage), a "your ball" identity
-- colour, a tagline and a favourite game, and real school colours.

alter table public.profiles
  add column if not exists ball smallint check (ball between 1 and 15),
  add column if not exists tagline text check (length(tagline) <= 60),
  add column if not exists favorite_game public.game_type;

-- Self-service preferences. A function, not an UPDATE policy, for the same
-- reason as update_display_name: a row-level policy would also expose
-- rating, role and status.
create or replace function public.update_profile_prefs(
  p_ball smallint,
  p_tagline text,
  p_favorite_game public.game_type
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tagline text := nullif(trim(coalesce(p_tagline, '')), '');
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'only approved members can edit their profile';
  end if;
  if p_ball is not null and (p_ball < 1 or p_ball > 15) then
    raise exception 'pick a ball from 1 to 15';
  end if;
  if length(v_tagline) > 60 then
    raise exception 'keep the tagline to 60 characters';
  end if;
  update profiles
  set ball = p_ball, tagline = v_tagline, favorite_game = p_favorite_game
  where id = auth.uid();
end;
$$;

-- The photo URL may only point into the caller's own folder of the avatars
-- bucket; null clears it.
create or replace function public.set_avatar_url(p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'only approved members can change their photo';
  end if;
  if p_url is not null
     and p_url not like '%/storage/v1/object/public/avatars/' || auth.uid()::text || '/%' then
    raise exception 'photo must be uploaded to your own avatars folder';
  end if;
  update profiles set avatar_url = p_url where id = auth.uid();
end;
$$;

revoke execute on function public.update_profile_prefs(smallint, text, public.game_type) from public, anon;
revoke execute on function public.set_avatar_url(text) from public, anon;
grant execute on function public.update_profile_prefs(smallint, text, public.game_type) to authenticated;
grant execute on function public.set_avatar_url(text) to authenticated;

-- Storage: one public bucket, members write only inside <their id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

drop policy if exists "members upload own avatar" on storage.objects;
create policy "members upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members replace own avatar" on storage.objects;
create policy "members replace own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "members delete own avatar" on storage.objects;
create policy "members delete own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The leaderboard carries the identity fields so rows render photos and
-- ball colours without a second query. create or replace may only append
-- columns, which is all this does.
create or replace view public.leaderboard with (security_invoker = on) as
select
  p.id,
  p.display_name,
  p.school_id,
  s.short_name as school_short_name,
  p.rating,
  p.matches_played,
  count(m.id) filter (where m.winner_id = p.id) as wins,
  count(m.id) filter (where m.winner_id <> p.id) as losses,
  p.avatar_url,
  p.ball,
  s.primary_color as school_color
from public.profiles p
join public.schools s on s.id = p.school_id
left join public.matches m
  on m.status = 'confirmed'
  and (m.reporter_id = p.id or m.opponent_id = p.id)
where p.status = 'approved'
group by p.id, s.short_name, s.primary_color
order by p.rating desc, wins desc;

-- The inbox needs the other party's photo and ball for DM rows. Changing a
-- function's return type requires dropping it first.
drop function if exists public.list_my_channels();
create function public.list_my_channels()
returns table (
  id uuid,
  type public.channel_type,
  name text,
  school_id uuid,
  other_id uuid,
  other_name text,
  other_avatar_url text,
  other_ball smallint,
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
    o.avatar_url,
    o.ball,
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
    select p.id, p.display_name, p.avatar_url, p.ball
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
revoke execute on function public.list_my_channels() from public, anon;
grant execute on function public.list_my_channels() to authenticated;

-- Real school colours (official primaries), replacing the grey placeholders.
update public.schools set primary_color = '#ba0c2f', secondary_color = '#000000' where short_name = 'UGA';
update public.schools set primary_color = '#0039a6', secondary_color = '#c60c30' where short_name = 'GSU';
update public.schools set primary_color = '#782f40', secondary_color = '#ceb888' where short_name = 'FSU';
update public.schools set primary_color = '#fdbb30', secondary_color = '#000000' where short_name = 'KSU';
update public.schools set primary_color = '#b3a369', secondary_color = '#003057' where short_name = 'GT';
