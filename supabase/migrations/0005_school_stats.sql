create view public.school_stats with (security_invoker = on) as
select
  s.id,
  s.name,
  s.short_name,
  count(distinct p.id) as member_count,
  coalesce(round(avg(p.rating)), 0)::int as avg_rating,
  count(m.id) filter (where m.winner_id = p.id) as wins,
  count(m.id) filter (where m.winner_id <> p.id) as losses
from public.schools s
left join public.profiles p
  on p.school_id = s.id and p.status = 'approved'
left join public.matches m
  on m.status = 'confirmed'
  and (m.reporter_id = p.id or m.opponent_id = p.id)
group by s.id
order by avg_rating desc;

create view public.school_head_to_head with (security_invoker = on) as
select
  ws.id as winner_school_id,
  ws.short_name as winner_short_name,
  ls.id as loser_school_id,
  ls.short_name as loser_short_name,
  count(*) as wins
from public.matches m
join public.profiles wp on wp.id = m.winner_id
join public.profiles lp
  on lp.id = case when m.winner_id = m.reporter_id then m.opponent_id else m.reporter_id end
join public.schools ws on ws.id = wp.school_id
join public.schools ls on ls.id = lp.school_id
where m.status = 'confirmed' and wp.school_id <> lp.school_id
group by ws.id, ls.id;
