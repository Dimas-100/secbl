-- Production hardening from the Supabase advisors (run 2026-10-05 after the
-- messaging migration): lock down SECURITY DEFINER functions that were never
-- meant to be an API, stop RLS re-evaluating auth.uid() per row, and index
-- the foreign keys every page joins through.

-- 1. Trigger functions are not an API. PostgREST exposes every function in
--    public, and these default to EXECUTE for everyone. Calling one directly
--    fails (they return trigger), but there is no reason to leave the door
--    ajar.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.profiles_sync_memberships() from public, anon, authenticated;
revoke execute on function public.schools_create_channel() from public, anon, authenticated;
revoke execute on function public.messages_before_insert() from public, anon, authenticated;

-- The RLS helpers run inside policies as the querying role, so `authenticated`
-- must keep EXECUTE. `anon` never passes a policy that calls them.
revoke execute on function public.is_approved() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_channel_member(uuid) from public, anon;

-- 2. auth.uid() wrapped in a scalar subquery is evaluated once per statement
--    instead of once per row (advisor 0003). Semantics are identical.
drop policy "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy "approved report own matches" on public.matches;
create policy "approved report own matches"
  on public.matches for insert to authenticated
  with check (
    public.is_approved()
    and reporter_id = (select auth.uid())
    and status = 'pending'
    and tournament_match_id is null
  );

drop policy "admins insert events" on public.events;
create policy "admins insert events"
  on public.events for insert to authenticated
  with check (public.is_admin() and created_by = (select auth.uid()));

drop policy "members insert own rsvp" on public.rsvps;
create policy "members insert own rsvp"
  on public.rsvps for insert to authenticated
  with check (
    public.is_approved()
    and profile_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'scheduled'
    )
  );

drop policy "members update own rsvp" on public.rsvps;
create policy "members update own rsvp"
  on public.rsvps for update to authenticated
  using (public.is_approved() and profile_id = (select auth.uid()))
  with check (
    public.is_approved()
    and profile_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'scheduled'
    )
  );

drop policy "members delete own rsvp" on public.rsvps;
create policy "members delete own rsvp"
  on public.rsvps for delete to authenticated
  using (public.is_approved() and profile_id = (select auth.uid()));

drop policy "members post to their channels" on public.messages;
create policy "members post to their channels"
  on public.messages for insert to authenticated
  with check (
    public.is_approved()
    and sender_id = (select auth.uid())
    and public.is_channel_member(channel_id)
  );

-- 3. Foreign keys the app joins and filters on, without covering indexes
--    (advisor 0001). Cheap now; invisible to a single club, decisive at
--    thousands of matches.
create index if not exists matches_reporter_id_idx on public.matches (reporter_id);
create index if not exists matches_winner_id_idx on public.matches (winner_id);
create index if not exists profiles_school_id_idx on public.profiles (school_id);
create index if not exists rating_history_match_id_idx on public.rating_history (match_id);
create index if not exists rsvps_profile_id_idx on public.rsvps (profile_id);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists tournaments_created_by_idx on public.tournaments (created_by);
create index if not exists tournaments_event_id_idx on public.tournaments (event_id);
create index if not exists tournament_players_profile_id_idx on public.tournament_players (profile_id);
create index if not exists tournament_matches_player1_id_idx on public.tournament_matches (player1_id);
create index if not exists tournament_matches_player2_id_idx on public.tournament_matches (player2_id);
create index if not exists tournament_matches_winner_id_idx on public.tournament_matches (winner_id);
create index if not exists tournament_matches_winner_advances_to_idx on public.tournament_matches (winner_advances_to);
create index if not exists tournament_matches_loser_advances_to_idx on public.tournament_matches (loser_advances_to);
