-- Posts: caps that cannot be gamed (found by the commit security review of 0025).
--
-- 1. The daily cap counted rows in posts, so deleting and re-posting reset it.
--    A quota row per member per club day now only ever goes up.
-- 2. Nothing capped raw uploads: a member could fill the bucket without
--    posting. The upload policy now refuses once a member's folder holds 60
--    objects (orphans included, so an upload-without-post loop runs out too);
--    the daily tick sweeps orphans older than a day.

create table public.post_quota (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (profile_id, day)
);
-- No policies on purpose: only the trigger (security definer) touches it.
alter table public.post_quota enable row level security;

create or replace function public.posts_daily_cap()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/New_York')::date;
  v_count int;
begin
  insert into post_quota (profile_id, day, count)
  values (new.author_id, v_day, 1)
  on conflict (profile_id, day) do update set count = post_quota.count + 1
  returning count into v_count;
  if v_count > 5 then
    raise exception 'five posts a day is the limit';
  end if;
  return new;
end;
$$;

drop policy if exists "members upload own post photos" on storage.objects;
create policy "members upload own post photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'posts'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      select count(*)
      from storage.objects o
      where o.bucket_id = 'posts'
        and (storage.foldername(o.name))[1] = (select auth.uid())::text
    ) < 60
  );
