-- Posts, iteration 1 (docs/superpowers/specs/2026-10-07-posts-design.md §9):
-- a photo with a caption in the Home feed, likes, comments, reports.

alter type public.activity_kind add value if not exists 'post';

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text check (caption is null or char_length(caption) <= 280),
  -- Object path inside the private 'posts' bucket: <author_id>/<uuid>.jpg
  image_path text not null,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);

-- A post's feed row points at it; deleting the post takes the row with it.
alter table public.activity add column post_id uuid references public.posts(id) on delete cascade;
create unique index activity_one_post_row on public.activity (post_id) where post_id is not null;

create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

create table public.post_reports (
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

-- Likes and comments on your post, off until you turn it on.
alter table public.notification_prefs add column social boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Storage: a private bucket; members write only into their own folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read post photos" on storage.objects;
create policy "members read post photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'posts' and public.is_approved());

drop policy if exists "members upload own post photos" on storage.objects;
create policy "members upload own post photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'posts'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members delete own post photos" on storage.objects;
create policy "members delete own post photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'posts'
    and public.is_approved()
    and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text)
  );

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.post_reports enable row level security;

create policy "members read visible posts"
  on public.posts for select to authenticated
  using (
    public.is_approved()
    and (hidden_at is null or author_id = (select auth.uid()) or public.is_admin())
  );
create policy "members create own posts"
  on public.posts for insert to authenticated
  with check (
    public.is_approved()
    and author_id = (select auth.uid())
    and image_path like (select auth.uid())::text || '/%'
  );
create policy "authors and admins delete posts"
  on public.posts for delete to authenticated
  using (public.is_approved() and (author_id = (select auth.uid()) or public.is_admin()));

create policy "members read likes"
  on public.likes for select to authenticated
  using (public.is_approved());
create policy "members like as themselves"
  on public.likes for insert to authenticated
  with check (
    public.is_approved()
    and profile_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );
create policy "members unlike as themselves"
  on public.likes for delete to authenticated
  using (public.is_approved() and profile_id = (select auth.uid()));

create policy "members read comments on visible posts"
  on public.comments for select to authenticated
  using (public.is_approved() and exists (select 1 from public.posts p where p.id = post_id));
create policy "members comment as themselves"
  on public.comments for insert to authenticated
  with check (
    public.is_approved()
    and author_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );
create policy "comment author, post author or admin deletes a comment"
  on public.comments for delete to authenticated
  using (
    public.is_approved()
    and (
      author_id = (select auth.uid())
      or public.is_admin()
      or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
    )
  );

create policy "members report as themselves"
  on public.post_reports for insert to authenticated
  with check (public.is_approved() and reporter_id = (select auth.uid()));
create policy "admins read reports"
  on public.post_reports for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Triggers and functions
-- ---------------------------------------------------------------------------
-- A post is one feed row; hiding removes it, clearing brings it back.
create or replace function public.posts_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into activity (kind, actor_id, post_id, created_at)
    values ('post', new.author_id, new.id, new.created_at);
  elsif new.hidden_at is not null and old.hidden_at is null then
    delete from activity where post_id = new.id;
  elsif new.hidden_at is null and old.hidden_at is not null then
    insert into activity (kind, actor_id, post_id, created_at)
    values ('post', new.author_id, new.id, new.created_at)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger posts_activity
  after insert or update of hidden_at on public.posts
  for each row execute function public.posts_activity();

-- Five posts a club day.
create or replace function public.posts_daily_cap()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from posts
  where author_id = new.author_id
    and (created_at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date;
  if v_count >= 5 then
    raise exception 'five posts a day is the limit';
  end if;
  return new;
end;
$$;
create trigger posts_daily_cap
  before insert on public.posts
  for each row execute function public.posts_daily_cap();

-- Three reports hide a post until an admin clears or deletes it.
create or replace function public.post_reports_hide()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from post_reports where post_id = new.post_id) >= 3 then
    update posts set hidden_at = now() where id = new.post_id and hidden_at is null;
  end if;
  return new;
end;
$$;
create trigger post_reports_hide
  after insert on public.post_reports
  for each row execute function public.post_reports_hide();

-- Admin only: unhide and forget the reports.
create or replace function public.clear_post(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can clear a post';
  end if;
  delete from post_reports where post_id = p_post_id;
  update posts set hidden_at = null where id = p_post_id;
end;
$$;
revoke execute on function public.clear_post(uuid) from public, anon;
grant execute on function public.clear_post(uuid) to authenticated;

-- Home refreshes when a comment lands.
alter publication supabase_realtime add table public.comments;
