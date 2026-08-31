-- security_invoker: the underlying RLS decides who sees rows.
create view public.leaderboard with (security_invoker = on) as
select
  p.id,
  p.display_name,
  p.school_id,
  s.short_name as school_short_name,
  p.rating,
  p.matches_played,
  count(m.id) filter (where m.winner_id = p.id) as wins,
  count(m.id) filter (where m.winner_id <> p.id) as losses
from public.profiles p
join public.schools s on s.id = p.school_id
left join public.matches m
  on m.status = 'confirmed'
  and (m.reporter_id = p.id or m.opponent_id = p.id)
where p.status = 'approved'
group by p.id, s.short_name
order by p.rating desc, wins desc;
