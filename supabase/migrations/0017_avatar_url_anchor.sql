-- Security fix (automated review of 0016): the avatar URL allowlist used an
-- unanchored LIKE, so https://evil.example/x/storage/v1/object/public/avatars/<uid>/y
-- would have passed and loaded an attacker-hosted image on every page.
-- Now the URL must start with this project's exact Storage origin and the
-- caller's folder, name a plain image file, and refer to an object that
-- really exists in the bucket.
create or replace function public.set_avatar_url(p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_prefix text := 'https://azetukujqrqyxfzohfmd.supabase.co/storage/v1/object/public/avatars/'
                   || auth.uid()::text || '/';
  v_name text;
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'only approved members can change their photo';
  end if;
  if p_url is not null then
    if left(p_url, length(v_prefix)) <> v_prefix then
      raise exception 'photo must be uploaded to your own avatars folder';
    end if;
    v_name := substr(p_url, length(v_prefix) + 1);
    if v_name !~ '^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$' then
      raise exception 'photo file name is not valid';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'avatars' and name = auth.uid()::text || '/' || v_name
    ) then
      raise exception 'that photo has not been uploaded';
    end if;
  end if;
  update profiles set avatar_url = p_url where id = auth.uid();
end;
$$;

-- A public bucket already serves each file by URL. The SELECT policy added in
-- 0016 additionally let anyone *list* the bucket through the Storage API and
-- enumerate every member's folder — drop it. Replace/delete also require an
-- approved account, matching upload.
drop policy if exists "avatars are public" on storage.objects;

drop policy if exists "members replace own avatar" on storage.objects;
create policy "members replace own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members delete own avatar" on storage.objects;
create policy "members delete own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
