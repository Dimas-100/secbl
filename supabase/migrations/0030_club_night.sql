-- Club night: one shared line for the tables. When a table is free and two
-- people are waiting, the first two in line are called to it; a reported
-- result frees the table and the next pair is called.
-- Design: docs/superpowers/specs/2026-10-20-club-night-design.md

-- ---------------------------------------------------------------------------
-- 1. Tables. A night belongs to the school of whoever starts it; one open
--    night per school. A row in night_tables means that table is occupied
--    (player_a joined the line first and keeps score); a free table has none.
-- ---------------------------------------------------------------------------
create table public.club_nights (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null,
  tables smallint not null check (tables between 1 and 8),
  opened_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),   -- last change of any kind; the 6-hour idle rule
  closed_at timestamptz
);
create unique index club_nights_one_open on public.club_nights (school_id) where closed_at is null;

create table public.night_line (
  night_id uuid not null references public.club_nights(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (night_id, profile_id)
);

create table public.night_tables (
  night_id uuid not null references public.club_nights(id) on delete cascade,
  table_no smallint not null check (table_no between 1 and 8),
  player_a uuid not null references public.profiles(id) on delete cascade,
  player_b uuid not null references public.profiles(id) on delete cascade,
  called_at timestamptz not null default now(),
  primary key (night_id, table_no),
  check (player_a <> player_b)
);
create index night_tables_player_a_idx on public.night_tables (player_a);
create index night_tables_player_b_idx on public.night_tables (player_b);

-- ---------------------------------------------------------------------------
-- 2. Who sees what: only the night's school. Security-definer helpers so the
--    policies never subquery each other's tables under RLS.
-- ---------------------------------------------------------------------------
create or replace function public.my_school_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select school_id from profiles where id = auth.uid();
$$;

create or replace function public.in_night_school(p_night uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from club_nights n
    where n.id = p_night and n.school_id = public.my_school_id()
  );
$$;

alter table public.club_nights enable row level security;
alter table public.night_line enable row level security;
alter table public.night_tables enable row level security;

create policy "school members read their club nights" on public.club_nights
  for select to authenticated using (public.is_approved() and school_id = public.my_school_id());
create policy "school members read the line" on public.night_line
  for select to authenticated using (public.is_approved() and public.in_night_school(night_id));
create policy "school members read the tables" on public.night_tables
  for select to authenticated using (public.is_approved() and public.in_night_school(night_id));

-- DELETE events must carry night_id for the pages' refresh listeners.
alter table public.night_line replica identity full;
alter table public.night_tables replica identity full;
alter publication supabase_realtime add table public.club_nights;
alter publication supabase_realtime add table public.night_line;
alter publication supabase_realtime add table public.night_tables;

-- ---------------------------------------------------------------------------
-- 3. Internal: load an open night of the caller's school for update, and
--    fill free tables from the line. Not callable by members.
-- ---------------------------------------------------------------------------
create or replace function public._open_night(p_night uuid)
returns public.club_nights
language plpgsql security definer set search_path = public
as $$
declare
  n club_nights%rowtype;
begin
  if not public.is_approved() then
    raise exception 'Your account is not active.';
  end if;
  select * into n from club_nights where id = p_night for update;
  if not found or n.closed_at is not null or n.touched_at < now() - interval '6 hours' then
    raise exception 'That club night is over.';
  end if;
  if n.school_id is distinct from public.my_school_id() then
    raise exception 'That club night is for another school.';
  end if;
  return n;
end;
$$;

-- Strict first-in, first-out: the two earliest in line take the lowest free
-- table, again and again while both exist. Returns who it just called.
create or replace function public._fill_tables(p_night uuid)
returns table (table_no smallint, player_a uuid, player_b uuid)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_tables smallint;
  v_free smallint;
  v_first uuid;
  v_second uuid;
begin
  select n.tables into v_tables from club_nights n where n.id = p_night;
  loop
    select s.t into v_free
    from generate_series(1, v_tables) as s(t)
    where not exists (
      select 1 from night_tables nt where nt.night_id = p_night and nt.table_no = s.t
    )
    order by s.t
    limit 1;
    exit when v_free is null;
    exit when (select count(*) from night_line l where l.night_id = p_night) < 2;
    select l.profile_id into v_first from night_line l
      where l.night_id = p_night order by l.joined_at, l.profile_id limit 1;
    select l.profile_id into v_second from night_line l
      where l.night_id = p_night and l.profile_id <> v_first order by l.joined_at, l.profile_id limit 1;
    delete from night_line l where l.night_id = p_night and l.profile_id in (v_first, v_second);
    insert into night_tables (night_id, table_no, player_a, player_b) values (p_night, v_free, v_first, v_second);
    table_no := v_free;
    player_a := v_first;
    player_b := v_second;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Member-callable functions — the only write path. Every one serialises
--    on one lock, so two joins at the same instant can never seat three at a
--    table or one person at two.
-- ---------------------------------------------------------------------------
create or replace function public.open_club_night(p_tables int)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_school uuid := public.my_school_id();
  v_old uuid;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('secbl_night'));
  if not public.is_approved() then
    raise exception 'Your account is not active.';
  end if;
  if v_school is null then
    raise exception 'Pick your school in Settings first.';
  end if;
  if p_tables is null or p_tables < 1 or p_tables > 8 then
    raise exception 'Pick between 1 and 8 tables.';
  end if;
  -- A night nobody has touched for six hours is over.
  for v_old in
    select id from club_nights
    where school_id = v_school and closed_at is null and touched_at < now() - interval '6 hours'
  loop
    delete from night_line where night_id = v_old;
    delete from night_tables where night_id = v_old;
    update club_nights set closed_at = now() where id = v_old;
  end loop;
  if exists (select 1 from club_nights where school_id = v_school and closed_at is null) then
    raise exception 'A club night is already on.';
  end if;
  insert into club_nights (school_id, opened_by, tables)
  values (v_school, auth.uid(), p_tables)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_night_tables(p_night uuid, p_tables int)
