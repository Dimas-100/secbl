-- A game counted on the spot can only be taken back by an approved opponent
-- (undo_agreed_match requires it), so it must never count against a member
-- who isn't one: a crafted report against a suspended or pending member would
-- otherwise move their rating with no way for them to flag it. reportMatch
-- catches the refusal and leaves the report pending, as if it had been sent.
create or replace function public.apply_agreed_confirmation(
  p_match_id uuid,
  p_reporter_delta int,
  p_opponent_delta int
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if (
    select count(*) from profiles p
    join matches m on p.id in (m.reporter_id, m.opponent_id)
    where m.id = p_match_id and p.status = 'approved'
  ) <> 2 then
    raise exception 'both players must be approved members to count a game on the spot';
  end if;
  perform public.apply_match_confirmation(p_match_id, p_reporter_delta, p_opponent_delta);
  update matches set agreed_at = now() where id = p_match_id;
end;
$$;
