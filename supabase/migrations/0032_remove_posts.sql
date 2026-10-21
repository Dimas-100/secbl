-- Photo posts are retired (2026-10-20): the owner took the feature out of the
-- app. This undoes 0025–0027. Every posts table, the bucket and the feed were
-- empty of posts when it was written.
--
-- Apply only AFTER the app that no longer reads posts is live: the old Home
-- joins posts into its feed select and errors once the table is gone.
--
-- Kept: the 'post' value of activity_kind (Postgres cannot drop an enum value;
-- nothing writes it any more). The empty 'posts' bucket is removed through the
-- Storage API (Storage refuses direct deletes from its tables).

-- 1. Storage policies (they call the helper functions dropped below).
drop policy if exists "members read post photos" on storage.objects;
drop policy if exists "members upload own post photos" on storage.objects;
drop policy if exists "members delete own post photos" on storage.objects;

-- 2. The feed's link to posts.
alter publication supabase_realtime drop table public.comments;
delete from public.activity where kind = 'post';
alter table public.activity drop column post_id;

-- 3. The tables (their triggers, policies and indexes go with them).
drop table public.post_reports;
drop table public.comments;
drop table public.likes;
drop table public.post_quota;
drop table public.posts;

-- 4. The functions.
drop function public.posts_activity();
drop function public.posts_daily_cap();
drop function public.post_reports_hide();
drop function public.clear_post(uuid);
drop function public.post_photo_visible(text);
drop function public.post_photo_count();
drop function public.orphan_post_photos(interval);

-- 5. The Social push switch.
alter table public.notification_prefs drop column social;