returns table (table_no smallint, player_a uuid, player_b uuid)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  n club_nights%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('secbl_night'));
  n := public._open_night(p_night);
  if not (n.opened_by is not distinct from auth.uid() or public.is_admin()) then
    raise exception 'Only whoever started the night or an admin can do that.';
  end if;
  if p_tables is null or p_tables < 1 or p_tables > 8 then
    raise exception 'Pick between 1 and 8 tables.';
  end if;
  if exists (select 1 from night_tables nt where nt.night_id = p_night and nt.table_no > p_tables) then
    raise exception 'Free that table first.';
  end if;
  update club_nights set tables = p_tables, touched_at = now() where id = p_night;
  return query select * from public._fill_tables(p_night);
end;
$$;

create or replace function public.close_club_night(p_night uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  n club_nights%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('secbl_night'));
  if not public.is_approved() then
    raise exception 'Your account is not active.';
  end if;
  -- Unlike the others, an idle night can still be ended by hand.
  select * into n from club_nights where id = p_night for update;
  if not found or n.closed_at is not null then
    raise exception 'That club night is over.';
  end if;
  if n.school_id is distinct from public.my_school_id() then
    raise exception 'That club night is for another school.';
  end if;
  if not (n.opened_by is not distinct from auth.uid() or public.is_admin()) then
    raise exception 'Only whoever started the night or an admin can do that.';
  end if;
  delete from night_line where night_id = p_night;
  delete from night_tables where night_id = p_night;
  update club_nights set closed_at = now(), touched_at = now() where id = p_night;
end;
$$;

create or replace function public.join_night_line(p_night uuid)
returns table (table_no smallint, player_a uuid, player_b uuid)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
begin
  perform pg_advisory_xact_lock(hashtext('secbl_night'));
  perform public._open_night(p_night);
  if exists (select 1 from night_line l where l.night_id = p_night and l.profile_id = auth.uid())
     or exists (
       select 1 from night_tables nt
       where nt.night_id = p_night and auth.uid() in (nt.player_a, nt.player_b)
     ) then
    raise exception 'You''re already in line or at a table.';
  end if;
  insert into night_line (night_id, profile_id) values (p_night, auth.uid());
  update club_nights set touched_at = now() where id = p_night;
  return query select * from public._fill_tables(p_night);
end;
$$;

