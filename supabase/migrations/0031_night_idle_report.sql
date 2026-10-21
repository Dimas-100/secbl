-- An idle night is over everywhere, including after a report. Before this,
-- logging a forgotten table's game the next morning freed it and bumped
-- touched_at, so a night left open overnight came back on every member's
-- Home for another six hours and blocked a fresh start. Same rule as
-- _open_night: untouched for six hours = over.
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
    and n.touched_at >= now() - interval '6 hours'
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

create or replace function public.night_table_call(p_other uuid)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select nt.called_at
  from night_tables nt
  join club_nights n on n.id = nt.night_id
  where n.closed_at is null
    and n.touched_at >= now() - interval '6 hours'
    and ((nt.player_a = auth.uid() and nt.player_b = p_other)
      or (nt.player_a = p_other and nt.player_b = auth.uid()))
  order by nt.called_at desc
  limit 1;
$$;
