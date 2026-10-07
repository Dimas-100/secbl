-- Posts bucket: scoped reads and a cap that cannot recurse.
--
-- 1. Reads (commit security review of 0025): a member may read — and so sign
--    a URL for, or list — only their own folder, or an object that backs a
--    post they can see; admins read everything. Photos behind hidden posts
--    and uploads that never became a post are not readable by other members.
--
-- 2. The 0026 upload policy counted storage.objects with a subquery from
--    inside a policy ON storage.objects. The moment a select policy sat
--    beside it Postgres raised "infinite recursion detected in policy for
--    relation objects" and EVERY upload in the project failed, avatars
--    included (2026-10-07, about 40 minutes, found through the Postgres
--    logs). Both checks are now security-definer functions, which bypass the
--    policies and cannot recurse. Applied to the live project across several
--    steps (0027a–g); this file is the final shape.
--
-- 3. The orphan sweep: PostgREST does not expose the storage schema, so the
--    daily tick lists orphans through a function instead.

create or replace function public.post_photo_visible(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.posts p where p.image_path = p_name and p.hidden_at is null);
$$;
grant execute on function public.post_photo_visible(text) to authenticated, service_role;

create or replace function public.post_photo_count(p_profile_id uuid)
returns int
language sql stable security definer set search_path = storage, public
as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'posts' and (storage.foldername(o.name))[1] = p_profile_id::text;
$$;
grant execute on function public.post_photo_count(uuid) to authenticated, service_role;

drop policy if exists "members upload own post photos" on storage.objects;
create policy "members upload own post photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'posts'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.post_photo_count((select auth.uid())) < 60
  );

drop policy if exists "members read post photos" on storage.objects;
create policy "members read post photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'posts'
    and public.is_approved()
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or public.post_photo_visible(name)
    )
  );

-- Uploads older than a day that never became a post. Service role only.
create or replace function public.orphan_post_photos(p_older_than interval default interval '1 day')
returns setof text
language sql stable security definer set search_path = storage, public
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'posts'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.posts p where p.image_path = o.name)
  order by o.created_at
  limit 500;
$$;
revoke execute on function public.orphan_post_photos(interval) from public, anon, authenticated;
grant execute on function public.orphan_post_photos(interval) to service_role;