create or replace function public.leave_night_line(p_night uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('secbl_night'));
  perform public._open_night(p_night);
  delete from night_line where night_id = p_night and profile_id = auth.uid();
  update club_nights set touched_at = now() where id = p_night;
end;
$$;

create or replace function public.free_night_table(p_night uuid, p_table_no int)
returns table (table_no smallint, player_a uuid, player_b uuid)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  n club_nights%rowtype;
  t night_tables%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('secbl_night'));
  n := public._open_night(p_night);
  select * into t from night_tables nt where nt.night_id = p_night and nt.table_no = p_table_no;
  if not found then
    raise exception 'That table is already free.';
  end if;
  if not (
    auth.uid() in (t.player_a, t.player_b)
    or n.opened_by is not distinct from auth.uid()
    or public.is_admin()
  ) then
    raise exception 'Only its players, whoever started the night or an admin can free a table.';
  end if;
  delete from night_tables nt where nt.night_id = p_night and nt.table_no = p_table_no;
  update club_nights set touched_at = now() where id = p_night;
  return query select * from public._fill_tables(p_night);
end;
$$;

-- After every report: if the reporter and their opponent hold a table in an
-- open night of the reporter's school, that table is free now. A no-op
-- otherwise.
create or replace function public.night_game_reported(p_other uuid)
returns table (table_no smallint, player_a uuid, player_b uuid)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_night uuid;
  v_table smallint;
begin
  perform pg_advisory_xact_lock(hashtext('secbl_night'));
  if not public.is_approved() then
    return;
  end if;
  select nt.night_id, nt.table_no into v_night, v_table
  from night_tables nt
  join club_nights n on n.id = nt.night_id
  where n.closed_at is null
    and n.school_id = public.my_school_id()
    and ((nt.player_a = auth.uid() and nt.player_b = p_other)
      or (nt.player_a = p_other and nt.player_b = auth.uid()))
  limit 1;
  if v_night is null then
    return;
  end if;
  delete from night_tables nt where nt.night_id = v_night and nt.table_no = v_table;
  update club_nights set touched_at = now() where id = v_night;
  return query select * from public._fill_tables(v_night);
end;
$$;

-- When the caller and p_other were called to a table tonight; null if they
-- weren't. The duplicate-game check ignores games logged before it, so a
-- pair called again the same evening is not warned about a rematch.
create or replace function public.night_table_call(p_other uuid)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select nt.called_at
  from night_tables nt
  join club_nights n on n.id = nt.night_id
  where n.closed_at is null
    and ((nt.player_a = auth.uid() and nt.player_b = p_other)
      or (nt.player_a = p_other and nt.player_b = auth.uid()))
  order by nt.called_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants. The two policy helpers must be executable by members (policies
--    run as the caller); the internals must not be.
-- ---------------------------------------------------------------------------
revoke execute on function public._open_night(uuid) from public, anon, authenticated;
revoke execute on function public._fill_tables(uuid) from public, anon, authenticated;
revoke execute on function public.my_school_id() from public, anon;
revoke execute on function public.in_night_school(uuid) from public, anon;
revoke execute on function public.open_club_night(int) from public, anon;
revoke execute on function public.set_night_tables(uuid, int) from public, anon;
revoke execute on function public.close_club_night(uuid) from public, anon;
revoke execute on function public.join_night_line(uuid) from public, anon;
revoke execute on function public.leave_night_line(uuid) from public, anon;
revoke execute on function public.free_night_table(uuid, int) from public, anon;
revoke execute on function public.night_game_reported(uuid) from public, anon;
revoke execute on function public.night_table_call(uuid) from public, anon;
grant execute on function public.my_school_id() to authenticated;
grant execute on function public.in_night_school(uuid) to authenticated;
grant execute on function public.open_club_night(int) to authenticated;
grant execute on function public.set_night_tables(uuid, int) to authenticated;
grant execute on function public.close_club_night(uuid) to authenticated;
grant execute on function public.join_night_line(uuid) to authenticated;
grant execute on function public.leave_night_line(uuid) to authenticated;
grant execute on function public.free_night_table(uuid, int) to authenticated;
grant execute on function public.night_game_reported(uuid) to authenticated;
grant execute on function public.night_table_call(uuid) to authenticated;
