-- Characters (docs/superpowers/specs/2026-10-29-characters-design.md): each
-- member's built look. Null means the starter, which the app works out from
-- the member's id and ball, so nothing is stored until a member saves.
--
-- Written only by the app server (service role), after it has checked the
-- look against what the member has earned (lib/character.ts sanitizeLook).
-- Members have no update policy on profiles (only admins do), so nobody can
-- write it directly. Read like the rest of a profile.
alter table public.profiles
  add column if not exists look jsonb
  constraint profiles_look_shape check (look is null or (jsonb_typeof(look) = 'object' and pg_column_size(look) < 4096));
